import { parseWorldSourcePurposeProofV1 } from '../../world-engine/source-purpose-contract';
import { hashCanonicalValue } from '../../agent/run/hash';
import type { TextOpenWorldCreatorBriefDraftV1, TextOpenWorldCreatorBriefV1, TextOpenWorldCreatorProductBoundaryV1, TextOpenWorldCreatorSourceBindingV1, TextOpenWorldCreatorSourceSummaryV1 } from '../../types/index';

const HASH = /^[a-f0-9]{64}$/
const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
export const TEXT_OPEN_WORLD_CREATOR_BRIEF_STEP_ID_V1 = 'text-open-world:creator-brief-candidate'

export class TextOpenWorldCreatorBriefContractErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(`[text-open-world-creator-brief-contract:${code}] ${message}`)
    this.name = 'TextOpenWorldCreatorBriefContractErrorV1'
  }
}

function fail(code: string, message: string): never {
  throw new TextOpenWorldCreatorBriefContractErrorV1(code, message)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('protocol', `${label} 必须是对象`)
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('protocol', `${label} 字段不精确`)
  }
}

function text(value: unknown, label: string, maximum = 8_000, allowEmpty = false): string {
  if (typeof value !== 'string') fail('protocol', `${label} 必须是字符串`)
  const normalized = value.trim().normalize('NFC')
  if ((!allowEmpty && !normalized) || normalized.length > maximum) fail('protocol', `${label} 为空或过长`)
  return normalized
}

export function readTextOpenWorldCreatorProtagonistSourceKeyV1(
  row: Record<string, unknown>,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(row, 'protagonistSourceResourceKey')) return undefined
  const key = row.protagonistSourceResourceKey
  if (row.protagonistMode !== 'source-character' || typeof key !== 'string' || !STABLE_KEY.test(key)) {
    fail('protagonist', '仅来源型主角可以携带准确的封存角色标识')
  }
  return key
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) fail('protocol', `${label} 必须是 SHA-256`)
  return value
}

function positiveId(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail('protocol', `${label} 必须是正整数`)
  return value as number
}

function nonNegativeInteger(value: unknown, label: string, maximum = 1_000_000): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    fail('protocol', `${label} 必须是有界非负整数`)
  }
  return value as number
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const parsed = nonNegativeInteger(value, label, maximum)
  if (parsed < minimum) fail('protocol', `${label} 必须在 ${minimum} 到 ${maximum} 之间`)
  return parsed
}

function textList(value: unknown, label: string, maximum = 100, allowEmpty = true): string[] {
  if (!Array.isArray(value) || value.length > maximum || (!allowEmpty && value.length === 0)) {
    fail('protocol', `${label} 必须是有界数组`)
  }
  const result = value.map((item, index) => text(item, `${label}[${index}]`, 2_000))
  if (new Set(result).size !== result.length) fail('protocol', `${label} 不得重复`)
  return result
}

export const TEXT_OPEN_WORLD_CREATOR_PRODUCT_BOUNDARY_V1: TextOpenWorldCreatorProductBoundaryV1 = Object.freeze({
  freedomModel: 'bounded-guided',
  mainlineStructure: 'strict-sequential-with-multiple-endings',
  mainlineWaitsForPlayer: true,
  significantStorylinesWaitAtSafePoints: true,
  ordinaryWorldContinues: true,
  criticalActorsProtected: true,
  criticalItemsProtected: true,
  freeTextPolicy: 'respond-then-redirect-or-reject',
  unsupportedSolutionPolicy: 'declared-actions-only',
  combatMode: 'turn-based-four-actions',
  difficulty: 'standard',
  locationOnlyCriticalTriggersForbidden: true,
})

