
import type { ProductProductionPlanV3, TextOpenWorldCreatorBriefV1, TextOpenWorldCreatorProductionPreflightConfirmationV1, TextOpenWorldCreatorProductionPreflightV1, TextOpenWorldCreatorProductionSourcePlanV1, TextOpenWorldCreatorProductionStartV1, TextOpenWorldSourceRightsBasisV1 } from '../../types/index';
import { parseProductProductionBriefV3 } from '../product-production/contracts';
import { canonicalProductProductionJsonV2, hashProductProductionValueV2, isSha256Hash } from '../product-production/hash';
import { parseProductProductionPlanV3 } from '../product-production/plan';
import { parseTextOpenWorldCreatorSourceBindingV1, verifyTextOpenWorldCreatorBriefV1 } from './creator-brief-persistence';
import { TEXT_OPEN_WORLD_SOURCE_PIN_LIMITS_V1 } from './source-pin-contract';

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
// Read immutable source bounds from the leaf contract. The production plan
// imports Creator parsers transitively and may still be initializing here.
const MAX_SOURCE_UNITS = TEXT_OPEN_WORLD_SOURCE_PIN_LIMITS_V1.maximumUnits

function fail(message: string): never {
  throw new Error('[text-open-world-creator-start] ' + message)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' 必须是对象')
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(label + ' 字段不精确')
  }
}

function stableKey(value: unknown, label: string): string {
  if (typeof value !== 'string' || !STABLE_KEY.test(value)) fail(label + ' 不是稳定 key')
  return value
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isSha256Hash(value)) fail(label + ' 不是 SHA-256')
  return value
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(label + ' 必须是正整数')
  return Number(value)
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail(label + ' 必须是非负整数')
  return Number(value)
}

function normalizedText(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string') fail(label + ' 必须是字符串')
  const result = value.trim().normalize('NFC')
  if ((!allowEmpty && !result) || result.length > maximum) fail(label + ' 为空或过长')
  return result
}

function sourceUnitArtifactKeys(count: number): string[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SOURCE_UNITS) {
    fail('来源单元数量必须在 1 到 ' + MAX_SOURCE_UNITS + ' 之间')
  }
  return Array.from({ length: count }, (_, index) => index === 0
    ? 'text-open-world.source-pin-unit'
    : 'text-open-world.source-pin-unit.' + String(index + 1).padStart(5, '0'))
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalProductProductionJsonV2(left) === canonicalProductProductionJsonV2(right)
}

async function nestedHashValid(value: unknown, hashKey: string, expectedSchema: string, versions = [1]): Promise<boolean> {
  const row = record(value, expectedSchema)
  if (row.schema !== expectedSchema || typeof row.version !== 'number'
    || !versions.includes(row.version) || !isSha256Hash(row[hashKey])) return false
  const body = Object.fromEntries(Object.entries(row).filter(([key]) => key !== hashKey))
  return await hashProductProductionValueV2(body) === row[hashKey]
}

