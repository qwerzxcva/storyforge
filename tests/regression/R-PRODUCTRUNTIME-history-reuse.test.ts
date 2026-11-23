import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_PRODUCT_RUNTIME_STATE, type ProductRuntimeEvent } from '../../src/lib/types'
import {
  parseProductRuntimeCheckpointV1, parseProductRuntimeState, replayProductRuntimeEvents,
} from '../../src/lib/legacy-compat/product/runtime-core'
import { createProductInitialStateV1 } from '../../src/lib/legacy-compat/product/runtime-instances'
import {
  assertProductRuntimeSourceSnapshotV2, productRuntimeSourceSnapshotV2, runtimeSourceManifestFromReleaseV1,
} from '../../src/lib/legacy-compat/product/runtime-source-manifest'
import { parseProductRuntimePackage } from '../../src/lib/legacy-compat/product-production/runtime-package'
import * as adapters from '../../src/lib/legacy-compat/product/runtime-product-adapters'

let scenario = 0
function initial() { return { ...structuredClone(EMPTY_PRODUCT_RUNTIME_STATE), clock: ++scenario * 100 } }
function events(count: number, sessionId = 31): ProductRuntimeEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1, projectId: 2, worldGroupId: null, sessionId,
    sequence: index + 1, type: 'time.advanced', actorKey: null, targetKey: null,
    commandId: null, baseSequence: null, baseStateHash: null,
    payloadJson: JSON.stringify({ amount: 1 }), createdAt: 1000 + index,
  }))
}
afterEach(() => vi.restoreAllMocks())

