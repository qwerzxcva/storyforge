
/** Prepare an open child from a verified cutpoint; no parent rows or gameplay owners are changed. */
import type { ProductRuntimeState } from '../../types/index';
import { parseTtrpgRuntimeStateV2 } from './open-runtime-contract';

/** Shared deterministic reset of local execution authority; business state remains inherited. */
export function projectTtrpgOpenBranchStateV1(state: ProductRuntimeState, childSessionKey: string, lineage: NonNullable<ReturnType<typeof parseTtrpgRuntimeStateV2>>['branchLineage']): ProductRuntimeState {
  const child = structuredClone(state)
  const runtime = parseTtrpgRuntimeStateV2(child.ttrpg)!
  runtime.sessionKey = childSessionKey; runtime.branchLineage = structuredClone(lineage)
  // Historical grants stay frozen in ancestor evidence. Child consent and all paid windows require explicit renewal.
  runtime.authorization = null
  runtime.product.sessionZero.completed = false; runtime.product.sessionZero.completedAtSequence = null
  runtime.product.sessionZero.completedBy = null; runtime.product.sessionZero.selectedCharacterKeys = []
  if (runtime.openRun) {
    runtime.openRun.coordination = { activeEpochKey: null, epochs: [], calls: [] }
    runtime.openRun.operations = []; runtime.openRun.ruleReceipts = []
    if (runtime.openRun.entityOperations) runtime.openRun.entityOperations = runtime.openRun.entityOperations.filter(row => row.resolution?.kind === "materialized")
    // Keep the game turn; establish the new local event-order boundary. Parent time proof remains in the capsule.
    runtime.openRun.worldTime.lastAdvancedByEventSequence = -1
  }
  child.ttrpg = runtime; child.lastSequence = 0
  parseTtrpgRuntimeStateV2(child.ttrpg)
  return child
}
