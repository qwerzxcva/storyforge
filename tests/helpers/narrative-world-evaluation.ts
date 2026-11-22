import { seedNarrativeFamily, type NarrativeFamily } from './narrative-world-fixture'
import { db } from '../../src/lib/db/schema'
import { createWorldRevision } from '../../src/lib/world-engine/releases'
import {
  describeWorldReleaseV1, listAllWorldReleaseResourceDescriptorsV1, readWorldOriginalEvidenceV1,
  readWorldResourceV1, searchWorldReleaseV1, WORLD_RELEASE_RESOURCE_PROVIDER_V1, WorldReleaseResourceProviderErrorV1,
} from '../../src/lib/context-gateway/world-release-provider'
import { buildEditImpactGraphV1, propagateChapterEditStale } from '../../src/lib/consistency/impact-analysis'
import { getUpperProductWorldRequirementAdapterV1 } from '../../src/lib/product/world-requirement-adapters'
import { freezeProductSourcePlanV1, resolveProductSourceReadBoundaryV1 } from '../../src/lib/product/source-contracts'
import { resolveProductProductionWorldCompilationDescriptorsV2 } from '../../src/lib/product-production/world-source'
import type { ResourceSearchInputV1 } from '../../src/lib/registry/types'
import type { ProductionProductKindV1 } from '../../src/lib/types'

export { seedNarrativeFamily, type NarrativeFamily } from './narrative-world-fixture'
type Query = NarrativeFamily['queries'][number]
export type BaselineObservation = {
  id: string
  family: string
  split: string
  operation: string
  status: 'pass' | 'gap' | 'unsupported'
  expected: unknown
  observed: unknown
  evidence: string[]
  issue: string | null
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`NW-0B evaluator invariant: ${message}`)
}
const sorted = (items: readonly string[]) => [...items].sort()
const equalSet = (a: readonly string[], b: readonly string[]) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

type Fixture = Awaited<ReturnType<typeof seedNarrativeFamily>>
const queryIssues: Record<string, string> = {
  'body-search': 'NW-G03', 'entity-filter': 'NW-G01', 'arc-filter': 'NW-G01', 'chapter-cutoff': 'NW-G01',
  'character-knowledge-scope': 'NW-G02', 'causal-query': 'NW-G08', 'development-query': 'NW-G08', 'hypothesis-query': 'NW-G09',
}

async function observeQuery(family: NarrativeFamily, fixture: Fixture, query: Query): Promise<BaselineObservation> {
  const base = { id: query.id, family: family.id, split: family.split, operation: query.operation,
    expected: sorted(query.expectedResourceIds), evidence: query.evidence.map(span => span.spanHash) }
  const requiredMethod = ({ 'causal-query': 'query', 'development-query': 'query', 'hypothesis-query': 'simulate' } as Record<string, string>)[query.operation]
  if (requiredMethod) {
    check(!(requiredMethod in WORLD_RELEASE_RESOURCE_PROVIDER_V1), `${requiredMethod} appeared; add its real evaluator before updating this baseline`)
    return { ...base, status: 'unsupported', observed: { missingOperation: requiredMethod,
      exposedMethods: Object.keys(WORLD_RELEASE_RESOURCE_PROVIDER_V1).filter(key => typeof (WORLD_RELEASE_RESOURCE_PROVIDER_V1 as any)[key] === 'function').sort() },
    issue: queryIssues[query.operation]! }
  }
  let observed: string[]
  try {
  if (query.operation === 'original-read') {
    const target = fixture.descriptor(query.expectedResourceIds[0]!)
    const response = await readWorldOriginalEvidenceV1({ scope: fixture.resourceScope, resourceKey: target.resourceKey,
      sourceRef: target.sourceRefs[0]!, maxTokens: 20_000 })
    const value = JSON.parse(response.content) as { content: string }
    observed = query.evidence.every(span => value.content.includes(span.quote)) ? [query.expectedResourceIds[0]!] : []
  } else if (query.operation === 'character-knowledge-scope') {
    const resources = await listAllWorldReleaseResourceDescriptorsV1({ ...fixture.resourceScope,
      characterId: fixture.localIds.get(query.holderId!) })
    observed = fixture.logicalKeys(resources.filter(d => d.worldSemantic?.resourceKind === 'knowledge-event'))
  } else {
    const input: ResourceSearchInputV1 = { scope: fixture.resourceScope, query: query.search!, limit: 100,
      kinds: query.operation === 'entity-filter' ? ['character'] : query.operation === 'arc-filter' ? ['story-arc'] : ['chapter'] }
    if (query.operation === 'entity-filter') input.entityKeys = [fixture.descriptor(query.entityId!).resourceKey]
    if (query.operation === 'arc-filter') input.storyArcKeys = [fixture.descriptor(query.arcId!).resourceKey]
    if (query.operation === 'chapter-cutoff') input.timeRange = { throughChapterId: fixture.localIds.get(query.throughId!) }
    const page = await searchWorldReleaseV1(input)
    check(!page.nextCursor, 'fixture unexpectedly exceeds a single result page')
    observed = fixture.logicalKeys(page.items)
  }
  } catch (error) {
    // A legacy provider that explicitly refuses an unimplemented filter is
    // safer than silently ignoring it, but is still not a successful query.
    if (!(error instanceof WorldReleaseResourceProviderErrorV1) || error.code !== 'unsupported') throw error
    return { ...base, status: 'unsupported', observed: { rejectedOperation: query.operation, code: error.code },
      issue: queryIssues[query.operation] ?? 'NW-REGRESSION' }
  }
  const passed = equalSet(observed, query.expectedResourceIds)
  return { ...base, observed, status: passed ? 'pass' : 'gap', issue: passed ? null : queryIssues[query.operation] ?? 'NW-REGRESSION' }
}