export async function parseTextOpenWorldCreatorProductionSourcePlanV1(
  value: string | unknown,
  expectedBrief?: TextOpenWorldCreatorBriefV1,
): Promise<TextOpenWorldCreatorProductionSourcePlanV1> {
  let candidate: unknown = value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) } catch { fail('SourcePlan 不是合法 JSON') }
  }
  const row = record(candidate, 'sourcePlan')
  exactKeys(row, [
    'schema', 'version', 'productType', 'productInstanceKey', 'sourceKind', 'sourceBinding',
    'sourceBindingHash', 'sourceVersionHash', 'expectedSourceBoundaryHash', 'selection',
    'sourceUnitArtifactKeys', 'createdAt', 'planHash',
  ], 'sourcePlan')
  if (row.schema !== 'storyforge.text-open-world-creator-production-source-plan'
    || row.version !== 1 || row.productType !== 'text-open-world'
    || !['world-release', 'novel'].includes(String(row.sourceKind))) fail('SourcePlan schema/version/kind 无效')
  const selection = record(row.selection, 'sourcePlan.selection')
  let parsedSelection: TextOpenWorldCreatorProductionSourcePlanV1['selection']
  if (selection.kind === 'world-release') {
    exactKeys(selection, ['kind', 'mode', 'resourceKeys'], 'sourcePlan.selection')
    if (selection.mode !== 'entire-release' || !Array.isArray(selection.resourceKeys)
      || selection.resourceKeys.length < 1 || selection.resourceKeys.length > MAX_SOURCE_UNITS) {
      fail('WorldRelease selection 无效')
    }
    const resourceKeys = selection.resourceKeys.map((item, index) => stableKey(item, 'resourceKeys[' + index + ']'))
    if (new Set(resourceKeys).size !== resourceKeys.length) fail('WorldRelease resourceKeys 重复')
    parsedSelection = { kind: 'world-release', mode: 'entire-release', resourceKeys }
  } else if (selection.kind === 'novel') {
    exactKeys(selection, ['kind', 'mode', 'sourceUnitCount', 'selectedChapterCount', 'selectedOutlineCount'], 'sourcePlan.selection')
    if (!['entire-work', 'outline-subtree', 'chapter-range', 'chapters'].includes(String(selection.mode))) {
      fail('小说 selection.mode 无效')
    }
    parsedSelection = {
      kind: 'novel',
      mode: selection.mode as Extract<TextOpenWorldCreatorProductionSourcePlanV1['selection'], { kind: 'novel' }>['mode'],
      sourceUnitCount: positiveInteger(selection.sourceUnitCount, 'sourceUnitCount'),
      selectedChapterCount: nonNegativeInteger(selection.selectedChapterCount, 'selectedChapterCount'),
      selectedOutlineCount: nonNegativeInteger(selection.selectedOutlineCount, 'selectedOutlineCount'),
    }
  } else fail('SourcePlan selection.kind 无效')
  const count = parsedSelection.kind === 'world-release'
    ? parsedSelection.resourceKeys.length
    : parsedSelection.sourceUnitCount
  if (!Array.isArray(row.sourceUnitArtifactKeys)
    || !sameJson(row.sourceUnitArtifactKeys, sourceUnitArtifactKeys(count))) {
    fail('SourcePlan 来源 Artifact keys 与选择数量不闭合')
  }
  if (!isSha256Hash(row.expectedSourceBoundaryHash)) {
    fail('expectedSourceBoundaryHash 无效')
  }
  const parsed: TextOpenWorldCreatorProductionSourcePlanV1 = {
    schema: 'storyforge.text-open-world-creator-production-source-plan',
    version: 1,
    productType: 'text-open-world',
    productInstanceKey: stableKey(row.productInstanceKey, 'productInstanceKey'),
    sourceKind: row.sourceKind as TextOpenWorldCreatorProductionSourcePlanV1['sourceKind'],
    sourceBinding: parseTextOpenWorldCreatorSourceBindingV1(row.sourceBinding),
    sourceBindingHash: hash(row.sourceBindingHash, 'sourceBindingHash'),
    sourceVersionHash: hash(row.sourceVersionHash, 'sourceVersionHash'),
    expectedSourceBoundaryHash: row.expectedSourceBoundaryHash as string,
    selection: parsedSelection,
    sourceUnitArtifactKeys: sourceUnitArtifactKeys(count),
    createdAt: nonNegativeInteger(row.createdAt, 'createdAt'),
    planHash: hash(row.planHash, 'planHash'),
  }
  const { planHash, ...body } = parsed
  if (await hashProductProductionValueV2(body) !== planHash) fail('SourcePlan Hash 不匹配')
  if (parsed.sourceKind !== parsed.selection.kind) {
    fail('SourcePlan 来源种类与选择不闭合')
  }
  if (expectedBrief) {
    const brief = await verifyTextOpenWorldCreatorBriefV1(expectedBrief)
    const versionHash = brief.sourceBinding.kind === 'world-release'
      ? brief.sourceBinding.releaseHash : brief.sourceBinding.sourceVersionHash
    if (parsed.productInstanceKey !== brief.productInstanceKey
      || parsed.sourceKind !== brief.sourceBinding.kind
      || parsed.sourceBindingHash !== brief.sourceBindingHash
      || parsed.sourceVersionHash !== versionHash
      || !sameJson(parsed.sourceBinding, brief.sourceBinding)) fail('SourcePlan 与 Creator Brief 不一致')
  }
  return parsed
}

