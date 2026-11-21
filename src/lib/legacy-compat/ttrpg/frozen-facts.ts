import { frozenFact } from './open-content-predicates';
import { fail as parseFail, hash, json, list, record } from './open-contract-parse';
import type { TtrpgFrozenWorldPredicateIndexV1, TtrpgOpenFactPredicate, TtrpgOpenFrozenFactV1 } from './open-contract';

const MAX_ENTRIES = 20_000
const INDEX_FIELDS = ['worldReleaseHash', 'indexHash', 'entries'] as const

function fail(message: string): never {
  return parseFail(`[ttrpg-frozen-facts] ${message}`)
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left)
  const rightPoints = Array.from(right)
  const length = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < length; index += 1) {
    const delta = leftPoints[index].codePointAt(0)! - rightPoints[index].codePointAt(0)!
    if (delta !== 0) return delta
  }
  return leftPoints.length - rightPoints.length
}

function copyFact(value: TtrpgOpenFrozenFactV1): TtrpgOpenFrozenFactV1 {
  return {
    ...value,
    knownByActorKeys: [...value.knownByActorKeys].sort(compareCodePoints),
    sourceResourceRefs: [...value.sourceResourceRefs].sort(compareCodePoints),
    sourceFieldRefs: value.sourceFieldRefs
      .map(field => ({ ...field }))
      .sort((left, right) =>
        compareCodePoints(left.resourceKey, right.resourceKey)
        || compareCodePoints(left.fieldPath, right.fieldPath)
        || compareCodePoints(left.contentHash, right.contentHash)),
  }
}

function parseEntries(value: unknown, label: string): TtrpgOpenFrozenFactV1[] {
  const entries = list(value, label, (entry, entryLabel) => frozenFact(entry, entryLabel), MAX_ENTRIES, 0)
  const factKeys = entries.map(entry => entry.factKey)
  if (new Set(factKeys).size !== factKeys.length) fail(`${label}的factKey重复`)
  for (const entry of entries) {
    if (entry.audience === 'private' && entry.sourceResourceRefs.length === 0) {
      fail(`${label}.${entry.factKey}的private事实缺少可追溯sourceResourceRefs`)
    }
  }
  return entries
}

export function parseTtrpgFrozenWorldPredicateIndexV1(value: unknown): TtrpgFrozenWorldPredicateIndexV1 {
  const row = record(json(value), INDEX_FIELDS, 'frozenWorldPredicateIndex')
  return {
    worldReleaseHash: hash(row.worldReleaseHash, 'worldReleaseHash'),
    indexHash: hash(row.indexHash, 'indexHash'),
    entries: parseEntries(row.entries, 'entries'),
  }
}
export function lookupTtrpgFrozenWorldPredicateV1(
  index: TtrpgFrozenWorldPredicateIndexV1,
  subjectRef: string,
  predicateKey: TtrpgOpenFactPredicate,
  objectRef?: string | null,
): TtrpgOpenFrozenFactV1[]
export function lookupTtrpgFrozenWorldPredicateV1(
  index: TtrpgFrozenWorldPredicateIndexV1,
  query: { subjectRef: string; predicateKey: TtrpgOpenFactPredicate; objectRef?: string | null },
): TtrpgOpenFrozenFactV1[]
export function lookupTtrpgFrozenWorldPredicateV1(
  index: TtrpgFrozenWorldPredicateIndexV1,
  subjectOrQuery: string | { subjectRef: string; predicateKey: TtrpgOpenFactPredicate; objectRef?: string | null },
  predicateKey?: TtrpgOpenFactPredicate,
  objectRef?: string | null,
): TtrpgOpenFrozenFactV1[] {
  const parsed = parseTtrpgFrozenWorldPredicateIndexV1(index)
  const query = typeof subjectOrQuery === 'string'
    ? { subjectRef: subjectOrQuery, predicateKey: predicateKey!, objectRef }
    : subjectOrQuery
  if (typeof query.subjectRef !== 'string' || !query.subjectRef
      || typeof query.predicateKey !== 'string'
      || (query.objectRef !== undefined && query.objectRef !== null && typeof query.objectRef !== 'string')) {
    fail('lookup条件无效')
  }
  return parsed.entries
    .filter(entry =>
      entry.subjectRef === query.subjectRef
      && entry.predicateKey === query.predicateKey
      && (query.objectRef === undefined || entry.objectRef === query.objectRef))
    .map(copyFact)
}
