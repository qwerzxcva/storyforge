import { parseAvgAudioProcessingRecipeV2, type AvgAudioProcessingRecipeV2 } from './audio-processing-contract-v2';
import { avgNumber } from './protocol-validation';

export const AVG_AUDIO_DSP_MAX_PHASES_V2 = 2048
export const AVG_AUDIO_DSP_MAX_TAPS_V2 = 384
export const AVG_AUDIO_DSP_MAX_RESAMPLE_MACS_V2 = 256000000
export interface AvgAudioDspInputV2 { pcm: ArrayBuffer; channelCount: number; sampleCount: number; sourceSampleRateHz: number; recipe: AvgAudioProcessingRecipeV2 }
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a

/** Finite preflight, before allocating output or running any DSP. Unsupported
 * rational complexity is rejected, never approximated, truncated or retried. */
export function planAvgAudioDspLayoutV2(input: Omit<AvgAudioDspInputV2, 'pcm'>) {
  const recipe = parseAvgAudioProcessingRecipeV2(input.recipe)
  const channelCount = avgNumber(input.channelCount, 'DSP channels', 1, 2)
  const sampleCount = avgNumber(input.sampleCount, 'DSP source frames', 2, 48000 * 120)
  const sourceSampleRateHz = avgNumber(input.sourceSampleRateHz, 'DSP source rate', 8000, 48000)
  const outputSampleRateHz = recipe.targetSampleRateHz ?? sourceSampleRateHz
  const outputSampleCount = Math.round(sampleCount * outputSampleRateHz / sourceSampleRateHz)
  const bypass = sourceSampleRateHz === outputSampleRateHz
  const cutoff = Math.min(1, outputSampleRateHz / sourceSampleRateHz), radius = 32 / cutoff
  const halfTaps = Math.ceil(radius), taps = halfTaps * 2, phases = outputSampleRateHz / gcd(sourceSampleRateHz, outputSampleRateHz)
  if (outputSampleCount < 2 || outputSampleCount > 48000 * 120 || 44 + outputSampleCount * channelCount * 2 > 32 * 1024 * 1024
    || sampleCount * 1000 > recipe.maximumDurationMs * sourceSampleRateHz
    || outputSampleCount * 1000 > recipe.maximumDurationMs * outputSampleRateHz
    || Math.abs(Math.round(sampleCount * 1000 / sourceSampleRateHz) - Math.round(outputSampleCount * 1000 / outputSampleRateHz)) > 1
    || !bypass && (phases > AVG_AUDIO_DSP_MAX_PHASES_V2 || taps > AVG_AUDIO_DSP_MAX_TAPS_V2
      || outputSampleCount * taps * channelCount + phases * taps > AVG_AUDIO_DSP_MAX_RESAMPLE_MACS_V2)) {
    throw new Error('[avg-audio-process] 明确重采样超过有限帧数、相位、运算或时长上限，原件保留')
  }
  return { recipe, channelCount, sampleCount, sourceSampleRateHz, outputSampleRateHz, outputSampleCount, cutoff, radius, halfTaps, taps, phases, bypass }
}