function assertDraft(value: unknown): asserts value is TextOpenWorldCreatorBriefDraftV1 {
  const row = record(value, 'brief.draft')
  const protagonistSourceKey = readTextOpenWorldCreatorProtagonistSourceKeyV1(row)
  exact(row, [
    'schema', 'version', 'gameTitle', 'playerRole', 'playerFantasy', 'protagonistMode',
    ...(protagonistSourceKey === undefined ? [] : ['protagonistSourceResourceKey']),
    'protagonistDirective', 'coreGoal', 'primaryConflict', 'openingSituation',
    'experiencePillars', 'toneKeywords', 'mustKeep', 'allowedInferences', 'forbiddenChanges',
    'contentRating', 'contentBoundaries', 'authorNotes', 'unresolvedQuestions',
    'acceptedAssumptions', 'scale', 'media', 'completion',
  ], 'brief.draft')
  if (row.schema !== 'storyforge.text-open-world-creator-brief-draft' || row.version !== 1) {
    fail('protocol', 'brief.draft schema/version 无效')
  }
  text(row.gameTitle, 'brief.draft.gameTitle', 200)
  for (const key of [
    'playerRole', 'playerFantasy', 'protagonistDirective', 'coreGoal',
    'primaryConflict', 'openingSituation',
  ]) text(row[key], `brief.draft.${key}`, 2_000)
  text(row.contentRating, 'brief.draft.contentRating', 100)
  text(row.authorNotes, 'brief.draft.authorNotes', 4_000, true)
  if (row.protagonistMode !== 'source-character' && row.protagonistMode !== 'author-defined') {
    fail('protocol', 'brief.draft.protagonistMode 无效')
  }
  const listRules: Record<string, { minimum: number; maximum: number }> = {
    experiencePillars: { minimum: 2, maximum: 8 },
    toneKeywords: { minimum: 1, maximum: 12 },
    mustKeep: { minimum: 0, maximum: 24 },
    allowedInferences: { minimum: 0, maximum: 24 },
    forbiddenChanges: { minimum: 1, maximum: 24 },
    contentBoundaries: { minimum: 0, maximum: 24 },
    unresolvedQuestions: { minimum: 0, maximum: 24 },
    acceptedAssumptions: { minimum: 0, maximum: 24 },
  }
  for (const [key, rule] of Object.entries(listRules)) {
    const items = textList(row[key], `brief.draft.${key}`, rule.maximum, rule.minimum === 0)
    if (items.length < rule.minimum) fail('protocol', `brief.draft.${key} 数量不足`)
    items.forEach((item, index) => text(item, `brief.draft.${key}[${index}]`, 1_000))
  }
  const scale = record(row.scale, 'brief.draft.scale')
  exact(scale, [
    'regions', 'namedLocations', 'mainlineStages', 'endings', 'significantStorylines',
    'ordinaryQuests', 'taskTemplates', 'randomEvents', 'requiredPlayMinutes',
    'optionalInventoryMinutes',
  ], 'brief.draft.scale')
  boundedInteger(scale.regions, 'scale.regions', 1, 12)
  boundedInteger(scale.endings, 'scale.endings', 1, 12)
  boundedInteger(scale.significantStorylines, 'scale.significantStorylines', 0, 30)
  const rangeRules: Record<string, { minimum: number; maximum: number }> = {
    namedLocations: { minimum: 2, maximum: 100 },
    mainlineStages: { minimum: 2, maximum: 60 },
    ordinaryQuests: { minimum: 0, maximum: 200 },
    taskTemplates: { minimum: 0, maximum: 100 },
    randomEvents: { minimum: 0, maximum: 500 },
    requiredPlayMinutes: { minimum: 10, maximum: 10_000 },
    optionalInventoryMinutes: { minimum: 0, maximum: 20_000 },
  }
  for (const [key, rule] of Object.entries(rangeRules)) {
    const range = record(scale[key], `scale.${key}`)
    exact(range, ['minimum', 'maximum'], `scale.${key}`)
    const minimum = boundedInteger(range.minimum, `scale.${key}.minimum`, rule.minimum, rule.maximum)
    const maximum = boundedInteger(range.maximum, `scale.${key}.maximum`, rule.minimum, rule.maximum)
    if (minimum > maximum) fail('protocol', `scale.${key} 范围倒置`)
  }
  const media = record(row.media, 'brief.draft.media')
  exact(media, ['proceduralMap', 'characterPortraits', 'sceneBackgrounds', 'audio', 'artDirection'], 'brief.draft.media')
  if (media.proceduralMap !== 'required' || media.characterPortraits !== 'required'
    || media.sceneBackgrounds !== 'required' || !['none', 'optional'].includes(String(media.audio))) {
    fail('protocol', 'brief.draft.media 超出产品能力')
  }
  text(media.artDirection, 'brief.draft.media.artDirection', 4_000, true)
  const completion = record(row.completion, 'brief.draft.completion')
  exact(completion, [
    'playablePreviewRequired', 'deterministicGatesRequired', 'semanticReviewRequired',
    'publishAfterGates', 'humanPlaytest', 'repairPolicy',
  ], 'brief.draft.completion')
  if (completion.playablePreviewRequired !== true || completion.deterministicGatesRequired !== true
    || completion.semanticReviewRequired !== true || completion.publishAfterGates !== true
    || completion.humanPlaytest !== 'post-release' || completion.repairPolicy !== 'new-release') {
    fail('protocol', 'brief.draft.completion 无效')
  }
}

