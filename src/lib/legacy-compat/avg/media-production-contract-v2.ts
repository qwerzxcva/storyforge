import { type AvgVisualProductionRequirementV1 } from './media-production-contract';
import { type AvgMediaReferenceV2 } from './media-reference-contract-v2';

export interface AvgVisualProductionRequirementV2 extends Omit<AvgVisualProductionRequirementV1,'references'> {
  references:AvgMediaReferenceV2[]
}
