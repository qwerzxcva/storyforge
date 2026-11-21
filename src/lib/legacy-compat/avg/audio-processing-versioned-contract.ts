import { avgProtocolBody } from './protocol-validation';
import { parseAvgAudioProcessingRecipeV1, type AvgAudioProcessingRecipeV1 } from './audio-processing-contract';
import { parseAvgAudioProcessingRecipeV2, type AvgAudioProcessingRecipeV2 } from './audio-processing-contract-v2';

export type AvgAudioProcessingRecipe = AvgAudioProcessingRecipeV1 | AvgAudioProcessingRecipeV2
export function parseAvgAudioProcessingRecipe(value: unknown): AvgAudioProcessingRecipe {
  const body = avgProtocolBody(value)
  return (body as { version?: unknown } | null)?.version === 2 ? parseAvgAudioProcessingRecipeV2(body) : parseAvgAudioProcessingRecipeV1(body)
}