function parseCreatorPurpose(value: unknown, releaseHash: unknown, releaseUid?: unknown) {
  const proof = parseWorldSourcePurposeProofV1(value)
  if (proof.purpose !== 'text-open-world' || proof.selectedRelease.releaseHash !== releaseHash
    || (releaseUid !== undefined && proof.selectedRelease.releaseUid !== releaseUid)) {
    fail('protocol', '用途证据不属于 Creator 的冻结来源')
  }
  return proof
}

export function parseTextOpenWorldCreatorSourceBindingV1(
  value: unknown,
): TextOpenWorldCreatorSourceBindingV1 {
  const row = record(value, 'brief.sourceBinding')
  if (row.kind === 'world-release') {
    exact(row, [
      'kind', 'worldCode', 'releaseUid', 'releaseVersion', 'releaseHash', 'referenceHash',
      'manifestSchemaHash', 'capabilityCatalogHash', 'capabilityProfileHash',
      ...('sourcePurpose' in row ? ['sourcePurpose'] : []),
    ], 'brief.sourceBinding')
    if (!STABLE_KEY.test(text(row.worldCode, 'worldCode', 200))) fail('protocol', 'worldCode 无效')
    text(row.releaseUid, 'releaseUid', 300)
    positiveId(row.releaseVersion, 'releaseVersion')
    for (const key of ['releaseHash', 'referenceHash', 'manifestSchemaHash', 'capabilityCatalogHash', 'capabilityProfileHash']) {
      hash(row[key], `sourceBinding.${key}`)
    }
    if ('sourcePurpose' in row) parseCreatorPurpose(row.sourcePurpose, row.releaseHash, row.releaseUid)
    return structuredClone(row) as unknown as TextOpenWorldCreatorSourceBindingV1
  }
  exact(row, [
    'kind', 'workCode', 'sourceVersionHash', 'sourceBoundaryHash', 'coverage', 'selectionMode',
    'selectedChapterCount', 'selectedOutlineCount',
  ], 'brief.sourceBinding')
  if (row.kind !== 'novel' || !STABLE_KEY.test(text(row.workCode, 'workCode', 200))) fail('protocol', 'novel binding 无效')
  hash(row.sourceVersionHash, 'sourceVersionHash')
  hash(row.sourceBoundaryHash, 'sourceBoundaryHash')
  if (!['full-text', 'outline-only'].includes(String(row.coverage))
    || !['entire-work', 'outline-subtree', 'chapter-range', 'chapters'].includes(String(row.selectionMode))) {
    fail('protocol', 'novel binding coverage/selectionMode 无效')
  }
  nonNegativeInteger(row.selectedChapterCount, 'selectedChapterCount', 100_000)
  nonNegativeInteger(row.selectedOutlineCount, 'selectedOutlineCount', 100_000)
  return structuredClone(row) as unknown as TextOpenWorldCreatorSourceBindingV1
}

function assertSummary(value: unknown): asserts value is TextOpenWorldCreatorSourceSummaryV1 {
  const row = record(value, 'brief.sourceSummary')
  exact(row, ['label', 'sourceKind', 'coverage', 'resourceCount', 'rowOrWordCount', 'capabilityAreas', 'gaps'], 'brief.sourceSummary')
  text(row.label, 'sourceSummary.label', 1_000)
  if (!['world-release', 'novel'].includes(String(row.sourceKind))
    || !['world-release-catalog', 'full-text', 'outline-only'].includes(String(row.coverage))) {
    fail('protocol', 'sourceSummary kind/coverage 无效')
  }
  nonNegativeInteger(row.resourceCount, 'sourceSummary.resourceCount', 10_000_000)
  nonNegativeInteger(row.rowOrWordCount, 'sourceSummary.rowOrWordCount', 1_000_000_000)
  textList(row.capabilityAreas, 'sourceSummary.capabilityAreas', 100)
  if (!Array.isArray(row.gaps) || row.gaps.length > 100) fail('protocol', 'sourceSummary.gaps 无效')
  for (const [index, gapValue] of row.gaps.entries()) {
    const gap = record(gapValue, `sourceSummary.gaps[${index}]`)
    exact(gap, ['code', 'severity', 'title'], `sourceSummary.gaps[${index}]`)
    text(gap.code, `gaps[${index}].code`, 200)
    text(gap.title, `gaps[${index}].title`, 1_000)
    if (!['blocking', 'warning', 'recommendation'].includes(String(gap.severity))) fail('protocol', 'gap severity 无效')
  }
}

