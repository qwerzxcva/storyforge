import type { TtrpgSituationTemplateV1 } from './open-contract';

export const TTRPG_SITUATION_GENERATION_HOMOGENEITY_THRESHOLD_V1 = 0.8
export const TTRPG_SITUATION_GENERATION_HISTORY_LIMIT_V1 = 8
export const TTRPG_SITUATION_GENERATION_COOLDOWN_WORLD_TURNS_V1 = 3

export interface TtrpgSituationGenerationHistoryItemV1 {
  template: TtrpgSituationTemplateV1
  status?: 'accepted' | 'rejected' | 'pending'
  accepted?: boolean
  rejected?: boolean
  resolvedAtWorldTurn?: number
}
