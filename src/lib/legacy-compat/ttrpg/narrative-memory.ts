import type { TtrpgOpenAudience } from './open-contract';
import * as p from './open-contract-parse'

export type TtrpgNarrativeMemoryReliabilityV1 = 'observed' | 'hearsay' | 'belief'
export type TtrpgNarrativeMemoryAudienceV1 = TtrpgOpenAudience

export interface TtrpgNarrativeMemoryV1 {
  id?: number
  projectId: number
  worldGroupId: number | null
  worldId: number
  workId: number
  sessionId: number
  revisionKey: string
  observerKey: string | null
  reliability: TtrpgNarrativeMemoryReliabilityV1
  audience: TtrpgNarrativeMemoryAudienceV1
  knownBy: string[]
  summary: string
  fromEventSequence: number
  toEventSequence: number
  sourceSessionId: number | null
  derivedFromHash: string
  stale: boolean
  updatedAt: number
}

const MEMORY_FIELDS = [
  'projectId',
  'worldGroupId',
  'worldId',
  'workId',
  'sessionId',
  'revisionKey',
  'observerKey',
  'reliability',
  'audience',
  'knownBy',
  'summary',
  'fromEventSequence',
  'toEventSequence',
  'sourceSessionId',
  'derivedFromHash',
  'stale',
  'updatedAt',
] as const

const MEMORY_FIELDS_WITH_ID = ['id', ...MEMORY_FIELDS] as const
const RELIABILITIES = ['observed', 'hearsay', 'belief'] as const
const AUDIENCES = ['gm-only', 'party', 'private', 'public'] as const
const MAX_SAFE_SEQUENCE = Number.MAX_SAFE_INTEGER

function fail(message: string): never {
  return p.fail(`[ttrpg-narrative-memory] ${message}`)
}

function integer(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_SAFE_SEQUENCE
  ) {
    return fail(`${label}: 必须是非负安全整数`)
  }
  return value
}

function timestamp(value: unknown, label: string): number {
  return integer(value, label)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function parseMemory(value: unknown, label: string): TtrpgNarrativeMemoryV1 {
  const row = p.object(p.json(value), label)
  const hasId = hasOwn(row, 'id')
  p.exact(row, hasId ? MEMORY_FIELDS_WITH_ID : MEMORY_FIELDS, label)

  const projectId = integer(row.projectId, `${label}.projectId`)
  const worldGroupId = p.nullable(row.worldGroupId, integer, `${label}.worldGroupId`)
  const worldId = integer(row.worldId, `${label}.worldId`)
  const workId = integer(row.workId, `${label}.workId`)
  const sessionId = integer(row.sessionId, `${label}.sessionId`)
  const revisionKey = p.key(row.revisionKey, `${label}.revisionKey`)
  const observerKey = p.nullable(row.observerKey, p.key, `${label}.observerKey`)
  const reliability = p.oneOf(row.reliability, RELIABILITIES, `${label}.reliability`)
  const audience = p.oneOf(row.audience, AUDIENCES, `${label}.audience`)
  const knownBy = p.keys(row.knownBy, `${label}.knownBy`, 256, 0)
  const summary = p.text(row.summary, `${label}.summary`, 20_000)
  const fromEventSequence = integer(row.fromEventSequence, `${label}.fromEventSequence`)
  const toEventSequence = integer(row.toEventSequence, `${label}.toEventSequence`)
  const sourceSessionId = p.nullable(
    row.sourceSessionId,
    (candidate, nestedLabel) => integer(candidate, nestedLabel),
    `${label}.sourceSessionId`,
  )
  const derivedFromHash = p.hash(row.derivedFromHash, `${label}.derivedFromHash`)
  const stale = p.bool(row.stale, `${label}.stale`)
  const updatedAt = timestamp(row.updatedAt, `${label}.updatedAt`)

  if (fromEventSequence > toEventSequence) {
    fail(`${label}.fromEventSequence 不得大于 toEventSequence`)
  }
  if ((reliability === 'hearsay' || reliability === 'belief') && observerKey === null) {
    fail(`${label}.${reliability} 必须有 observerKey`)
  }
  if (audience === 'private' && knownBy.length === 0) {
    fail(`${label}.private 必须有 knownBy`)
  }

  const memory: TtrpgNarrativeMemoryV1 = {
    projectId,
    worldGroupId,
    worldId,
    workId,
    sessionId,
    revisionKey,
    observerKey,
    reliability,
    audience,
    knownBy,
    summary,
    fromEventSequence,
    toEventSequence,
    sourceSessionId,
    derivedFromHash,
    stale,
    updatedAt,
  }
  if (hasId) memory.id = integer(row.id, `${label}.id`)
  return memory
}

export function parseTtrpgNarrativeMemoryV1(value: unknown): TtrpgNarrativeMemoryV1 {
  return parseMemory(value, 'narrativeMemory')
}
