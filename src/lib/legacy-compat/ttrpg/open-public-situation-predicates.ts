
import type { TtrpgPredicateFactSnapshotV1 } from './predicate';

export interface TtrpgOpenPublicPredicateScopeV1 {
  invariantFacts: readonly TtrpgPredicateFactSnapshotV1[]
  sessionFacts: readonly TtrpgPredicateFactSnapshotV1[]
  clocks: readonly { clockKey: string }[]
  observedEvidenceRefs: readonly string[]
  recipientActorKeys: readonly string[]
}
/** This declaration is delivered in full, so a model need not probe the private runtime. */
export function describeTtrpgOpenPublicPredicateScopeV1<T extends TtrpgOpenPublicPredicateScopeV1 & { worldTurn: number }>(scope: T) {
  return { schema: 'storyforge.ttrpg-open-public-situation-predicate-scope', version: 1,
    worldTurn: scope.worldTurn, recipientActorKeys: scope.recipientActorKeys, invariantFacts: scope.invariantFacts,
    sessionFacts: scope.sessionFacts, clocks: scope.clocks, observedEvidenceRefs: scope.observedEvidenceRefs,
    supportedOperations: ['all', 'any', 'not', 'world-turn-at-least', 'clock-at-least', 'evidence-known-by', 'world-fact', 'session-fact'],
    unsupportedPredicatesMustBeRejectedWithoutReadingHiddenOwners: true }
}