/** Literal full-text reference baseline, deliberately no semantic answers,
 * perspective inference, temporal filtering, vectors, or synthetic model. */
function observeLexical(family: NarrativeFamily, query: Query): BaselineObservation | null {
  if (!['metadata-search', 'body-search'].includes(query.operation)) return null
  const term = query.search!.toLocaleLowerCase('zh-CN')
  const observed = family.sources.filter(s => s.kind === 'chapter'
    && `${s.title}\n${s.text}`.toLocaleLowerCase('zh-CN').includes(term)).map(s => s.id)
  const pass = equalSet(observed, query.expectedResourceIds)
  return { id: `${query.id}:lexical`, family: family.id, split: family.split, operation: 'literal-fulltext-reference',
    expected: sorted(query.expectedResourceIds), observed: sorted(observed), status: pass ? 'pass' : 'gap',
    evidence: query.evidence.map(e => e.spanHash), issue: pass ? null : 'NW-REFERENCE-GAP' }
}

export async function evaluateNarrativeFamily(family: NarrativeFamily) {
  const fixture = await seedNarrativeFamily(family)
  const queries: BaselineObservation[] = []
  const lexical: BaselineObservation[] = []
  for (const query of family.queries) {
    queries.push(await observeQuery(family, fixture, query))
    const result = observeLexical(family, query)
    if (result) lexical.push(result)
  }
  const edits: Array<BaselineObservation & { truePositive: number; falsePositive: number; falseNegative: number;
    lockedPreserved: boolean; sourceFactStatus: string; frozenReleaseUnchanged: boolean; otherWorkPreserved: boolean }> = []
  for (const edit of family.edits) {
    const original = family.sources.find(s => s.id === edit.sourceId)!
    const chapterId = fixture.localIds.get(edit.sourceId)!
    await db.chapters.update(chapterId, { content: original.text.replace(edit.before, edit.after) })
    const graph = await buildEditImpactGraphV1(fixture.scope, chapterId)
    await propagateChapterEditStale(fixture.scope, chapterId)
    const observed = family.sources.filter(s => s.kind === 'chapter'
      && graph.downstreamChapterIds.includes(fixture.localIds.get(s.id)!)).map(s => s.id)
    const truePositive = observed.filter(id => edit.mustReview.includes(id)).length
    const falsePositive = observed.filter(id => !edit.mustReview.includes(id)).length
    const falseNegative = edit.mustReview.filter(id => !observed.includes(id)).length
    const locked = await db.temporalFacts.get(fixture.factIds.get('locked')!)
    const changedFact = await db.temporalFacts.get(fixture.factIds.get('confirmed')!)
    const release = await db.worldReleases.get(fixture.release.id!)
    const foreignFact = await db.temporalFacts.get(fixture.foreignFactId)
    const foreignAfter = JSON.stringify({ chapter: await db.chapters.get(fixture.foreignChapterId), fact: foreignFact })
    const otherWorkPreserved = !graph.downstreamChapterIds.includes(fixture.foreignChapterId) && foreignAfter === fixture.foreignBefore
    const lockedPreserved = locked?.locked === true && locked.status === 'confirmed' && locked.value === family.seed.lockedQuote
    const frozenReleaseUnchanged = release?.contentHash === fixture.release.contentHash && release.manifestJson === fixture.release.manifestJson
    check(lockedPreserved && frozenReleaseUnchanged && otherWorkPreserved, 'impact evaluation crossed a protected boundary')
    const pass = equalSet(observed, edit.mustReview)
    edits.push({ id: edit.id, family: family.id, split: family.split, operation: `impact:${edit.kind}`,
      expected: sorted(edit.mustReview), observed: sorted(observed), status: pass ? 'pass' : 'gap',
      evidence: [edit.evidence.spanHash, ...edit.dependencyEvidence.map(e => e.spanHash)], issue: pass ? null : 'NW-G07',
      truePositive, falsePositive, falseNegative, lockedPreserved, sourceFactStatus: changedFact!.status, frozenReleaseUnchanged, otherWorkPreserved })
    await db.chapters.update(chapterId, { content: original.text })
    await db.temporalFacts.update(fixture.factIds.get('confirmed')!, { status: 'confirmed' })
  }
  const controls = await observeControls(family, fixture)
  return { queries, lexical, edits, controls }
}