export async function parseTextOpenWorldCreatorProductionStartV1(input: {
  value: string | unknown
  brief?: TextOpenWorldCreatorBriefV1
  sourcePlan?: TextOpenWorldCreatorProductionSourcePlanV1
  productionPlan?: ProductProductionPlanV3 | string
}): Promise<TextOpenWorldCreatorProductionStartV1> {
  let candidate: unknown = input.value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) } catch { fail('Start 不是合法 JSON') }
  }
  const row = record(candidate, 'start')
  exactKeys(row, [
    'schema', 'version', 'productType', 'productInstanceKey', 'briefRevision', 'briefHash',
    'sourceBindingHash', 'sourcePlanHash', 'preflight', 'confirmation', 'executionBrief',
    'executionBriefHash', 'productionPlanControlEpoch', 'productionPlanHash',
    'authorStartRevision', 'authorizationNonceHash',
    'rightsBasis', 'rightsNote', 'authorizedAt', 'startHash',
  ], 'start')
  if (row.schema !== 'storyforge.text-open-world-creator-production-start'
    || row.version !== 1 || row.productType !== 'text-open-world') fail('Start schema/version/product 无效')
  const executionBrief = parseProductProductionBriefV3(row.executionBrief)
  const executionBriefHash = hash(row.executionBriefHash, 'executionBriefHash')
  if (await hashProductProductionValueV2(executionBrief) !== executionBriefHash) {
    fail('executionBriefHash 不匹配')
  }
  const preflight = structuredClone(row.preflight) as TextOpenWorldCreatorProductionPreflightV1
  const confirmation = structuredClone(row.confirmation) as TextOpenWorldCreatorProductionPreflightConfirmationV1
  if (!await nestedHashValid(preflight, 'preflightHash', 'storyforge.text-open-world-creator-production-preflight')
    || !await nestedHashValid(preflight.providerBinding, 'bindingHash', 'storyforge.text-open-world-creator-provider-binding')
    || !await nestedHashValid(preflight.priceQuote, 'quoteHash', 'storyforge.text-open-world-creator-price-quote')
    || !await nestedHashValid(preflight.estimate, 'estimateHash', 'storyforge.text-open-world-creator-production-estimate', [1, 2])
    || !await nestedHashValid(confirmation, 'confirmationHash', 'storyforge.text-open-world-creator-production-preflight-confirmation')) {
    fail('Start 内的生产准备快照 Hash 无效')
  }
  if (preflight.ready !== true || !Array.isArray(preflight.blockers) || preflight.blockers.length !== 0
    || !preflight.priceQuote || !confirmation.acknowledgement
    || Object.values(confirmation.acknowledgement).some(value => value !== true)) {
    fail('Start 内的生产准备快照没有完成授权')
  }
  const rightsBasis = row.rightsBasis as TextOpenWorldSourceRightsBasisV1
  if (!['author-owned', 'licensed', 'public-domain'].includes(rightsBasis)) fail('rightsBasis 无效')
  const parsed: TextOpenWorldCreatorProductionStartV1 = {
    schema: 'storyforge.text-open-world-creator-production-start',
    version: 1,
    productType: 'text-open-world',
    productInstanceKey: stableKey(row.productInstanceKey, 'productInstanceKey'),
    briefRevision: positiveInteger(row.briefRevision, 'briefRevision'),
    briefHash: hash(row.briefHash, 'briefHash'),
    sourceBindingHash: hash(row.sourceBindingHash, 'sourceBindingHash'),
    sourcePlanHash: hash(row.sourcePlanHash, 'sourcePlanHash'),
    preflight,
    confirmation,
    executionBrief,
    executionBriefHash,
    productionPlanControlEpoch: nonNegativeInteger(
      row.productionPlanControlEpoch,
      'productionPlanControlEpoch',
    ),
    productionPlanHash: hash(row.productionPlanHash, 'productionPlanHash'),
    authorStartRevision: nonNegativeInteger(row.authorStartRevision, 'authorStartRevision'),
    authorizationNonceHash: hash(row.authorizationNonceHash, 'authorizationNonceHash'),
    rightsBasis,
    rightsNote: normalizedText(row.rightsNote, 'rightsNote', 2_000),
    authorizedAt: nonNegativeInteger(row.authorizedAt, 'authorizedAt'),
    startHash: hash(row.startHash, 'startHash'),
  }
  const { startHash, ...body } = parsed
  if (await hashProductProductionValueV2(body) !== startHash) fail('Start Hash 不匹配')
  if (preflight.productInstanceKey !== parsed.productInstanceKey
    || preflight.briefHash !== parsed.briefHash
    || preflight.sourceBindingHash !== parsed.sourceBindingHash
    || confirmation.productInstanceKey !== parsed.productInstanceKey
    || confirmation.briefHash !== parsed.briefHash
    || confirmation.providerBindingHash !== preflight.providerBinding.bindingHash
    || confirmation.priceQuoteHash !== preflight.priceQuote.quoteHash
    || confirmation.estimateHash !== preflight.estimate.estimateHash) {
    fail('Start 的 Brief、来源、模型、报价或预算链不闭合')
  }
  const verifiedBrief = input.brief ? await verifyTextOpenWorldCreatorBriefV1(input.brief) : undefined
  if (verifiedBrief && (parsed.productInstanceKey !== verifiedBrief.productInstanceKey
    || parsed.briefRevision !== verifiedBrief.revision || parsed.briefHash !== verifiedBrief.briefHash
    || parsed.sourceBindingHash !== verifiedBrief.sourceBindingHash)) fail('Start 与 Creator Brief 不一致')
  const actorKey = verifiedBrief?.draft.protagonistSourceResourceKey
  if (actorKey && (!sameJson(executionBrief.intent.protagonistRefs, [actorKey]) ||
    !sameJson(executionBrief.source.startingPoint.protagonistRefs, [actorKey]) ||
    !executionBrief.source.selection.resourceKeys.includes(actorKey) ||
    !executionBrief.intent.coreExperience.includes(verifiedBrief!.draft.protagonistDirective) ||
    !executionBrief.intent.coreExperience.includes(verifiedBrief!.draft.primaryConflict))) {
    fail('Start 执行简报没有保留准确的封存主角及作者约束')
  }
  if (input.sourcePlan) {
    const sourcePlan = await parseTextOpenWorldCreatorProductionSourcePlanV1(input.sourcePlan, verifiedBrief)
    if (actorKey && (sourcePlan.selection.kind !== 'world-release' || !sourcePlan.selection.resourceKeys.includes(actorKey)))
      fail('Start 主角不在冻结 SourcePlan 中')
    if (parsed.sourcePlanHash !== sourcePlan.planHash) fail('Start 与 SourcePlan 不一致')
  }
  if (input.productionPlan) {
    const plan = parseProductProductionPlanV3(input.productionPlan, executionBrief, parsed.briefHash)
    if (plan.controlEpoch !== parsed.productionPlanControlEpoch
      || await hashProductProductionValueV2(plan) !== parsed.productionPlanHash) {
      fail('Start 与生产 Plan 不一致')
    }
  }
  return parsed
}
