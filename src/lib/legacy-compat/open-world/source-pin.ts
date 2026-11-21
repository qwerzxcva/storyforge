
import { canonicalProductProductionJsonV2, hashProductProductionValueV2, isSha256Hash } from '../product-production/hash';
import { TEXT_OPEN_WORLD_SOURCE_PIN_LIMITS_V1 } from './source-pin-contract';
import { validatePortableWorldReferenceV1 } from '../../world-engine/world-reference';
import { countWords } from '../../utils/html';
import { WORLD_CAPABILITY_AREAS } from '../../registry/types';
import type { TextOpenWorldSourceAuthorizationV1, TextOpenWorldSourceKindV1, TextOpenWorldSourcePermissionV1, TextOpenWorldSourcePinBundleV1, TextOpenWorldSourcePinSourceV1, TextOpenWorldSourcePinUnitRefV1, TextOpenWorldSourcePinUnitV1, TextOpenWorldSourcePinV1 } from '../../types/index';

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const MAX_SOURCE_UNIT_CHARS = 200_000
const MAX_SOURCE_UNITS = TEXT_OPEN_WORLD_SOURCE_PIN_LIMITS_V1.maximumUnits
const MAX_SOURCE_TOTAL_CHARS = TEXT_OPEN_WORLD_SOURCE_PIN_LIMITS_V1.maximumTotalChars
const WORLD_PERMISSIONS: TextOpenWorldSourcePermissionV1[] = [
  'derive-text-open-world',
  'read-world-release-catalog',
  'read-world-release-original',
]
const NOVEL_PERMISSIONS: TextOpenWorldSourcePermissionV1[] = [
  'derive-text-open-world',
  'freeze-product-private-novel',
  'read-frozen-novel',
]

type SourceUnitIdentityInputV1 = Pick<
  TextOpenWorldSourcePinUnitRefV1,
  | 'unitKey'
  | 'kind'
  | 'order'
  | 'partIndex'
  | 'partCount'
  | 'readDepth'
  | 'sourceResourceKey'
  | 'sourceArea'
  | 'sourceResourceKind'
  | 'label'
  | 'sourceContentHash'
  | 'charCount'
  | 'wordCount'
>