async function observeControls(family: NarrativeFamily, fixture: Fixture) {
  const result: BaselineObservation[] = []
  function add(suffix: string, operation: string, expected: unknown, observed: unknown, issue: string | null = null,
    pass = JSON.stringify(expected) === JSON.stringify(observed)) {
    result.push({ id: `${family.id}:control:${suffix}`, family: family.id, split: family.split, operation,
      expected, observed, status: pass ? 'pass' : 'gap', evidence: [family.queries[0]!.evidence[0]!.spanHash], issue: pass ? null : issue ?? 'NW-REGRESSION' })
  }
  function unsupported(suffix: string, expected: unknown) {
    result.push({ id: `${family.id}:control:${suffix}`, family: family.id, split: family.split, operation: 'knowledge-scope',
      expected, observed: { code: 'unsupported', boundary: 'legacy-v3-has-no-perspective-grant' }, status: 'unsupported',
      evidence: [family.queries[0]!.evidence[0]!.spanHash], issue: 'NW-G02' })
  }
  const facts = [...fixture.originals.values()].filter(row => typeof row.subjectName === 'string' && String(row.subjectName).startsWith(`${family.id}:`))
  add('candidate-isolation', 'release-authority', ['confirmed', 'confirmed', 'confirmed'], facts.map(r => String(r.status)).sort())
  add('historical-state', 'release-history', true, fixture.byLogical.has(`${family.id}:fact-superseded`), 'NW-G04')
  const planned = fixture.descriptor(`${family.id}:planned`)
  add('intent-authority', 'release-authority', 'intent', planned.authority, 'NW-G05')
  const belief = fixture.descriptor(`${family.id}:knowledge-a`)
  add('belief-authority', 'release-authority', 'character-belief', belief.authority, 'NW-G05')
  const originalBelief = fixture.originals.get(`${family.id}:knowledge-a`)!
  add('belief-value-retained', 'release-preservation', family.seed.belief, originalBelief.belief)
  try {
    const noKnowledge = await listAllWorldReleaseResourceDescriptorsV1({ ...fixture.resourceScope, characterId: null })
    add('null-character-knowledge', 'knowledge-scope', 0,
      noKnowledge.filter(d => d.worldSemantic?.resourceKind === 'knowledge-event').length, 'NW-G02')
  } catch (error) {
    if (!(error instanceof WorldReleaseResourceProviderErrorV1) || error.code !== 'unsupported') throw error
    unsupported('null-character-knowledge', 0)
  }
  let otherHolderDenied: boolean | null = false
  const otherHolder = fixture.descriptor(`${family.id}:knowledge-b`)
  try { await readWorldOriginalEvidenceV1({ scope: { ...fixture.resourceScope, characterId: fixture.localIds.get(`${family.id}:character-a`) },
    resourceKey: otherHolder.resourceKey, sourceRef: otherHolder.sourceRefs[0]!, maxTokens: 20_000 }) }
  catch (error) {
    if (error instanceof WorldReleaseResourceProviderErrorV1 && error.code === 'unsupported') {
      unsupported('other-holder-original', true); otherHolderDenied = null
    } else otherHolderDenied = /scope|permission|not-found|forbidden/.test(String(error))
  }
  if (otherHolderDenied !== null) add('other-holder-original', 'knowledge-scope', true, otherHolderDenied, 'NW-G02')
  const target = fixture.descriptor(`${family.id}:chapter-1`)
  for (const [depth, read] of [
    ['index', () => readWorldResourceV1({ scope: fixture.resourceScope, resourceKey: target.resourceKey, depth: 'index', maxTokens: 1 })],
    ['original', () => readWorldOriginalEvidenceV1({ scope: fixture.resourceScope, resourceKey: target.resourceKey, sourceRef: target.sourceRefs[0]!, maxTokens: 1 })],
  ] as const) {
    if (depth === 'index') {
      const expected = 'tokenCount <= 1 or explicit budget refusal'
      try {
        const response = await read()
        add('budget-index', 'budget-bound', expected, response.tokenCount, 'NW-G10', response.tokenCount <= 1)
      } catch (error) {
        if (!(error instanceof WorldReleaseResourceProviderErrorV1) || error.code !== 'budget') throw error
        add('budget-index', 'budget-bound', expected, { status: 'refused', code: error.code }, 'NW-G10', true)
      }
    } else {
      let rejected = false
      try { await read() } catch (error) { rejected = String(error).includes('original-budget') }
      add('budget-original', 'budget-bound', true, rejected)
    }
  }
  let wrongScopeRejected = false
  try { await describeWorldReleaseV1({ ...fixture.resourceScope, projectId: fixture.scope.projectId + 999 }) }
  catch (error) { wrongScopeRejected = String(error).includes('scope') }
  add('wrong-owner', 'owner-isolation', true, wrongScopeRejected)
  const description = await describeWorldReleaseV1(fixture.resourceScope)
  // This legacy flag advertises populated metadata, not semantic or body search.
  add('metadata-index-available', 'metadata-capability', true,
    description.capabilities.find(c => c.area === 'manuscript')!.queryableIndexAvailable)
  let badRefRejected = false
  try { await readWorldOriginalEvidenceV1({ scope: fixture.resourceScope, resourceKey: target.resourceKey,
    sourceRef: { ...target.sourceRefs[0]!, contentHash: '0'.repeat(64) }, maxTokens: 20_000 }) }
  catch (error) { badRefRejected = String(error).includes('source-ref') }
  add('tampered-evidence', 'evidence-integrity', true, badRefRejected)
  const firstPage = await searchWorldReleaseV1({ scope: fixture.resourceScope, query: family.title, kinds: ['chapter'], limit: 1 })
  check(firstPage.nextCursor, 'pagination positive control needs two rows')
  let changedFilterRejected = false
  try { await searchWorldReleaseV1({ scope: fixture.resourceScope, query: family.title, kinds: ['chapter'], limit: 1,
    cursor: firstPage.nextCursor, entityKeys: [fixture.descriptor(`${family.id}:character-a`).resourceKey] }) }
  catch (error) { changedFilterRejected = String(error).includes('cursor') }
  add('cursor-filter-integrity', 'evidence-integrity', true, changedFilterRejected)
  const forbiddenTables = ['agentRunArtifacts', 'productRuntimeSessions', 'productMediaAssets', 'retrievalChunks']
  const rejectedTables: string[] = []
  for (const table of forbiddenTables) {
    try { await createWorldRevision({ scope: fixture.scope, label: 'must-not-publish', selectedTables: [table] }) }
    catch (error) { if (String(error).includes('未登记为可发布')) rejectedTables.push(table) }
  }
  add('hypothesis-private-tables', 'release-owner-boundary', forbiddenTables, rejectedTables)
  return result
}

