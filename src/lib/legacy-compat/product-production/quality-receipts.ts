
import type { ProductQualityGateReceiptRecordV1, ProductQualityGateReceiptStatusV1 } from '../../types/index';
import { hashProductProductionValueV2, isSha256Hash } from './hash';

export interface ProductQualityGateReceiptV1 {
  schema: 'storyforge.product-quality-gate-receipt'
  version: 1
  gateId: string
  gateVersion: string
  verifierId: string
  verifierVersion: string
  verifierKind: 'deterministic' | 'browser-runtime' | 'provider-review' | 'human-evidence'
  inputHashes: string[]
  environmentHash: string | null
  measuredJson: string
  status: ProductQualityGateReceiptStatusV1
  thresholdProfileId: string
  thresholdProfileVersion: string
  evidenceRefs: string[]
  receiptHash: string
  createdAt: number
}

function fail(message: string): never {
  throw new Error(`[product-quality-receipt] ${message}`)
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

function boundedText(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${label} 无效`)
  return value.trim().normalize('NFC')
}

function hashArray(value: unknown, label: string, maximum = 100): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} 无效`)
  const hashes = value.map(item => {
    if (typeof item !== 'string' || !isSha256Hash(item)) fail(`${label} 含无效 hash`)
    return item
  })
  if (new Set(hashes).size !== hashes.length) fail(`${label} 不能重复`)
  return hashes
}

function textArray(value: unknown, label: string, maximum = 100): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} 无效`)
  const values = value.map(item => boundedText(item, label, 2_000))
  if (new Set(values).size !== values.length) fail(`${label} 不能重复`)
  return values
}

export function parseProductQualityGateReceiptV1(value: string | unknown): ProductQualityGateReceiptV1 {
  let raw: unknown = value
  if (typeof value === 'string') {
    try { raw = JSON.parse(value) } catch { fail('receipt 不是合法 JSON') }
  }
  const row = record(raw, 'receipt')
  exactKeys(row, [
    'schema', 'version', 'gateId', 'gateVersion', 'verifierId', 'verifierVersion', 'verifierKind',
    'inputHashes', 'environmentHash', 'measuredJson', 'status', 'thresholdProfileId',
    'thresholdProfileVersion', 'evidenceRefs', 'receiptHash', 'createdAt',
  ], 'receipt')
  const verifierKinds = new Set(['deterministic', 'browser-runtime', 'provider-review', 'human-evidence'])
  const statuses = new Set(['passed', 'failed', 'needs-human', 'waived', 'skipped'])
  if (row.schema !== 'storyforge.product-quality-gate-receipt' || row.version !== 1
    || !verifierKinds.has(String(row.verifierKind)) || !statuses.has(String(row.status))
    || (row.environmentHash != null && (typeof row.environmentHash !== 'string' || !isSha256Hash(row.environmentHash)))
    || typeof row.measuredJson !== 'string' || row.measuredJson.length < 2 || row.measuredJson.length > 5_000_000
    || typeof row.receiptHash !== 'string' || !isSha256Hash(row.receiptHash)
    || !Number.isInteger(row.createdAt) || Number(row.createdAt) < 1) fail('receipt 基础字段无效')
  return {
    schema: 'storyforge.product-quality-gate-receipt', version: 1,
    gateId: boundedText(row.gateId, 'gateId'), gateVersion: boundedText(row.gateVersion, 'gateVersion'),
    verifierId: boundedText(row.verifierId, 'verifierId'), verifierVersion: boundedText(row.verifierVersion, 'verifierVersion'),
    verifierKind: row.verifierKind as ProductQualityGateReceiptV1['verifierKind'],
    inputHashes: hashArray(row.inputHashes, 'inputHashes'),
    environmentHash: row.environmentHash as string | null,
    measuredJson: row.measuredJson,
    status: row.status as ProductQualityGateReceiptStatusV1,
    thresholdProfileId: boundedText(row.thresholdProfileId, 'thresholdProfileId'),
    thresholdProfileVersion: boundedText(row.thresholdProfileVersion, 'thresholdProfileVersion'),
    evidenceRefs: textArray(row.evidenceRefs, 'evidenceRefs'),
    receiptHash: row.receiptHash,
    createdAt: Number(row.createdAt),
  }
}

async function verifyGateReceiptHash(receipt: ProductQualityGateReceiptV1): Promise<void> {
  const { receiptHash, ...body } = receipt
  if (await hashProductProductionValueV2(body) !== receiptHash) fail('receiptHash 校验失败')
}

/**
 * Product-neutral integrity check used at the portable backup boundary.
 * Product-specific readers still own the meaning of measuredJson, thresholds
 * and evidence refs; this verifier guarantees that no malformed or re-indexed
 * receipt can cross export/import and only fail much later at release time.
 */
export async function verifyProductQualityGateReceiptRecordV1(
  row: Pick<ProductQualityGateReceiptRecordV1,
    | 'gateId'
    | 'gateVersion'
    | 'verifierId'
    | 'verifierVersion'
    | 'status'
    | 'receiptJson'
    | 'receiptHash'
    | 'createdAt'
  >,
): Promise<ProductQualityGateReceiptV1> {
  const receipt = parseProductQualityGateReceiptV1(row.receiptJson)
  await verifyGateReceiptHash(receipt)
  try { JSON.parse(receipt.measuredJson) } catch { fail('measuredJson 不是合法 JSON') }
  if (row.gateId !== receipt.gateId
    || row.gateVersion !== receipt.gateVersion
    || row.verifierId !== receipt.verifierId
    || row.verifierVersion !== receipt.verifierVersion
    || row.status !== receipt.status
    || row.receiptHash !== receipt.receiptHash
    || row.createdAt !== receipt.createdAt) {
    fail('数据库索引字段与不可变 receipt 不一致')
  }
  return receipt
}
