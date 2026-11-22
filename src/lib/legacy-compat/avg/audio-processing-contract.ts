
import { avgEnum, avgNumber, avgProtocolBody, avgRecord, avgText } from './protocol-validation';
import { AVG_AUDIO_GAIN_MIN_MILLI_DB_V1, AVG_AUDIO_GAIN_MAX_MILLI_DB_V1 } from './audio-gain-kernel';
export const AVG_AUDIO_PCM_KINDS_V1 = ['voice', 'bgm', 'sfx', 'ambience'] as const
export type AvgAudioPcmKindV1 = typeof AVG_AUDIO_PCM_KINDS_V1[number]

/** A local processing proposal, never consent, producer proof or adoption.
 * The first processor preserves the exact PCM frame/rate/channel timeline.
 * Dynamics, resampling, trimming and loop editing need distinct recipes. */
export interface AvgAudioProcessingRecipeV1 {
  schema: 'storyforge.avg.audio-processing-recipe'
  version: 1
  gainMilliDb: number
  maximumDurationMs: number
  sampleRatePolicy: 'preserve'
  channelPolicy: 'preserve'
  timelinePolicy: 'preserve'
  overflowPolicy: 'reject'
  declaration: string
}

export function parseAvgAudioProcessingRecipeV1(value: unknown): AvgAudioProcessingRecipeV1 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'gainMilliDb', 'maximumDurationMs',
    'sampleRatePolicy', 'channelPolicy', 'timelinePolicy', 'overflowPolicy', 'declaration'], 'audio processing recipe')
  if (r.schema !== 'storyforge.avg.audio-processing-recipe' || r.version !== 1) throw new Error('[avg-audio-process] 加工配方版本无效')
  return { schema: r.schema, version: 1,
    gainMilliDb: avgNumber(r.gainMilliDb, 'audio gain milli-dB', AVG_AUDIO_GAIN_MIN_MILLI_DB_V1, AVG_AUDIO_GAIN_MAX_MILLI_DB_V1),
    maximumDurationMs: avgNumber(r.maximumDurationMs, 'audio maximum duration', 1000, 120_000),
    sampleRatePolicy: avgEnum(r.sampleRatePolicy, ['preserve'] as const, 'audio sample rate policy'),
    channelPolicy: avgEnum(r.channelPolicy, ['preserve'] as const, 'audio channel policy'),
    timelinePolicy: avgEnum(r.timelinePolicy, ['preserve'] as const, 'audio timeline policy'),
    overflowPolicy: avgEnum(r.overflowPolicy, ['reject'] as const, 'audio overflow policy'),
    declaration: avgText(r.declaration, 'audio processing declaration', 2000) }
}
