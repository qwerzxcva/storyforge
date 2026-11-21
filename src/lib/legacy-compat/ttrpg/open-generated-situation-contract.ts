/** Closed P9 proposal/preflight contract. A successful preflight never accepts, activates or writes a template. */
import type { RulePackV2, TtrpgCampaignContentV2, TtrpgSituationTemplateV1 } from './open-contract';
import type { TtrpgSessionFactV1 } from './session-facts';
import { type TtrpgSituationGenerationHistoryItemV1 } from './situation-generation';
import { type TtrpgOpenSourceRefV1 } from './open-coordination';
import type { TtrpgOpenRuntimeEntityReferencesV1, TtrpgOpenRuntimeEntityReferenceV1 } from './open-runtime-entity-references';
export interface TtrpgOpenSituationPersonalizationSourceV1 {
  sourceKey: string; kind: 'identity' | 'choice' | 'commitment'; actorKeys: string[]; knownByActorKeys: string[];
  sourceRef: TtrpgOpenSourceRefV1 | null; contentHash: string;
}
export interface TtrpgOpenSituationProposalBasisV1 {
  runtimeSourceHash: string; worldReleaseHash: string; sourceLineageHash: string; sessionKey: string;
  assignedTemplateKey: string; selectedActorKeys: string[]; worldTurn: number; authorizationHash: string; mechanicalStateHash: string;
  campaign: TtrpgCampaignContentV2; rule: RulePackV2; sessionFacts: TtrpgSessionFactV1[];
  retiredSessionFacts?: TtrpgSessionFactV1[];
  runtimeEntityReferences?: TtrpgOpenRuntimeEntityReferencesV1;
  /** Internal validation only; prior adoption never widens this new model request. */
  historicalRuntimeEntityReferences?: TtrpgOpenRuntimeEntityReferenceV1[];
  sessionTemplates: TtrpgSituationTemplateV1[]; history: Array<TtrpgSituationGenerationHistoryItemV1 & { sourceRef: TtrpgOpenSourceRefV1; situationKey: string; sourceKind?: 'adopted-definition' }>;
  cooldownUntilWorldTurn: Record<string, number>; personalizationSources: TtrpgOpenSituationPersonalizationSourceV1[];
}