export async function evaluateAdapterBaselines(family: NarrativeFamily) {
  const fixture = await seedNarrativeFamily(family)
  const observations: BaselineObservation[] = []
  const selected = ['character-a', 'character-b'].map(s => fixture.descriptor(`${family.id}:${s}`).resourceKey)
  for (const productType of ['character-interaction', 'ttrpg', 'ai-town', 'text-adventure', 'avg', 'text-open-world'] as ProductionProductKindV1[]) {
    const adapter = getUpperProductWorldRequirementAdapterV1(productType)
    const goal = { selectedAreas: ['characters'] as const, selectedResourceKinds: ['character'], selectedContextKinds: ['character'] as const,
      selectedResourceCount: selected.length, participantCount: 0, includeSelectedRelations: false, inheritStoryContinuity: false, allowCrossWorld: false }
    const plan = await freezeProductSourcePlanV1({ productInstanceKey: `nw0b:${productType}`, worldReference: fixture.reference,
      adapter, goal: { ...goal, selectedAreas: [...goal.selectedAreas], selectedContextKinds: [...goal.selectedContextKinds] },
      missingStrategy: 'block', initialResourceKeys: selected, createdAt: 100 })
    const boundary = await resolveProductSourceReadBoundaryV1(plan)
    const actual = fixture.logicalKeys(fixture.descriptors.filter(d => boundary.mandatoryResourceKeys.includes(d.resourceKey)))
    const expected = selected.map(key => fixture.byKey.get(key)!).sort()
    observations.push({ id: `adapter:${productType}:selected`, family: family.id, split: family.split,
      operation: 'generic-source-plan-selected-completeness', status: equalSet(actual, expected) ? 'pass' : 'gap', expected,
      observed: actual, evidence: [family.queries[3]!.evidence[0]!.spanHash], issue: equalSet(actual, expected) ? null : 'NW-G06' })
    const countOnlyPlan = await freezeProductSourcePlanV1({ productInstanceKey: `nw0b-count:${productType}`, worldReference: fixture.reference,
      adapter, goal: { ...goal, selectedAreas: [...goal.selectedAreas], selectedContextKinds: [...goal.selectedContextKinds] },
      missingStrategy: 'block', createdAt: 100 })
    const countOnlyBoundary = await resolveProductSourceReadBoundaryV1(countOnlyPlan)
    const sufficient = countOnlyBoundary.mandatoryResourceKeys.length >= selected.length
    observations.push({ id: `adapter:${productType}:count-only`, family: family.id, split: family.split,
      operation: 'source-plan-count-only-completeness', status: sufficient ? 'pass' : 'gap',
      expected: { minimumSelectedCount: selected.length }, observed: { mandatoryCount: countOnlyBoundary.mandatoryResourceKeys.length },
      evidence: [family.queries[3]!.evidence[0]!.spanHash], issue: sufficient ? null : 'NW-G06' })
    const compilation = resolveProductProductionWorldCompilationDescriptorsV2({ descriptors: fixture.descriptors as any,
      selection: { resourceKeys: selected } })
    const compiled = fixture.logicalKeys(compilation)
    check(equalSet(compiled, expected), 'existing stronger compilation closure lost a selected resource')
    observations.push({ id: `adapter:${productType}:compilation`, family: family.id, split: family.split,
      operation: 'production-compilation-selected-completeness', status: 'pass', expected, observed: compiled,
      evidence: [family.queries[3]!.evidence[0]!.spanHash], issue: null })
    observations.push({ id: `adapter:${productType}:prohibited`, family: family.id, split: family.split,
      operation: 'product-prohibited-rule-coverage', status: plan.permission.prohibitedSelectors.length ? 'pass' : 'gap',
      expected: 'product-specific prohibited selectors', observed: plan.permission.prohibitedSelectors.length,
      evidence: [family.queries[3]!.evidence[0]!.spanHash], issue: plan.permission.prohibitedSelectors.length ? null : 'NW-G06' })
  }
  return observations
}
