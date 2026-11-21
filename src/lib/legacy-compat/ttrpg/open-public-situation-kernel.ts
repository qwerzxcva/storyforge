
import { canonicalStringify, hashCanonicalValue } from '../../agent/run/hash';
import type { TtrpgOpenSituationProposalBasisV1 } from './open-generated-situation-contract';
import type { TtrpgOpenPublicSituationAuthorizationV1 } from './open-public-situation-authorization-contract';
import * as p from './open-contract-parse'

export interface TtrpgOpenPublicSituationKernelV1 {
  schema: 'storyforge.ttrpg-open-public-situation-kernel'; version: 1;
  requestKey: string; authorizationBasisHash: string; visibilityHash: string;
  basis: TtrpgOpenSituationProposalBasisV1;
  resources: Array<{ suffix: string; title: string; mandatory: boolean; value: unknown }>;
}
export async function verifyTtrpgOpenPublicSituationKernelV1(input: {
  snapshot: TtrpgOpenPublicSituationKernelV1; expectedHash: string;
  grant: TtrpgOpenPublicSituationAuthorizationV1; sessionKey: string; epochKey: string; authorizationHash: string;
}) {
  const s = p.record(input.snapshot, ['schema', 'version', 'requestKey', 'authorizationBasisHash', 'visibilityHash', 'basis', 'resources'], 'public situation kernel')
  const snapshot = input.snapshot, grant = input.grant, basis = snapshot.basis
  if (s.schema !== 'storyforge.ttrpg-open-public-situation-kernel' || s.version !== 1
    || await hashCanonicalValue(snapshot) !== input.expectedHash || snapshot.requestKey !== grant.basis.requestKey
    || snapshot.authorizationBasisHash !== grant.basisHash || snapshot.visibilityHash !== grant.basis.sourceVisibilityHash
    || basis.runtimeSourceHash !== grant.basis.runtimeSourceHash || basis.sessionKey !== input.sessionKey
    || basis.authorizationHash !== input.authorizationHash || basis.mechanicalStateHash !== grant.admissionStateHash
    || canonicalStringify([...basis.selectedActorKeys].sort()) !== canonicalStringify(grant.basis.recipientActorKeys)
    || basis.assignedTemplateKey !== `generated.${(await hashCanonicalValue({ sessionKey: input.sessionKey, proposalKey: input.epochKey })).slice(0, 40)}`) {
    p.fail('共同局势原内核快照与本次请求不一致')
  }
  return snapshot
}