function fail(message: string): never {
  throw new Error(`[text-open-world-source-pin] ${message}`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} 字段不精确`)
  }
}

function stableKey(value: string, label: string): string {
  const normalized = value.trim()
  if (!STABLE_KEY.test(normalized)) fail(`${label} 不是稳定 key`)
  return normalized
}

function nonEmptyText(value: string, label: string, maximum = 10_000): string {
  const normalized = value.trim().normalize('NFC')
  if (!normalized || normalized.length > maximum) fail(`${label} 为空或过长`)
  return normalized
}

function timestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} 不是合法时间`)
  return value
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} 必须是正整数`)
  return value
}

function expectedPermissions(kind: TextOpenWorldSourceKindV1): TextOpenWorldSourcePermissionV1[] {
  return kind === 'world-release' ? [...WORLD_PERMISSIONS] : [...NOVEL_PERMISSIONS]
}

function unitRef(
  payload: TextOpenWorldSourcePinUnitV1,
  artifactContentHash: string,
): TextOpenWorldSourcePinUnitRefV1 {
  return {
    unitKey: payload.unitKey,
    artifactKey: payload.artifactKey,
    artifactContentHash,
    kind: payload.kind,
    label: payload.label,
    order: payload.order,
    partIndex: payload.partIndex,
    partCount: payload.partCount,
    readDepth: payload.readDepth,
    sourceResourceKey: payload.sourceResourceKey,
    sourceArea: payload.sourceArea,
    sourceResourceKind: payload.sourceResourceKind,
    sourceContentHash: payload.sourceContentHash,
    charCount: payload.charCount,
    wordCount: payload.wordCount,
  }
}

function sourceUnitIdentity(ref: SourceUnitIdentityInputV1): unknown {
  return {
    unitKey: ref.unitKey,
    kind: ref.kind,
    order: ref.order,
    partIndex: ref.partIndex,
    partCount: ref.partCount,
    readDepth: ref.readDepth,
    sourceResourceKey: ref.sourceResourceKey,
    sourceArea: ref.sourceArea,
    sourceResourceKind: ref.sourceResourceKind,
    label: ref.label,
    sourceContentHash: ref.sourceContentHash,
    charCount: ref.charCount,
    wordCount: ref.wordCount,
  }
}

async function sourceBoundaryHash(input: {
  sourceVersionHash: string
  source: TextOpenWorldSourcePinSourceV1
  units: readonly SourceUnitIdentityInputV1[]
}): Promise<string> {
  return hashProductProductionValueV2({
    sourceVersionHash: input.sourceVersionHash,
    source: input.source,
    units: input.units.map(sourceUnitIdentity),
  })
}

async function readEvidenceHash(input: TextOpenWorldSourcePinV1['readEvidence'], units: TextOpenWorldSourcePinUnitRefV1[]): Promise<string> {
  return hashProductProductionValueV2({
    method: input.method,
    readDepth: input.readDepth,
    unitCount: input.unitCount,
    totalChars: input.totalChars,
    totalWords: input.totalWords,
    capturedAt: input.capturedAt,
    units: units.map(sourceUnitIdentity),
  })
}

async function validateAuthorization(input: TextOpenWorldSourceAuthorizationV1): Promise<void> {
  exactKeys(record(input, 'SourcePin authorization'), [
    'schema', 'version', 'productInstanceKey', 'sourceKind', 'sourceVersionHash',
    'sourceBoundaryHash', 'briefRevision', 'briefHash', 'authorStartRevision',
    'authorizationNonceHash', 'rightsBasis', 'rightsNote', 'permissions',
    'authorizedAt', 'authorizationHash',
  ], 'SourcePin authorization')
  if (input.schema !== 'storyforge.text-open-world-source-authorization' || input.version !== 1) {
    fail('授权合同身份无效')
  }
  stableKey(input.productInstanceKey, 'authorization.productInstanceKey')
  positiveInteger(input.briefRevision, 'authorization.briefRevision')
  positiveInteger(input.authorStartRevision, 'authorization.authorStartRevision')
  for (const hash of [
    input.sourceVersionHash, input.sourceBoundaryHash, input.briefHash,
    input.authorizationNonceHash, input.authorizationHash,
  ]) if (!isSha256Hash(hash)) fail('授权 Hash 非法')
  if (!['author-owned', 'licensed', 'public-domain'].includes(input.rightsBasis)) fail('授权 rightsBasis 非法')
  if (typeof input.rightsNote !== 'string' || input.rightsNote.length > 2_000) fail('授权 rightsNote 非法')
  const permissions = expectedPermissions(input.sourceKind)
  if (JSON.stringify(input.permissions) !== JSON.stringify(permissions)) fail('授权 permission 不是系统派生值')
  timestamp(input.authorizedAt, 'authorization.authorizedAt')
  const { authorizationHash, ...body } = input
  if (await hashProductProductionValueV2(body) !== authorizationHash) fail('授权 Hash 不匹配')
}

export async function validateTextOpenWorldSourcePinUnitV1(
  value: unknown,
): Promise<TextOpenWorldSourcePinUnitV1> {
  const row = record(value, 'SourcePinUnit') as unknown as TextOpenWorldSourcePinUnitV1
  exactKeys(row as unknown as Record<string, unknown>, [
    'schema', 'version', 'productInstanceKey', 'sourceKind', 'unitKey', 'artifactKey',
    'kind', 'label', 'order', 'partIndex', 'partCount', 'readDepth', 'sourceResourceKey',
    'sourceArea', 'sourceResourceKind', 'sourceContentHash', 'contentText', 'charCount',
    'wordCount', 'capturedAt',
  ], 'SourcePinUnit')
  if (row.schema !== 'storyforge.text-open-world-source-pin-unit' || row.version !== 1) {
    fail('SourcePinUnit 合同身份无效')
  }
  stableKey(row.productInstanceKey, 'unit.productInstanceKey')
  stableKey(row.unitKey, 'unit.unitKey')
  stableKey(row.artifactKey, 'unit.artifactKey')
  if (!/^text-open-world\.source-pin-unit(?:\.\d{5})?$/.test(row.artifactKey)) fail('unit.artifactKey 不属于 P0')
  if (!['world-release', 'novel'].includes(row.sourceKind)) fail('unit.sourceKind 非法')
  if (!['world-resource', 'work-metadata', 'story-core', 'outline-node', 'chapter'].includes(row.kind)) {
    fail('unit.kind 非法')
  }
  nonEmptyText(row.label, 'unit.label', 1_000)
  if (!Number.isSafeInteger(row.order) || row.order < 0
    || !Number.isSafeInteger(row.partIndex) || row.partIndex < 1
    || !Number.isSafeInteger(row.partCount) || row.partCount < row.partIndex) fail('unit 顺序或分片非法')
  if (!isSha256Hash(row.sourceContentHash)) fail('unit.sourceContentHash 非法')
  timestamp(row.capturedAt, 'unit.capturedAt')
  if (row.sourceKind === 'world-release') {
    if (row.kind !== 'world-resource' || row.readDepth !== 'index' || row.contentText !== null
      || !row.sourceResourceKey || !WORLD_CAPABILITY_AREAS.includes(row.sourceArea as never)
      || typeof row.sourceResourceKind !== 'string'
      || nonEmptyText(row.sourceResourceKind, 'unit.sourceResourceKind', 200) !== row.sourceResourceKind
      || row.charCount !== 0 || row.wordCount !== 0 || row.partIndex !== 1 || row.partCount !== 1) {
      fail('WorldRelease unit 必须是无正文的 index 证据')
    }
  } else {
    if (row.kind === 'world-resource' || row.readDepth !== 'full' || typeof row.contentText !== 'string'
      || row.sourceResourceKey !== null || row.sourceArea !== null || row.sourceResourceKind !== null) {
      fail('小说 unit 必须是产品私有 full copy')
    }
    if (!row.contentText || row.contentText.length > MAX_SOURCE_UNIT_CHARS
      || row.charCount !== row.contentText.length || row.wordCount !== countWords(row.contentText)
      || await hashProductProductionValueV2(row.contentText) !== row.sourceContentHash) {
      fail('小说 unit 正文、计数或 Hash 不匹配')
    }
  }
  return structuredClone(row)
}

export async function validateTextOpenWorldSourcePinV1(value: unknown): Promise<TextOpenWorldSourcePinV1> {
  const pin = record(value, 'SourcePin') as unknown as TextOpenWorldSourcePinV1
  exactKeys(pin as unknown as Record<string, unknown>, [
    'schema', 'version', 'canonicalJsonVersion', 'productType', 'productInstanceKey',
    'sourceKind', 'sourceVersionHash', 'sourceBoundaryHash', 'source', 'authorization',
    'units', 'readEvidence', 'createdAt', 'pinHash',
  ], 'SourcePin')
  if (pin.schema !== 'storyforge.text-open-world-source-pin' || pin.version !== 1
    || pin.canonicalJsonVersion !== 2 || pin.productType !== 'text-open-world') fail('SourcePin 合同身份无效')
  stableKey(pin.productInstanceKey, 'pin.productInstanceKey')
  const pinSource = record(pin.source, 'SourcePin source')
  const pinAuthorization = record(pin.authorization, 'SourcePin authorization')
  const pinReadEvidence = record(pin.readEvidence, 'SourcePin readEvidence')
  if (!['world-release', 'novel'].includes(pin.sourceKind) || pinSource.kind !== pin.sourceKind) fail('SourcePin 来源类型冲突')
  for (const hash of [pin.sourceVersionHash, pin.sourceBoundaryHash, pin.pinHash]) {
    if (!isSha256Hash(hash)) fail('SourcePin Hash 非法')
  }
  if (!Array.isArray(pin.units) || !pin.units.length || pin.units.length > MAX_SOURCE_UNITS) {
    fail('SourcePin unit refs 为空或超过上限')
  }
  const keys = new Set<string>()
  const artifacts = new Set<string>()
  for (const [index, unit] of pin.units.entries()) {
    exactKeys(unit as unknown as Record<string, unknown>, [
      'unitKey', 'artifactKey', 'artifactContentHash', 'kind', 'label', 'order',
      'partIndex', 'partCount', 'readDepth', 'sourceResourceKey', 'sourceArea',
      'sourceResourceKind', 'sourceContentHash', 'charCount', 'wordCount',
    ], 'Pin unit ref')
    stableKey(unit.unitKey, 'pin.unitKey')
    stableKey(unit.artifactKey, 'pin.artifactKey')
    if (!/^text-open-world\.source-pin-unit(?:\.\d{5})?$/.test(unit.artifactKey)
      || !isSha256Hash(unit.artifactContentHash) || !isSha256Hash(unit.sourceContentHash)
      || !['world-resource', 'work-metadata', 'story-core', 'outline-node', 'chapter'].includes(unit.kind)
      || !['index', 'full'].includes(unit.readDepth)
      || typeof unit.label !== 'string' || nonEmptyText(unit.label, 'pin.unit.label', 1_000) !== unit.label
      || !Number.isSafeInteger(unit.order) || unit.order !== index
      || !Number.isSafeInteger(unit.partIndex) || unit.partIndex < 1
      || !Number.isSafeInteger(unit.partCount) || unit.partCount < unit.partIndex
      || !Number.isSafeInteger(unit.charCount) || unit.charCount < 0
      || !Number.isSafeInteger(unit.wordCount) || unit.wordCount < 0
      || (unit.sourceResourceKey !== null
        && (typeof unit.sourceResourceKey !== 'string' || !STABLE_KEY.test(unit.sourceResourceKey)))
      || (unit.sourceArea !== null && !WORLD_CAPABILITY_AREAS.includes(unit.sourceArea as never))
      || (unit.sourceResourceKind !== null
        && (typeof unit.sourceResourceKind !== 'string'
          || nonEmptyText(unit.sourceResourceKind, 'pin.unit.sourceResourceKind', 200)
            !== unit.sourceResourceKind))) {
      fail('Pin unit 引用字段非法')
    }
    if (keys.has(unit.unitKey) || artifacts.has(unit.artifactKey)) fail('Pin unit key/order 不唯一')
    keys.add(unit.unitKey)
    artifacts.add(unit.artifactKey)
  }
  if (pin.sourceKind === 'world-release') {
    const source = pin.source as Extract<TextOpenWorldSourcePinSourceV1, { kind: 'world-release' }>
    exactKeys(record(source, 'WorldRelease SourcePin source'), [
      'kind', 'worldReference', 'releaseUid', 'releaseVersion', 'releaseHash',
      'sourceManifestHash', 'catalogHash', 'selection',
    ], 'WorldRelease SourcePin source')
    exactKeys(record(source.selection, 'WorldRelease SourcePin selection'), [
      'mode', 'selectedResourceKeys',
    ], 'WorldRelease SourcePin selection')
    await validatePortableWorldReferenceV1(source.worldReference)
    if (source.worldReference.localReleaseRecordId !== 0
      || source.releaseUid !== source.worldReference.releaseUid
      || source.releaseVersion !== source.worldReference.releaseVersion
      || source.releaseHash !== source.worldReference.releaseHash
      || source.catalogHash !== source.worldReference.capabilityIdentity.catalogHash
      || source.releaseHash !== pin.sourceVersionHash
      || !isSha256Hash(source.sourceManifestHash)
      || source.selection.selectedResourceKeys.length !== pin.units.length
      || new Set(source.selection.selectedResourceKeys).size !== source.selection.selectedResourceKeys.length
      || JSON.stringify(source.selection.selectedResourceKeys) !== JSON.stringify([...source.selection.selectedResourceKeys].sort())
      || JSON.stringify(pin.units.map(unit => unit.sourceResourceKey)) !== JSON.stringify(source.selection.selectedResourceKeys)
      || pin.units.some(unit => unit.kind !== 'world-resource' || unit.readDepth !== 'index'
        || !unit.sourceResourceKey || unit.sourceArea == null || unit.sourceResourceKind == null
        || !source.selection.selectedResourceKeys.includes(unit.sourceResourceKey))) {
      fail('WorldRelease SourcePin 身份、选择或 unit 闭包不一致')
    }
  } else {
    const source = pin.source as Extract<TextOpenWorldSourcePinSourceV1, { kind: 'novel' }>
    exactKeys(record(source, 'Novel SourcePin source'), [
      'kind', 'workCode', 'workTitle', 'snapshotVersion', 'sourceUpdatedAt',
      'sourceContentHash', 'coverage', 'selection',
    ], 'Novel SourcePin source')
    exactKeys(record(source.selection, 'Novel SourcePin selection'), [
      'mode', 'label', 'selectedChapterCount', 'selectedOutlineCount',
    ], 'Novel SourcePin selection')
    stableKey(source.workCode, 'source.workCode')
    nonEmptyText(source.workTitle, 'source.workTitle', 500)
    if (source.snapshotVersion !== 1 || source.sourceContentHash !== pin.sourceVersionHash
      || !['full-text', 'outline-only'].includes(source.coverage)
      || !['entire-work', 'outline-subtree', 'chapter-range', 'chapters'].includes(source.selection.mode)
      || !Number.isSafeInteger(source.selection.selectedChapterCount) || source.selection.selectedChapterCount < 0
      || !Number.isSafeInteger(source.selection.selectedOutlineCount) || source.selection.selectedOutlineCount < 0
      || pin.units.some(unit => unit.kind === 'world-resource' || unit.readDepth !== 'full'
        || unit.sourceResourceKey !== null || unit.sourceArea !== null
        || unit.sourceResourceKind !== null)) fail('小说 SourcePin 身份、选择或 unit 闭包不一致')
    timestamp(source.sourceUpdatedAt, 'source.sourceUpdatedAt')
    const expectedSourceContentHash = await hashProductProductionValueV2({
      workCode: source.workCode,
      selectionMode: source.selection.mode,
      units: pin.units.map(sourceUnitIdentity),
    })
    if (expectedSourceContentHash !== source.sourceContentHash) fail('小说 SourcePin sourceContentHash 不匹配')
  }
  if (pinAuthorization.productInstanceKey !== pin.productInstanceKey
    || pin.authorization.sourceKind !== pin.sourceKind
    || pin.authorization.sourceVersionHash !== pin.sourceVersionHash
    || pin.authorization.sourceBoundaryHash !== pin.sourceBoundaryHash) fail('SourcePin 授权绑定不一致')
  await validateAuthorization(pin.authorization)
  exactKeys(pinReadEvidence, [
    'method', 'readDepth', 'unitCount', 'totalChars', 'totalWords', 'evidenceHash',
    'capturedAt',
  ], 'SourcePin readEvidence')
  const expectedBoundary = await sourceBoundaryHash({
    sourceVersionHash: pin.sourceVersionHash,
    source: pin.source,
    units: pin.units,
  })
  if (expectedBoundary !== pin.sourceBoundaryHash) fail('SourcePin sourceBoundaryHash 不匹配')
  const totals = pin.units.reduce((result, item) => ({
    chars: result.chars + item.charCount,
    words: result.words + item.wordCount,
  }), { chars: 0, words: 0 })
  if (totals.chars > MAX_SOURCE_TOTAL_CHARS
    || pin.readEvidence.unitCount !== pin.units.length
    || pin.readEvidence.totalChars !== totals.chars
    || pin.readEvidence.totalWords !== totals.words
    || pin.readEvidence.capturedAt !== pin.createdAt
    || pin.readEvidence.method !== (pin.sourceKind === 'world-release' ? 'world-release-index' : 'novel-private-full-copy')
    || pin.readEvidence.readDepth !== (pin.sourceKind === 'world-release' ? 'index' : 'full')
    || !isSha256Hash(pin.readEvidence.evidenceHash)
    || await readEvidenceHash(pin.readEvidence, pin.units) !== pin.readEvidence.evidenceHash) {
    fail('SourcePin 实际读取证据不一致')
  }
  if (pin.authorization.authorizedAt > pin.createdAt) fail('SourcePin 早于作者授权')
  const { pinHash, ...body } = pin
  if (await hashProductProductionValueV2(body) !== pinHash) fail('SourcePin pinHash 不匹配')
  return structuredClone(pin)
}

export async function validateTextOpenWorldSourcePinBundleV1(
  value: TextOpenWorldSourcePinBundleV1,
): Promise<TextOpenWorldSourcePinBundleV1> {
  const pin = await validateTextOpenWorldSourcePinV1(value.pin)
  if (!Array.isArray(value.units) || value.units.length !== pin.units.length) fail('SourcePin unit Artifact 数量不一致')
  const payloadByArtifact = new Map<string, TextOpenWorldSourcePinBundleV1['units'][number]>()
  for (const item of value.units) {
    const payload = await validateTextOpenWorldSourcePinUnitV1(item.payload)
    if (!isSha256Hash(item.artifactContentHash)
      || await hashProductProductionValueV2(payload) !== item.artifactContentHash
      || payload.capturedAt !== pin.createdAt
      || payloadByArtifact.has(payload.artifactKey)) fail('SourcePin unit Artifact Hash 或 key 不一致')
    payloadByArtifact.set(payload.artifactKey, { payload, artifactContentHash: item.artifactContentHash })
  }
  for (const ref of pin.units) {
    const item = payloadByArtifact.get(ref.artifactKey)
    if (!item || item.payload.productInstanceKey !== pin.productInstanceKey
      || item.payload.sourceKind !== pin.sourceKind
      || canonicalProductProductionJsonV2(unitRef(item.payload, item.artifactContentHash))
        !== canonicalProductProductionJsonV2(ref)) {
      fail(`SourcePin unit Artifact 未闭合:${ref.artifactKey}`)
    }
  }
  return { pin, units: pin.units.map(ref => payloadByArtifact.get(ref.artifactKey)!) }
}