export function parseTextOpenWorldCreatorBriefV1(value: unknown): TextOpenWorldCreatorBriefV1 {
  let candidate = value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) as unknown }
    catch { fail('protocol', 'Brief 不是合法 JSON') }
  }
  const row = record(candidate, 'brief')
  exact(row, [
    'schema', 'version', 'productInstanceKey', 'revision', 'sourceBinding', 'sourceBindingHash',
    'sourceSummary', 'draft', 'productBoundary', 'confirmation', 'candidateEvidence',
    'confirmedAt', 'briefHash',
  ], 'brief')
  if (row.schema !== 'storyforge.text-open-world-creator-brief' || row.version !== 1
    || !STABLE_KEY.test(text(row.productInstanceKey, 'productInstanceKey', 200))) {
    fail('protocol', 'Brief schema/version/productInstanceKey 无效')
  }
  positiveId(row.revision, 'brief.revision')
  parseTextOpenWorldCreatorSourceBindingV1(row.sourceBinding)
  hash(row.sourceBindingHash, 'brief.sourceBindingHash')
  assertSummary(row.sourceSummary)
  assertDraft(row.draft)
  const boundary = record(row.productBoundary, 'brief.productBoundary')
  exact(boundary, Object.keys(TEXT_OPEN_WORLD_CREATOR_PRODUCT_BOUNDARY_V1), 'brief.productBoundary')
  const confirmation = record(row.confirmation, 'brief.confirmation')
  exact(confirmation, [
    'sourceIdentityReviewed', 'productBoundaryReviewed', 'unresolvedItemsClosed',
    'directPublishWorkflowReviewed',
  ], 'brief.confirmation')
  if (Object.values(confirmation).some(value => value !== true)) fail('protocol', 'Brief 确认项不完整')
  const evidence = record(row.candidateEvidence, 'brief.candidateEvidence')
  exact(evidence, ['candidateHash', 'runBindingHash', 'origin', 'contextManifestHashes'], 'brief.candidateEvidence')
  hash(evidence.candidateHash, 'candidateEvidence.candidateHash')
  hash(evidence.runBindingHash, 'candidateEvidence.runBindingHash')
  if (evidence.origin !== 'ai' && evidence.origin !== 'author') fail('protocol', 'candidateEvidence.origin 无效')
  const manifests = textList(evidence.contextManifestHashes, 'candidateEvidence.contextManifestHashes', 10, false)
  manifests.forEach((item, index) => hash(item, `contextManifestHashes[${index}]`))
  nonNegativeInteger(row.confirmedAt, 'brief.confirmedAt', Number.MAX_SAFE_INTEGER)
  hash(row.briefHash, 'brief.briefHash')
  return structuredClone(row) as unknown as TextOpenWorldCreatorBriefV1
}

export async function verifyTextOpenWorldCreatorBriefV1(
  value: unknown,
): Promise<TextOpenWorldCreatorBriefV1> {
  const brief = parseTextOpenWorldCreatorBriefV1(value)
  const { briefHash, ...body } = brief
  if (await hashCanonicalValue(body) !== briefHash) fail('brief-hash', 'Brief Hash 不匹配')
  if (await hashCanonicalValue(brief.sourceBinding) !== brief.sourceBindingHash) {
    fail('source-binding-hash', '来源绑定 Hash 不匹配')
  }
  if (await hashCanonicalValue(brief.productBoundary)
    !== await hashCanonicalValue(TEXT_OPEN_WORLD_CREATOR_PRODUCT_BOUNDARY_V1)) {
    fail('product-boundary', '产品固定边界被修改')
  }
  if (brief.sourceSummary.sourceKind !== brief.sourceBinding.kind) fail('source-kind', '来源摘要与绑定种类不一致')
  if ((brief.sourceBinding.kind === 'world-release' && brief.sourceSummary.coverage !== 'world-release-catalog')
    || (brief.sourceBinding.kind === 'novel' && brief.sourceSummary.coverage === 'world-release-catalog')) {
    fail('source-coverage', '来源摘要 coverage 与绑定种类不一致')
  }
  if (brief.draft.unresolvedQuestions.length > 0) fail('unresolved', '确认 Brief 仍有未决问题')
  return brief
}
