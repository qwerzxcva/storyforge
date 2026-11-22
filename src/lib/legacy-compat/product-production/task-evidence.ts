import type { ProductProductionPlanV3 } from '../../types/index';
import { isSha256Hash } from './hash';

export interface ProductProductionPortableTaskLedgerEntryV1 {
  taskKey: string
  attempt: number
  status: 'settled'
  idempotencyKey: string
  candidateHash: string
  terminalReceiptHash: string
  passedGateIds: string[]
  usage: ProductProductionPortableTaskUsageV1
  errorCode: null
}

export interface ProductProductionPortableTaskUsageV1 {
  modelCalls: number
  inputTokens: number
  outputTokens: number
  mediaCalls: number
  costUsd: number | null
  durationMs: number
  storageBytes: number
}

function evidenceRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[product-production-evidence] ${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function safeNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`[product-production-evidence] ${label} 必须是非负整数`)
  }
  return Number(value)
}

function portableUsage(value: unknown, label: string): ProductProductionPortableTaskUsageV1 {
  const row = evidenceRecord(value, label)
  const exact = [
    'modelCalls', 'inputTokens', 'outputTokens', 'mediaCalls', 'costUsd', 'durationMs', 'storageBytes',
  ]
  if (Object.keys(row).some(key => !exact.includes(key)) || exact.some(key => !(key in row))) {
    throw new Error(`[product-production-evidence] ${label} 字段不精确`)
  }
  const costUsd = row.costUsd
  if (costUsd !== null && (typeof costUsd !== 'number' || !Number.isFinite(costUsd) || costUsd < 0)) {
    throw new Error(`[product-production-evidence] ${label}.costUsd 无效`)
  }
  return {
    modelCalls: safeNonNegativeInteger(row.modelCalls, `${label}.modelCalls`),
    inputTokens: safeNonNegativeInteger(row.inputTokens, `${label}.inputTokens`),
    outputTokens: safeNonNegativeInteger(row.outputTokens, `${label}.outputTokens`),
    mediaCalls: safeNonNegativeInteger(row.mediaCalls, `${label}.mediaCalls`),
    costUsd: costUsd as number | null,
    durationMs: safeNonNegativeInteger(row.durationMs, `${label}.durationMs`),
    storageBytes: safeNonNegativeInteger(row.storageBytes, `${label}.storageBytes`),
  }
}

/**
 * Removes physical Run ids from the terminal task ledger while preserving all
 * task outcomes that affect a sealed Build. The result remains stable after a
 * project export/import rebinds local primary keys.
 */
export function parseProductProductionPortableTaskLedgerV1(input: {
  budgetLedgerJson: string
  plan: ProductProductionPlanV3
}): ProductProductionPortableTaskLedgerEntryV1[] {
  let parsed: unknown
  try { parsed = JSON.parse(input.budgetLedgerJson) } catch {
    throw new Error('[product-production-evidence] budget ledger JSON 损坏')
  }
  const ledger = evidenceRecord(parsed, 'budget ledger')
  if (ledger.schema !== 'storyforge.product-production-budget-ledger'
    || ![1, 2].includes(Number(ledger.version))) {
    throw new Error('[product-production-evidence] budget ledger 版本无效')
  }
  const tasks = evidenceRecord(ledger.tasks, 'budget ledger.tasks')
  const planKeys = [...input.plan.tasks.map(task => task.taskKey)].sort()
  const ledgerKeys = Object.keys(tasks).sort()
  if (JSON.stringify(planKeys) !== JSON.stringify(ledgerKeys)) {
    throw new Error('[product-production-evidence] terminal ledger 未精确覆盖 Plan tasks')
  }
  return planKeys.map(taskKey => {
    const row = evidenceRecord(tasks[taskKey], `budget ledger.tasks.${taskKey}`)
    const expectedKeys = [
      'runId', 'attempt', 'status', 'idempotencyKey', 'candidateHash', 'terminalReceiptHash',
      'passedGateIds', 'usage', 'errorCode',
    ]
    if (Object.keys(row).some(key => !expectedKeys.includes(key))
      || expectedKeys.some(key => !(key in row))
      || !Number.isSafeInteger(row.runId) || Number(row.runId) < 1
      || row.status !== 'settled' || row.errorCode !== null
      || !isSha256Hash(row.idempotencyKey) || !isSha256Hash(row.candidateHash)
      || !isSha256Hash(row.terminalReceiptHash)
      || !Array.isArray(row.passedGateIds)
      || row.passedGateIds.some(gate => typeof gate !== 'string' || !gate.trim())
      || new Set(row.passedGateIds).size !== row.passedGateIds.length) {
      throw new Error(`[product-production-evidence] terminal ledger task 无效:${taskKey}`)
    }
    return {
      taskKey,
      attempt: safeNonNegativeInteger(row.attempt, `budget ledger.tasks.${taskKey}.attempt`),
      status: 'settled' as const,
      idempotencyKey: row.idempotencyKey,
      candidateHash: row.candidateHash,
      terminalReceiptHash: row.terminalReceiptHash,
      passedGateIds: [...row.passedGateIds].sort(),
      usage: portableUsage(row.usage, `budget ledger.tasks.${taskKey}.usage`),
      errorCode: null,
    }
  })
}
