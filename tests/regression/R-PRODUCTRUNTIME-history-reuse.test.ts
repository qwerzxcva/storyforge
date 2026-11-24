import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_PRODUCT_RUNTIME_STATE, type ProductRuntimeEvent, type ProductRuntimeSourceManifestV1 } from '../../src/lib/types'
import {
  applyProductRuntimeEvent, parseProductRuntimeCheckpointV1, parseProductRuntimeState, replayProductRuntimeEvents,
} from '../../src/lib/legacy-compat/product/runtime-core'
import { createProductInitialStateV1 } from '../../src/lib/legacy-compat/product/runtime-instances'
import {
  assertProductRuntimeSourceSnapshotV2, productRuntimeSourceSnapshotV2,
  runtimeSourceManifestFromBuildRecordsV1, runtimeSourceManifestFromReleaseV1,
} from '../../src/lib/legacy-compat/product/runtime-source-manifest'
import { parseProductRuntimePackage } from '../../src/lib/legacy-compat/product-production/runtime-package'
import { hashProductProductionValueV2 } from '../../src/lib/legacy-compat/product-production/hash'
import * as adapters from '../../src/lib/legacy-compat/product/runtime-product-adapters'
import { verifyProductOwnedBranchOriginV1 } from '../../src/lib/legacy-compat/product/runtime-branch-origin'
import { assertProductRuntimeSourceSnapshotV3 } from '../../src/lib/legacy-compat/product/runtime-source-branch'

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
  it('preserves the legacy non-AVG source path and rejects malformed AVG branch evidence', async () => {
    await expect(verifyProductOwnedBranchOriginV1({
      kind: 'character-interaction', initialState: {}, canonSnapshotJson: '{}', runtimeSourceHash: 'a'.repeat(64),
    })).resolves.toBe(false)
    await expect(verifyProductOwnedBranchOriginV1({
      kind: 'avg', initialState: {}, canonSnapshotJson: JSON.stringify({ avgBranchOrigin: {} }), runtimeSourceHash: 'a'.repeat(64),
    })).rejects.toThrow('AVG branch origin 字段不完整')
  })

  it('preserves legacy non-AVG source validation and enforces frozen AVG V3 branch evidence', async () => {
    await expect(assertProductRuntimeSourceSnapshotV3({
      session: { kind: 'character-interaction', canonSnapshotJson: '{}', initialStateJson: '{}', runtimeSourceHash: 'a'.repeat(64) },
      manifest: null,
    })).resolves.toBeUndefined()
    await expect(assertProductRuntimeSourceSnapshotV3({
      session: { kind: 'avg', canonSnapshotJson: JSON.stringify({
        schema: 'storyforge.product-runtime-source', version: 3,
        source: {}, avgBranchOrigin: {},
      }), initialStateJson: '{}', runtimeSourceHash: 'a'.repeat(64) },
      manifest: null,
    })).rejects.toThrow('[product-runtime-source-manifest]')

    const hash = 'a'.repeat(64)
    const manifest: ProductRuntimeSourceManifestV1 = { schema: 'storyforge.product-runtime-source-manifest', version: 1,
      productType: 'avg', sourceKind: 'build-preview', sourceIdentityHash: hash, packageHash: hash,
      sourceWorldContentHash: hash, sourcePlanHash: hash, worldReferenceHash: hash,
      inheritedSourceManifestHash: null, readMode: 'frozen-product-package', directWorldReads: [],
      manifestHash: hash } as const
    const initialState = { ...structuredClone(EMPTY_PRODUCT_RUNTIME_STATE), avgRules: { schema: 'storyforge.avg.rules-state', version: 1 } }
    const body = { schema: 'storyforge.avg.branch-origin', version: 1,
      runtimeSourceHash: hash, initialStateHash: await hashProductProductionValueV2(initialState),
      parentInitialStateHash: hash, parentEventPrefixHash: hash, parentThroughSequence: 0 }
    const record = { ...body, receiptHash: await hashProductProductionValueV2(body) }
    const source = productRuntimeSourceSnapshotV2(manifest)
    const session = { kind: 'avg' as const, canonSnapshotJson: JSON.stringify({
      schema: 'storyforge.product-runtime-source', version: 3, source, avgBranchOrigin: record,
    }), initialStateJson: JSON.stringify(initialState), runtimeSourceHash: hash }
    await expect(assertProductRuntimeSourceSnapshotV3({ session, manifest })).resolves.toBeUndefined()
    const mismatchedBody = { ...body, runtimeSourceHash: 'b'.repeat(64) }
    const mismatchedRecord = { ...mismatchedBody, receiptHash: await hashProductProductionValueV2(mismatchedBody) }
    const snapshot = { schema: 'storyforge.product-runtime-source', version: 3, source, avgBranchOrigin: record }
    const validate = (patch: Partial<typeof session>) =>
      assertProductRuntimeSourceSnapshotV3({ session: { ...session, ...patch }, manifest })
    await expect(validate({ canonSnapshotJson: JSON.stringify({ ...snapshot, avgBranchOrigin: mismatchedRecord }) }))
      .rejects.toThrow('[avg-branch-origin]')
    await expect(validate({ canonSnapshotJson: '{' })).rejects.toThrow(/会话来源快照不是 JSON/)
    await expect(validate({ runtimeSourceHash: 'b'.repeat(64) })).rejects.toThrow(/增强分支来源的产品或字段不一致/)
    await expect(assertProductRuntimeSourceSnapshotV3({ session: { ...session, kind: 'character-interaction' }, manifest }))
      .rejects.toThrow(/增强分支来源的产品或字段不一致/)
    await expect(validate({ canonSnapshotJson: JSON.stringify({ ...snapshot, extra: true }) }))
      .rejects.toThrow(/增强分支来源的产品或字段不一致/)
    await expect(validate({ canonSnapshotJson: JSON.stringify({ ...snapshot, source: { ...source, sourceWorldContentHash: 'b'.repeat(64) } }) }))
      .rejects.toThrow(/实际读取记录不一致/)
    await expect(validate({ initialStateJson: '{}' })).rejects.toThrow(/缺少准确私域来源/)
    await expect(validate({ initialStateJson: 'null' })).rejects.toThrow(/缺少准确私域来源/)
    await expect(validate({ initialStateJson: JSON.stringify({ ...initialState, clock: 1 }) })).rejects.toThrow('[avg-branch-origin]')
    const readingState = { lastSequence: 0, avgReading: { schema: 'storyforge.avg.reading-state', version: 1 } }
    const readingBody = { ...body, initialStateHash: await hashProductProductionValueV2(readingState) }
    const readingOrigin = { ...readingBody, receiptHash: await hashProductProductionValueV2(readingBody) }
    await expect(validate({
      initialStateJson: JSON.stringify(readingState),
      canonSnapshotJson: JSON.stringify({ ...snapshot, avgBranchOrigin: readingOrigin }),
    })).resolves.toBeUndefined()
    await expect(validate({ canonSnapshotJson: JSON.stringify(source) })).resolves.toBeUndefined()
  })

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
    const originalJson = JSON.parse(JSON.stringify(original)) as Record<string, unknown>
    expect(() => parseProductRuntimeState(JSON.stringify({ ...originalJson, version: 9 }))).toThrow(/版本/)
    expect(() => parseProductRuntimeState(JSON.stringify({ ...originalJson, entities: [] }))).toThrow(/entities 必须是对象/)
    expect(() => parseProductRuntimeState(JSON.stringify({ ...originalJson, entities: { alias: {
      entityKey: 'canonical', kind: 'character', name: '角色', lifecycleStatus: 'active', attributes: {},
    } } }))).toThrow(/实体索引与 entityKey 不一致/)
    expect(() => parseProductRuntimeState(JSON.stringify({ ...originalJson, memories: {} }))).toThrow(/memories 必须是数组/)
    expect(() => parseProductRuntimeState(JSON.stringify({ ...originalJson, memories: [{
      id: 'memory', subjectKey: 'character', content: '记忆', status: 'unknown', sourceEventSequence: 1,
    }] }))).toThrow(/未知运行时记忆状态/)
    expect(() => parseProductRuntimeState(JSON.stringify({ ...originalJson, narratives: {} }))).toThrow(/narratives 必须是数组/)
    expect(() => parseProductRuntimeState(JSON.stringify({ ...originalJson, narratives: [{ eventSequence: 1, text: '  ' }] })))
      .toThrow(/运行时叙事文本无效/)
    const stateJson = JSON.stringify(EMPTY_PRODUCT_RUNTIME_STATE)
    expect(parseProductRuntimeCheckpointV1({ projectId: 1, worldGroupId: null, sessionId: 2,
      throughSequence: 0, name: 'Manual', stateJson, stateHash: 'a'.repeat(64), createdAt: 1 }))
      .toMatchObject({ purpose: 'manual', subjectKey: null })
    expect(() => parseProductRuntimeCheckpointV1({ projectId: 1, worldGroupId: null, sessionId: 2,
      throughSequence: 0, name: 'bad', stateJson, stateHash: 'bad', createdAt: 1 }))
      .toThrow('检查点状态 Hash 无效。')
  })
  it('normalizes serialized legacy runtime records and rejects invalid entity and memory fields', () => {
    const entity = { entityKey: 'character', name: '  Guide  ', kind: 'character', lifecycleStatus: 'active',
      sourceId: 7, locationKey: '  archive  ', attributes: { trust: 2, friendly: true, occupation: 'guide', clue: null } }
    const memory = { id: ' past ', subjectKey: ' character ', content: ' Found the key ', status: 'known', sourceEventSequence: 2 }
    const source = { ...EMPTY_PRODUCT_RUNTIME_STATE, clock: 4, lastSequence: 3, entities: { character: entity },
      memories: [memory], narratives: [{ text: ' The door opens. ', eventSequence: 3 }] }
    expect(parseProductRuntimeState(JSON.stringify(source))).toEqual({ ...EMPTY_PRODUCT_RUNTIME_STATE, clock: 4, lastSequence: 3,
      entities: { character: { ...entity, name: 'Guide', locationKey: 'archive' } },
      memories: [{ ...memory, id: 'past', subjectKey: 'character', content: 'Found the key' }],
      narratives: [{ text: 'The door opens.', eventSequence: 3 }] })
    expect(parseProductRuntimeState(JSON.stringify({ ...source, entities: { character: { ...entity, locationKey: ' ' } } }))
      .entities.character.locationKey).toBeNull()
    const invalidEntities = [
      [null, /运行时实体必须是对象/],
      [{ ...entity, entityKey: ' ' }, /entityKey/],
      [{ ...entity, name: '' }, /有效名称/],
      [{ ...entity, kind: 'unknown' }, /未知运行时实体类型/],
      [{ ...entity, lifecycleStatus: 'unknown' }, /未知运行时生命周期/],
      [{ ...entity, attributes: [] }, /attributes 必须是对象/],
      [{ ...entity, attributes: { ' ': true } }, /属性键无效/],
      [{ ...entity, attributes: { trust: { value: 2 } } }, /只能是标量/],
    ] as const
    for (const [invalid, error] of invalidEntities) {
      expect(() => parseProductRuntimeState(JSON.stringify({ ...source, entities: { character: invalid } }))).toThrow(error)
    }
    for (const [invalid, error] of [
      [null, /运行时记忆必须是对象/],
      [{ ...memory, id: '' }, /缺少有效 id/],
      [{ ...memory, subjectKey: '' }, /缺少主体/],
      [{ ...memory, content: '' }, /记忆内容无效/],
    ] as const) {
      expect(() => parseProductRuntimeState(JSON.stringify({ ...source, memories: [invalid] }))).toThrow(error)
    }
    expect(() => parseProductRuntimeState(JSON.stringify({ ...source, narratives: [null] })))
      .toThrow(/叙事记录必须是对象/)
  })

  it('replays entity and memory changes without allowing invalid patches or fabricated event references', () => {
    const entity = { entityKey: 'guide', kind: 'character', name: 'Guide', lifecycleStatus: 'active', attributes: { trust: 1 } }
    const memory = { id: 'key', subjectKey: 'guide', content: 'Look in the archive', status: 'known', sourceEventSequence: 4 }
    const event = (sequence: number, type: ProductRuntimeEvent['type'], payload: object): ProductRuntimeEvent => ({
      ...events(1)[0], sequence, type, payloadJson: JSON.stringify(payload),
    })
    const inserted = applyProductRuntimeEvent(EMPTY_PRODUCT_RUNTIME_STATE, event(1, 'entity.upserted', { entity }))
    const history = [event(1, 'entity.upserted', { entity }),
      event(2, 'entity.patched', { entityKey: 'guide', patch: { name: 'Archivist', attributes: { hasKey: true } } }),
      event(3, 'entity.patched', { entityKey: 'guide', patch: { locationKey: 'archive' } }),
      event(4, 'memory.recorded', { memory }),
      event(5, 'memory.recorded', { memory: { ...memory, status: 'forgotten', sourceEventSequence: 5 } }),
      event(6, 'narrative.recorded', { text: '  The key is returned.  ' })]
    const replayed = replayProductRuntimeEvents(EMPTY_PRODUCT_RUNTIME_STATE, history)
    expect(replayed.entities.guide).toEqual({ ...entity, sourceId: null, name: 'Archivist', locationKey: 'archive', attributes: { trust: 1, hasKey: true } })
    expect(replayed.memories).toEqual([{ ...memory, status: 'forgotten', sourceEventSequence: 5 }])
    expect(replayed.narratives).toEqual([{ eventSequence: 6, text: 'The key is returned.' }])
    expect(applyProductRuntimeEvent(replayed, event(7, 'entity.removed', { entityKey: 'guide' })).entities).toEqual({})
    expect(replayed.entities.guide.name).toBe('Archivist')
    expect(inserted.entities.guide.name).toBe('Guide')
    for (const [invalid, error] of [
      [event(2, 'entity.patched', { entityKey: 'missing', patch: {} }), /实体不存在/],
      [event(2, 'entity.patched', { entityKey: 'guide', patch: [] }), /实体补丁必须是对象/],
      [event(2, 'entity.patched', { entityKey: 'guide', patch: { sourceId: 4 } }), /实体补丁禁止字段: sourceId/],
      [event(2, 'entity.removed', {}), /实体不存在/],
      [event(2, 'memory.recorded', { memory }), /必须引用自身事件序号/],
      [event(2, 'narrative.recorded', { text: ' ' }), /叙事文本无效/],
    ] as const) expect(() => applyProductRuntimeEvent(inserted, invalid)).toThrow(error)
    expect(() => applyProductRuntimeEvent({ ...inserted, clock: Number.MAX_SAFE_INTEGER }, event(2, 'time.advanced', { amount: 1 })))
      .toThrow(/运行时时钟溢出/)
  })

  it('creates a legacy character-interaction release state from its frozen profile', () => {
    const packagePath = 'tests/helpers/fixtures/text-open-world-legacy-runtime-package-v1.json'
    const fixture = JSON.parse(readFileSync(packagePath, 'utf8'))
    fixture.productType = 'character-interaction'
    fixture.definition.enabledCapabilities = ['narrative', 'interaction']
    fixture.sourceWorld.selection.productType = 'character-interaction'
    delete fixture.adventure
    delete fixture.openWorldEvolution
    delete fixture.openWorld
    const runtimePackage = parseProductRuntimePackage(fixture)
    const initialState = createProductInitialStateV1({ runtimePackage, runtimeSourceHash: 'a'.repeat(64) })
    expect(initialState.interaction?.profiles).toHaveLength(1)
    expect(parseProductRuntimeState(initialState).interaction?.profiles).toHaveLength(1)
    expect(initialState.adventure).toBeNull()
  })

  it('creates the frozen initial narrative projection without inventing product-owned state', () => {
    const fixture = readFileSync('tests/helpers/fixtures/text-open-world-legacy-runtime-package-v1.json', 'utf8')
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
    const manifest: ProductRuntimeSourceManifestV1 = { schema: 'storyforge.product-runtime-source-manifest', version: 1,
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
  it('preserves legacy preview source records but refuses a downgraded enhanced selection', async () => {
    const hash = 'a'.repeat(64)
    const brief = { briefKind: 'product-production-v3' as const, sourcePlanJson: '{"version":1}',
      sourcePlanHash: hash, briefHash: hash, briefJson: '{}' }
    const build = { briefHash: hash, previewHash: hash, packageHash: hash, manifestHash: hash,
      previewManifestJson: '{"runtimePackage":{"sourceWorld":{"selection":{"version":1}}}}' }
    await expect(runtimeSourceManifestFromBuildRecordsV1({ build, brief })).resolves.toBeNull()
    await expect(runtimeSourceManifestFromBuildRecordsV1({ build: { ...build, previewManifestJson: '{}' }, brief })).resolves.toBeNull()
    await expect(runtimeSourceManifestFromBuildRecordsV1({
      build: { ...build, previewManifestJson: '{' },
      brief: { ...brief, briefKind: 'text-open-world-creator-v1', sourcePlanJson: '{' },
    })).resolves.toBeNull()
    await expect(runtimeSourceManifestFromBuildRecordsV1({ build, brief: { ...brief, sourcePlanJson: '{' } }))
      .rejects.toThrow(/预览来源计划不是 JSON/)
    await expect(runtimeSourceManifestFromBuildRecordsV1({
      build: { ...build, previewManifestJson: '{"runtimePackage":{"sourceWorld":{"selection":{"version":2}}}}' }, brief,
    })).rejects.toThrow(/增强选择不能降级为旧来源计划/)
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