describe('Product runtime exact verified history prefix reuse', () => {
  it('reduces only new events, returns detached states and preserves exact public results', () => {
    const state = initial(); const history = events(3)
    const spy = vi.spyOn(adapters, 'applyProductOwnedRuntimeEventV1')
    const first = replayProductRuntimeEvents(state, history, 2)
    expect(spy).toHaveBeenCalledTimes(2)
    first.clock = 99999
    spy.mockClear()
    const next = replayProductRuntimeEvents(state, history)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(next.clock).toBe(state.clock + 3)
    next.clock = 12345
    spy.mockClear()
    expect(replayProductRuntimeEvents(state, history).clock).toBe(state.clock + 3)
    expect(spy).not.toHaveBeenCalled()
    expect(replayProductRuntimeEvents(state, history, 2).clock).toBe(state.clock + 2)
    expect(state.lastSequence).toBe(0)
    expect(history[0].payloadJson).toBe('{"amount":1}')
  })
  it('revalidates changed historical payloads and initial state even at the same sequence', () => {
    const state = initial(); const history = events(3)
    replayProductRuntimeEvents(state, history)
    const changed = structuredClone(history); changed[0].payloadJson = '{"amount":8}'
    expect(replayProductRuntimeEvents(state, changed).clock).toBe(state.clock + 10)
    expect(replayProductRuntimeEvents({ ...state, clock: 991 }, history).clock).toBe(994)
    changed[0].payloadJson = '{"amount":0}'
    expect(() => replayProductRuntimeEvents(state, changed)).toThrow('时间推进量')
    expect(replayProductRuntimeEvents(state, history).clock).toBe(state.clock + 3)
  })
  it('does not let a valid cached prefix conceal a missing, duplicated or invalid event', () => {
    const state = initial(); const history = events(3)
    replayProductRuntimeEvents(state, history)
    expect(() => replayProductRuntimeEvents(state, history.slice(1))).toThrow('序号不连续')
    expect(() => replayProductRuntimeEvents(state, [history[0], history[0], history[2]])).toThrow('序号不连续')
    const changed = structuredClone(history); changed[1].type = 'invalid' as ProductRuntimeEvent['type']
    expect(() => replayProductRuntimeEvents(state, changed)).toThrow('未知演化事件类型')
    expect(replayProductRuntimeEvents(state, [...history].reverse()).clock).toBe(state.clock + 3)
  })
  it('revalidates the full event identity on a different session', () => {
    const state = initial(); replayProductRuntimeEvents(state, events(2, 31))
    const spy = vi.spyOn(adapters, 'applyProductOwnedRuntimeEventV1')
    expect(replayProductRuntimeEvents(state, events(2, 99)).clock).toBe(state.clock + 2)
    expect(spy).toHaveBeenCalledTimes(2)
  })
  it('parses legacy runtime state and validates checkpoint fields before replay', () => {
    const original = { ...structuredClone(EMPTY_PRODUCT_RUNTIME_STATE), extraLegacyField: true }
    expect(parseProductRuntimeState(original)).not.toHaveProperty('extraLegacyField')
    expect(() => parseProductRuntimeState('[]')).toThrow(/必须是 JSON 对象/)
    expect(() => parseProductRuntimeState({ ...original, version: 9 })).toThrow(/版本/)
    expect(() => parseProductRuntimeState({ ...original, entities: [] })).toThrow(/entities 必须是对象/)
    expect(() => parseProductRuntimeState({ ...original, memories: {} })).toThrow(/memories 必须是数组/)
    expect(() => parseProductRuntimeState({ ...original, narratives: {} })).toThrow(/narratives 必须是数组/)
    const stateJson = JSON.stringify(EMPTY_PRODUCT_RUNTIME_STATE)
    expect(parseProductRuntimeCheckpointV1({ projectId: 1, worldGroupId: null, sessionId: 2,
      throughSequence: 0, name: 'Manual', stateJson, stateHash: 'a'.repeat(64), createdAt: 1 }))
      .toMatchObject({ purpose: 'manual', subjectKey: null })
    expect(() => parseProductRuntimeCheckpointV1({ projectId: 1, worldGroupId: null, sessionId: 2,
      throughSequence: 0, name: 'bad', stateJson, stateHash: 'bad', createdAt: 1 }))
      .toThrow('检查点状态 Hash 无效。')
  })
  it('creates the frozen initial narrative projection without inventing product-owned state', () => {
    const fixture = readFileSync(new URL('../helpers/fixtures/text-open-world-legacy-runtime-package-v1.json', import.meta.url), 'utf8')
    const runtimePackage = parseProductRuntimePackage(fixture)
    const initialState = createProductInitialStateV1({ runtimePackage, runtimeSourceHash: 'a'.repeat(64) })
    expect(initialState.narrative).toMatchObject({ version: 2, completed: false })
    expect(initialState.town).toBeNull()
    const ending = structuredClone(runtimePackage)
    ending.narrative.nodes = ending.narrative.nodes.map(node => node.key === ending.narrative.entryNodeKey
      ? { ...node, kind: 'ending' } : node)
    expect(createProductInitialStateV1({ runtimePackage: ending, runtimeSourceHash: 'a'.repeat(64) }).narrative)
      .toMatchObject({ completed: true, completedAtSequence: 0 })
    expect(() => createProductInitialStateV1({ runtimePackage: {
      ...runtimePackage, narrative: { ...runtimePackage.narrative, entryNodeKey: 'missing' },
    }, runtimeSourceHash: 'a'.repeat(64) })).toThrow(/入口不存在/)
  })
  it('compares the frozen source snapshot and preserves the legacy release early exit', async () => {
    const hash = 'a'.repeat(64)
    const manifest = { schema: 'storyforge.product-runtime-source-manifest', version: 1,
      productType: 'avg', sourceKind: 'build-preview', sourceIdentityHash: hash, packageHash: hash,
      sourceWorldContentHash: hash, sourcePlanHash: hash, worldReferenceHash: hash,
      inheritedSourceManifestHash: null, readMode: 'frozen-product-package', directWorldReads: [],
      manifestHash: hash } as const
    const snapshot = productRuntimeSourceSnapshotV2(manifest)
    expect(() => assertProductRuntimeSourceSnapshotV2({ canonSnapshot: JSON.stringify(snapshot), manifest })).not.toThrow()
    expect(() => assertProductRuntimeSourceSnapshotV2({ canonSnapshot: { ...snapshot, runtimeSourceHash: 'b'.repeat(64) }, manifest })).toThrow(/不一致/)
    expect(() => assertProductRuntimeSourceSnapshotV2({ canonSnapshot: { ...snapshot, version: 3 }, manifest: null })).toThrow(/增强/)
    expect(() => assertProductRuntimeSourceSnapshotV2({ canonSnapshot: '{', manifest: null })).toThrow(/不是 JSON/)
    const legacyRelease = { sourceContracts: { sourcePlan: { schema: 'legacy' } }, packageHash: hash,
      releaseIdentityHash: hash, runtimePackage: { productType: 'avg', sourceWorld: {} } } as never
    await expect(runtimeSourceManifestFromReleaseV1(legacyRelease)).resolves.toBeNull()
  })
  it('cannot be poisoned by a failed new suffix', () => {
    const state = initial(); const history = events(2)
    replayProductRuntimeEvents(state, history, 1)
    const bad = structuredClone(history); bad[1].payloadJson = '{}'
    expect(() => replayProductRuntimeEvents(state, bad)).toThrow('时间推进量')
    expect(replayProductRuntimeEvents(state, history).clock).toBe(state.clock + 2)
  })
  it.each(['getter', 'toJSON', 'hidden', 'symbol', 'infinity', 'sparse', 'cycle', 'prototype', 'array-properties', 'array-event'] as const)(
    'falls back to complete replay for exotic input %s', (kind) => {
      const state = initial(); const history = events(2)
      const event = history[0] as ProductRuntimeEvent & Record<string | symbol, unknown>
      if (kind === 'getter') Object.defineProperty(event, 'createdAt', { enumerable: true, get: () => 1000 })
      if (kind === 'toJSON') event.toJSON = () => ({ ...events(1)[0], payloadJson: '{"amount":999}' })
      if (kind === 'hidden') Object.defineProperty(event, 'metadata', { value: 'not enumerable' })
      if (kind === 'symbol') event[Symbol('meta')] = true
      if (kind === 'infinity') event.metadata = Infinity
      if (kind === 'sparse') event.metadata = new Array(2)
      if (kind === 'cycle') event.metadata = event
      if (kind === 'prototype') Object.setPrototypeOf(event, { extra: true })
      if (kind === 'array-properties') event.metadata = Object.assign([], { extra: true })
      if (kind === 'array-event') history[0] = Object.assign([], event) as unknown as ProductRuntimeEvent
      const spy = vi.spyOn(adapters, 'applyProductOwnedRuntimeEventV1')
      expect(replayProductRuntimeEvents(state, history).clock).toBe(state.clock + 2)
      spy.mockClear()
      expect(replayProductRuntimeEvents(state, history).clock).toBe(state.clock + 2)
      expect(spy).toHaveBeenCalledTimes(2)
    },
  )
  it('keeps oversize data correct without retaining a cache entry', () => {
    const state = initial(); const history = events(2)
    history[0].payloadJson = JSON.stringify({ amount: 1, unused: 'x'.repeat(2_000_010) })
    const spy = vi.spyOn(adapters, 'applyProductOwnedRuntimeEventV1')
    expect(replayProductRuntimeEvents(state, history).clock).toBe(state.clock + 2)
    spy.mockClear()
    expect(replayProductRuntimeEvents(state, history).clock).toBe(state.clock + 2)
    expect(spy).toHaveBeenCalledTimes(2)
  })
  it('bounds retained prefixes and never treats eviction as a failed replay', () => {
    const states = Array.from({ length: 5 }, initial)
    for (const state of states) replayProductRuntimeEvents(state, events(1))
    const spy = vi.spyOn(adapters, 'applyProductOwnedRuntimeEventV1')
    expect(replayProductRuntimeEvents(states[0], events(1)).clock).toBe(states[0].clock + 1)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
