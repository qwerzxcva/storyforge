import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { seedNarrativeReleaseV4 } from '../helpers/narrative-release-fixture'
import { openAuthorWorldQueryAccessV1, bindWorldQueryResourcesV1, closeWorldQueryAccessV1 } from '../../src/lib/context-gateway/world-query-client'
import { createContextGatewayToolSessionV1 } from '../../src/lib/context-gateway/tool-session'
import { CONTEXT_GATEWAY_READ_TOOLS_V1 } from '../../src/lib/agent/context-gateway-tools'
import { WORLD_RELEASE_RESOURCE_KINDS_V1 } from '../../src/lib/context-gateway/world-release-provider-contract'
import { hashCanonicalValue } from '../../src/lib/agent/run/hash'
import { AGENT_TOOL_SCHEMA_HASH_V1 } from '../../src/lib/agent/execution-binding'
import { getAgentToolSchemaSnapshotV1 } from '../../src/lib/agent/tool-registry'
import type { ContextAccessPolicyV1 } from '../../src/lib/registry/types'

const policy: ContextAccessPolicyV1 = { version: 'context-access-policy-v1', policyId: 'nw2b-tool-test',
  mandatorySourceKeys: ['worldRelease'], allowedSourceKeys: ['worldRelease'], allowedResourceKinds: [...WORLD_RELEASE_RESOURCE_KINDS_V1],
  allowedDepths: ['index', 'summary', 'focused', 'full', 'original'], selectorPolicyId: 'nw2b-tool-test',
  maxReadCalls: 16, maxRetrievedTokens: 100000, allowOriginalRead: true, candidateAccess: 'forbidden' }

async function setup() {
  const fixture = await seedNarrativeReleaseV4()
  const access = await openAuthorWorldQueryAccessV1({ scope: fixture.scope, localReleaseRecordId: fixture.release.id!,
    view: 'canon', perspective: { kind: 'author' }, knowledgeThrough: null, disclosedThrough: null })
  const provider = await bindWorldQueryResourcesV1(access)
  const descriptor = (await provider.listMetadata({ scope: access.scope, limit: 20 })).items[0]
  return { ...fixture, access, provider, descriptor }
}

describe('NW-2B · typed Gateway query and durable actual-read evidence', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(() => db.close())

  it('registered metadata queries cannot self-grant author access or count as original reads', async () => {
    const { access, descriptor } = await setup()
    const session = await createContextGatewayToolSessionV1({ scope: access.scope, policy, worldQueryAccess: access })
    const context = { projectId: access.scope.projectId, contextGatewaySession: session }
    const tool = CONTEXT_GATEWAY_READ_TOOLS_V1.find(item => item.name === 'query_world_release')!
    const result = await tool.execute(context, { text: '守渡人', limit: 1 })
    expect(result.ok, result.error).toBe(true)
    const payload = JSON.parse(result.content)
    expect(payload.result.items[0]).toMatchObject({ atom: null, supportingAtoms: [], depth: 'metadata' })
    expect(payload.result.items[0].evidence.every((item: { text: unknown }) => item.text === null)).toBe(true)
    expect(payload.descriptors[0].resourceKey).toBe(descriptor.resourceKey)
    expect(payload.descriptors[0].authorSource).toEqual(payload.result.items[0].authorSource)
    expect(payload.descriptors[0].authorSource.title).toBe('守渡人')
    expect(result.meta.gateway).toMatchObject({ operation: 'search', sourceRefCapabilities: [], sourceRefEvidence: [] })
    expect(session.capabilities.size).toBe(0)
    for (const extra of [{ perspective: { kind: 'author' } }, { evidenceDepth: 'original' }, { sourcePlanHash: null }]) {
      expect((await tool.execute(context, { ...extra })).ok).toBe(false)
    }
    const narrowed = await createContextGatewayToolSessionV1({ scope: access.scope, policy, worldQueryAccess: access, allowedResourceKeys: [] })
    const hidden = await tool.execute({ ...context, contextGatewaySession: narrowed }, { text: '守渡人' })
    expect(hidden.ok, hidden.error).toBe(true)
    expect(hidden.content).not.toContain(descriptor.resourceKey)
    expect(JSON.parse(hidden.content).result.items).toEqual([])
    expect((await tool.execute({ projectId: access.scope.projectId }, {})).ok).toBe(false)
  })

  it('keeps source metadata outside the exact quote in the registered model read tools', async () => {
    const { access, descriptor } = await setup()
    const session = await createContextGatewayToolSessionV1({ scope: access.scope, policy, worldQueryAccess: access })
    const context = { projectId: access.scope.projectId, contextGatewaySession: session }
    const resource = CONTEXT_GATEWAY_READ_TOOLS_V1.find(item => item.name === 'read_context_resource')!
    const original = CONTEXT_GATEWAY_READ_TOOLS_V1.find(item => item.name === 'read_original_evidence')!
    const read = await resource.execute(context, { resourceKey: descriptor.resourceKey, depth: 'full', maxTokens: 10000 })
    expect(read.ok, read.error).toBe(true)
    const material = JSON.parse(read.content)
    expect(material.descriptor.authorSource.title).toBe('守渡人')
    const quote = await original.execute(context, { sourceRef: material.sourceRefCapabilities[0], maxTokens: 10000 })
    expect(quote.ok, quote.error).toBe(true)
    const evidence = JSON.parse(quote.content)
    expect(evidence.authorSource).toEqual(material.descriptor.authorSource)
    expect(evidence.content).toBe('守渡人')
    expect(evidence.contentHash).toBe(descriptor.sourceRefs[0].contentHash)
    await closeWorldQueryAccessV1(access)
    expect((await original.execute(context, { sourceRef: material.sourceRefCapabilities[0], maxTokens: 10000 })).ok).toBe(false)
  })

  it('pins the changed registered tool schema hash instead of claiming the old tool version', async () => {
    expect(await hashCanonicalValue(getAgentToolSchemaSnapshotV1())).toBe(AGENT_TOOL_SCHEMA_HASH_V1)
  })
})
