import corpus from '../acceptance/narrative-world/corpus-v1.json'
import { db } from '../../src/lib/db/schema'
import { createWorkspace } from '../../src/lib/workspace/create-workspace'
import { createWorldWork } from '../../src/lib/workspace/works'
import { stampNewRecord } from '../../src/lib/workspace/scope'
import { createWorldRevision, publishWorldRevision } from '../../src/lib/world-engine/releases'
import { createWorldReferenceV1, resolveWorldReferenceResourceScopeV1 } from '../../src/lib/world-engine/world-reference'
import { listAllWorldReleaseResourceDescriptorsV1, readWorldOriginalEvidenceV1 } from '../../src/lib/context-gateway/world-release-provider'
import type { ContextResourceDescriptorV1 } from '../../src/lib/registry/types'

export type NarrativeFamily = typeof corpus.families[number]

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`NW-0B evaluator invariant: ${message}`)
}
const sorted = (items: readonly string[]) => [...items].sort()

/** Test-owned fixture translation. Gold annotations never enter model context,
 * production registries, author storage, or the reader being measured. */
export async function seedNarrativeFamily(family: NarrativeFamily) {
  const created = await createWorkspace({ name: family.title, genres: ['fantasy'], status: 'drafting',
    description: 'NW-0B 原创隔离评测夹具', targetWordCount: 10_000, enableMultiWorld: false,
  }, { purpose: 'world-engine', kind: 'novel', novelProfile: 'long' })
  const now = 1_800_000_000_000
  const localIds = new Map<string, number>()
  const source = (suffix: string) => {
    const value = family.sources.find(item => item.id === `${family.id}:${suffix}`)
    check(value, `missing fixture source ${suffix}`)
    return value
  }
  for (const item of family.sources.filter(s => s.kind === 'character')) {
    const id = await db.characters.add(stampNewRecord(created.scope, 'characters', {
      projectId: created.scope.projectId, name: item.title, identity: item.identity,
      roleWeight: 'main', moralAxis: 'neutral', orderAxis: 'neutral', shortDescription: item.text,
      background: '', personality: '', createdAt: now, updatedAt: now,
    } as never, { owner: 'world' })) as number
    localIds.set(item.id, id)
  }
  for (const item of family.sources.filter(s => s.kind === 'chapter')) {
    const outlineId = await db.outlineNodes.add(stampNewRecord(created.scope, 'outlineNodes', {
      projectId: created.scope.projectId, parentId: null, type: 'chapter', title: item.title,
      summary: item.summary, order: item.order, createdAt: now, updatedAt: now,
    } as never, { owner: 'work' })) as number
    const id = await db.chapters.add(stampNewRecord(created.scope, 'chapters', {
      projectId: created.scope.projectId, outlineNodeId: outlineId, title: item.title, summary: item.summary,
      content: item.text, order: item.order, status: 'draft', wordCount: [...item.text].length, notes: '',
      createdAt: now, updatedAt: now,
    } as never, { owner: 'work' })) as number
    localIds.set(item.id, id)
  }
  for (const item of family.sources.filter(s => s.kind === 'story-arc')) {
    const id = await db.storyArcs.add(stampNewRecord(created.scope, 'storyArcs', {
      projectId: created.scope.projectId, name: item.title, description: item.text,
      type: item.id.endsWith('main') ? 'main' : 'sub', stages: '[]', origin: 'manual', status: 'active',
      createdAt: now, updatedAt: now,
    } as never, { owner: 'work' })) as number
    localIds.set(item.id, id)
  }
  for (const [suffix, action] of [['a', 'mislearn'], ['b', 'learn']] as const) {
    const id = await db.knowledgeLedger.add(stampNewRecord(created.scope, 'knowledgeLedger', {
      projectId: created.scope.projectId, characterId: localIds.get(`${family.id}:character-${suffix}`),
      characterName: source(`character-${suffix}`).title, knowledgeKey: `${family.id}:proposition`,
      statement: family.seed.truth, belief: action === 'mislearn' ? family.seed.belief : null,
      action, sourceType: 'chapter', sourceChapterId: localIds.get(`${family.id}:chapter-2`),
      sourceQuote: family.seed.knowledgeQuote, status: 'confirmed', createdAt: now, updatedAt: now,
    } as never, { owner: 'work' })) as number
    localIds.set(`${family.id}:knowledge-${suffix}`, id)
  }
  const factIds = new Map<string, number>()
  for (const status of ['confirmed', 'candidate', 'stale', 'rejected', 'source-missing', 'invalid-range'] as const) {
    const id = await db.temporalFacts.add(stampNewRecord(created.scope, 'temporalFacts', {
      projectId: created.scope.projectId, subjectName: `${family.id}:fact-${status}`, predicate: 'knows',
      characterId: localIds.get(`${family.id}:character-b`), factKind: 'event', value: family.seed.truth,
      sourceType: 'chapter', sourceChapterId: localIds.get(`${family.id}:chapter-2`), sourceQuote: family.seed.knowledgeQuote,
      validFromChapterId: localIds.get(`${family.id}:chapter-2`), validToChapterId: null,
      status, locked: false, createdAt: now, updatedAt: now,
    } as never, { owner: 'work' })) as number
    factIds.set(status, id)
  }
  // Explicit manual fixture assertions for the history lifecycle control.
  // They are not extracted from the stories or included in semantic QA gold.
  const historicalId = await db.temporalFacts.add(stampNewRecord(created.scope, 'temporalFacts', {
    projectId: created.scope.projectId, subjectName: `${family.id}:fact-superseded`, predicate: 'location',
    characterId: localIds.get(`${family.id}:character-a`), factKind: 'state', value: '旧驿站', sourceType: 'manual',
    validFromChapterId: localIds.get(`${family.id}:chapter-1`), validToChapterId: localIds.get(`${family.id}:chapter-2`),
    status: 'superseded', locked: false, createdAt: now, updatedAt: now,
  } as never, { owner: 'work' })) as number
  factIds.set('superseded', historicalId)
  await db.temporalFacts.add(stampNewRecord(created.scope, 'temporalFacts', {
    projectId: created.scope.projectId, subjectName: `${family.id}:fact-current-location`, predicate: 'location',
    characterId: localIds.get(`${family.id}:character-a`), factKind: 'state', value: '新驿站', sourceType: 'manual',
    validFromChapterId: localIds.get(`${family.id}:chapter-2`), validToChapterId: null, supersedesFactId: historicalId,
    status: 'confirmed', locked: false, createdAt: now, updatedAt: now,
  } as never, { owner: 'work' }))
  // Fixture author explicitly confirms and locks B's knowledge of this rule.
  const lockedId = await db.temporalFacts.add(stampNewRecord(created.scope, 'temporalFacts', {
    projectId: created.scope.projectId, subjectName: `${family.id}:locked-rule`, predicate: 'knows',
    characterId: localIds.get(`${family.id}:character-b`), factKind: 'event', value: family.seed.lockedQuote, sourceType: 'chapter',
    sourceChapterId: localIds.get(`${family.id}:chapter-1`), sourceQuote: family.seed.lockedQuote,
    status: 'confirmed', locked: true, createdAt: now, updatedAt: now,
  } as never, { owner: 'work' })) as number
  factIds.set('locked', lockedId)
  await db.foreshadows.add(stampNewRecord(created.scope, 'foreshadows', {
    projectId: created.scope.projectId, name: `${family.id}:planned`, type: 'dialogue', status: 'planned',
    description: family.seed.plannedText, notes: '', plantChapterId: null, echoChapterIds: '[]', resolveChapterId: null,
    createdAt: now, updatedAt: now,
  } as never, { owner: 'work' }))
  const revision = await createWorldRevision({ scope: created.scope, label: `${family.id}:baseline` })
  const release = await publishWorldRevision(revision.id!)
  const reference = await createWorldReferenceV1(release.id!)
  // A second Work shares this World, but must not enter the first Work's
  // impact graph or have its facts demoted. This is stronger than a project-only check.
  const otherWork = await createWorldWork(created.scope.projectId, { title: `${family.title}·独立作品`, kind: 'novel', novelProfile: 'long' })
  const otherScope = { ...created.scope, workId: otherWork.id! }
  const foreignOutlineId = await db.outlineNodes.add(stampNewRecord(otherScope, 'outlineNodes', {
    projectId: created.scope.projectId, parentId: null, type: 'chapter' as const, title: '另一作品的后章',
    summary: '', order: 99, createdAt: now, updatedAt: now,
  }, { owner: 'work' }))
  const foreignChapterId = await db.chapters.add(stampNewRecord(otherScope, 'chapters', {
    projectId: created.scope.projectId, outlineNodeId: foreignOutlineId, title: '另一作品的后章', content: '独立作品，不依赖评测原文。',
    order: 99, status: 'draft', wordCount: 16, notes: '', createdAt: now, updatedAt: now,
  } as never, { owner: 'work' })) as number
  const foreignFactId = await db.temporalFacts.add(stampNewRecord(otherScope, 'temporalFacts', {
    projectId: created.scope.projectId, subjectName: 'other-work-fact', predicate: 'location',
    characterId: localIds.get(`${family.id}:character-a`), factKind: 'state', value: '独立作品的院内',
    sourceType: 'manual', status: 'confirmed', locked: false, createdAt: now, updatedAt: now,
  } as never, { owner: 'work' })) as number
  const foreignBefore = JSON.stringify({ chapter: await db.chapters.get(foreignChapterId), fact: await db.temporalFacts.get(foreignFactId) })
  const resourceScope = await resolveWorldReferenceResourceScopeV1(reference)
  const descriptors = await listAllWorldReleaseResourceDescriptorsV1(resourceScope)
  const byLogical = new Map<string, ContextResourceDescriptorV1>()
  const byKey = new Map<string, string>()
  const originals = new Map<string, Record<string, unknown>>()
  for (const descriptor of descriptors) {
    const original = await readWorldOriginalEvidenceV1({ scope: resourceScope, resourceKey: descriptor.resourceKey,
      sourceRef: descriptor.sourceRefs[0]!, maxTokens: 20_000 })
    const row = JSON.parse(original.content) as Record<string, unknown>
    const kind = descriptor.worldSemantic!.resourceKind
    let logical = family.sources.find(item => item.kind === kind
      && (kind === 'chapter' ? row.title === item.title
        : kind === 'character' ? row.shortDescription === item.text : row.name === item.title))?.id
    if (kind === 'knowledge-event') logical = `${family.id}:knowledge-${row.action === 'mislearn' ? 'a' : 'b'}`
    if (kind === 'temporal-fact') logical = String(row.subjectName)
    if (kind === 'foreshadow') logical = String(row.name)
    // Outlines and other release infrastructure retain an explicit local label;
    // no runtime numeric locator or random release hash goes into score gold.
    logical ??= `${family.id}:${kind}:${String(row.title ?? row.name ?? descriptor.worldSemantic!.resourceCoordinate)}`
    check(!byLogical.has(logical), `ambiguous descriptor mapping ${logical}`)
    byLogical.set(logical, descriptor)
    byKey.set(descriptor.resourceKey, logical)
    originals.set(logical, row)
  }
  const descriptor = (id: string) => { const item = byLogical.get(id); check(item, `unmapped resource ${id}`); return item }
  const logicalKeys = (items: readonly ContextResourceDescriptorV1[]) => sorted(items.map(item => {
    const id = byKey.get(item.resourceKey); check(id, `unknown response resource ${item.resourceKey}`); return id
  }))
  return { ...created, source, localIds, factIds, foreignChapterId, foreignFactId, foreignBefore, release, reference, resourceScope, descriptors,
    byLogical, byKey, originals, descriptor, logicalKeys }
}
