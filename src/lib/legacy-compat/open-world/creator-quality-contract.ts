
import { isSha256Hash } from '../product-production/hash';
export const TEXT_OPEN_WORLD_CREATOR_RELEASE_QUALITY_GATE_ID_V1 = 'text-open-world.creator.release-quality'

export interface TextOpenWorldCreatorBuildBindingV1 {
  productionKey: string
  buildNumber: number
  packageHash: string
  previewHash: string
  manifestHash: string
  qualityReportHash: string
  rootTerminalReceiptHash: string
}

export interface TextOpenWorldCreatorReleaseQualityEvidenceV1 {
  schema: 'storyforge.text-open-world-creator-release-quality-evidence'
  version: 1 | 2
  /** Version 2 freezes the calibration and optional visual join for portable verification. */
  calibrationReceiptHash?: string
  visualReviewReceiptHash?: string | null
  build: TextOpenWorldCreatorBuildBindingV1
  hardGateReceiptHash: string
  semanticDecisionReceiptHash: string
  grayboxReceiptHash: string
  issueReceiptHashes: string[]
  issueWaiverReceiptHashes: string[]
  issueSetHash: string
  status: 'passed'
  completedAt: number
}

function fail(message: string): never {
  throw new Error(`[text-open-world-creator-quality-contract] ${message}`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} 字段不符合合同:${actual.join(',')}`)
  }
}

function text(value: unknown, label: string, maximum: number, minimum = 1): string {
  if (typeof value !== 'string') fail(`${label} 必须是文本`)
  const normalized = value.trim().normalize('NFC')
  if (normalized.length < minimum || normalized.length > maximum) fail(`${label} 长度无效`)
  return normalized
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || Number(value) < minimum) fail(`${label} 无效`)
  return Number(value)
}

function hash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isSha256Hash(value)) fail(`${label} 不是SHA-256`)
  return value
}

function hashList(value: unknown, label: string, maximum = 10_000): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} 无效`)
  const rows = value.map((item, index) => hash(item, `${label}[${index}]`))
  if (new Set(rows).size !== rows.length || [...rows].sort().some((item, index) => item !== rows[index])) {
    fail(`${label} 必须唯一排序`)
  }
  return rows
}

export function parseTextOpenWorldCreatorBuildBindingV1(value: unknown): TextOpenWorldCreatorBuildBindingV1 {
  const row = record(value, 'build')
  exactKeys(row, [
    'productionKey', 'buildNumber', 'packageHash', 'previewHash', 'manifestHash',
    'qualityReportHash', 'rootTerminalReceiptHash',
  ], 'build')
  return {
    productionKey: text(row.productionKey, 'productionKey', 200),
    buildNumber: integer(row.buildNumber, 'buildNumber', 1),
    packageHash: hash(row.packageHash, 'packageHash'),
    previewHash: hash(row.previewHash, 'previewHash'),
    manifestHash: hash(row.manifestHash, 'manifestHash'),
    qualityReportHash: hash(row.qualityReportHash, 'qualityReportHash'),
    rootTerminalReceiptHash: hash(row.rootTerminalReceiptHash, 'rootTerminalReceiptHash'),
  }
}

export function parseTextOpenWorldCreatorReleaseQualityEvidenceV1(value: unknown): TextOpenWorldCreatorReleaseQualityEvidenceV1 {
  const row = record(value, 'release quality evidence')
  exactKeys(row, [
    'schema', 'version', 'build', 'hardGateReceiptHash', 'semanticDecisionReceiptHash',
    'grayboxReceiptHash', 'issueReceiptHashes', 'issueWaiverReceiptHashes', 'issueSetHash',
    'status', 'completedAt',
    ...(row.version === 2 ? ['calibrationReceiptHash', 'visualReviewReceiptHash'] : []),
  ], 'release quality evidence')
  if (row.schema !== 'storyforge.text-open-world-creator-release-quality-evidence' || (row.version !== 1 && row.version !== 2)
    || row.status !== 'passed') fail('release quality evidence 身份或状态无效')
  return {
    schema: 'storyforge.text-open-world-creator-release-quality-evidence', version: row.version as 1 | 2,
    ...(row.version === 2 ? {
      calibrationReceiptHash: hash(row.calibrationReceiptHash, 'calibrationReceiptHash'),
      visualReviewReceiptHash: row.visualReviewReceiptHash === null ? null : hash(row.visualReviewReceiptHash, 'visualReviewReceiptHash'),
    } : {}),
    build: parseTextOpenWorldCreatorBuildBindingV1(row.build),
    hardGateReceiptHash: hash(row.hardGateReceiptHash, 'hardGateReceiptHash'),
    semanticDecisionReceiptHash: hash(row.semanticDecisionReceiptHash, 'semanticDecisionReceiptHash'),
    grayboxReceiptHash: hash(row.grayboxReceiptHash, 'grayboxReceiptHash'),
    issueReceiptHashes: hashList(row.issueReceiptHashes, 'issueReceiptHashes'),
    issueWaiverReceiptHashes: hashList(row.issueWaiverReceiptHashes, 'issueWaiverReceiptHashes'),
    issueSetHash: hash(row.issueSetHash, 'issueSetHash'), status: 'passed',
    completedAt: integer(row.completedAt, 'completedAt', 1),
  }
}
