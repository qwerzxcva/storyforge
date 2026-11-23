import { verifyAvgBranchOriginV1 } from '../avg/branch-origin'

/** Only native AVG snapshots need portable detached-branch admission. */
export async function verifyProductOwnedBranchOriginV1(input: {
  kind: string
  initialState: unknown
  canonSnapshotJson: string
  runtimeSourceHash: string
}): Promise<boolean> {
  if (input.kind !== 'avg') return false
  return verifyAvgBranchOriginV1(input)
}
