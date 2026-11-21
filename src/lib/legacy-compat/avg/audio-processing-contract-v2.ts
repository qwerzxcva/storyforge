
import { avgEnum, avgNumber, avgProtocolBody, avgRecord, avgText } from './protocol-validation';
export interface AvgAudioProcessingRecipeV2 {
  schema: 'storyforge.avg.audio-processing-recipe'; version: 2
  gainMilliDb: number; maximumDurationMs: number
  sampleRatePolicy: 'preserve' | 'explicit'; targetSampleRateHz: number | null
  channelPolicy: 'preserve'; timelinePolicy: 'preserve'; overflowPolicy: 'reject'
  resampler: 'blackman-sinc64.v1'; processingOrder: 'resample-gain-linked-limit.v1'
  dynamics: null | { processor: 'linked-lookahead-peak-limit.v1'; ceilingMilliDbfs: number; lookaheadMs: number; releaseMs: number }
  declaration: string
}

export function parseAvgAudioProcessingRecipeV2(value: unknown): AvgAudioProcessingRecipeV2 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'gainMilliDb', 'maximumDurationMs', 'sampleRatePolicy',
    'targetSampleRateHz', 'channelPolicy', 'timelinePolicy', 'overflowPolicy', 'resampler', 'processingOrder', 'dynamics', 'declaration'], 'audio recipe V2')
  if (r.schema !== 'storyforge.avg.audio-processing-recipe' || r.version !== 2) throw new Error('[avg-audio-process] 加工配方V2版本无效')
  const sampleRatePolicy = avgEnum(r.sampleRatePolicy, ['preserve', 'explicit'] as const, 'audio rate policy')
  if (sampleRatePolicy === 'preserve' && r.targetSampleRateHz !== null) throw new Error('[avg-audio-process] 保持采样率不能夹带目标采样率')
  const targetSampleRateHz = sampleRatePolicy === 'preserve' ? null : avgNumber(r.targetSampleRateHz, 'audio target rate', 8000, 48000)
  let dynamics: AvgAudioProcessingRecipeV2['dynamics'] = null
  if (r.dynamics !== null) {
    const d = avgRecord(r.dynamics, ['processor', 'ceilingMilliDbfs', 'lookaheadMs', 'releaseMs'], 'linked peak limiter')
    dynamics = { processor: avgEnum(d.processor, ['linked-lookahead-peak-limit.v1'] as const, 'limiter processor'),
      ceilingMilliDbfs: avgNumber(d.ceilingMilliDbfs, 'sample peak ceiling', -24000, -1000),
      lookaheadMs: avgNumber(d.lookaheadMs, 'limiter lookahead', 1, 10), releaseMs: avgNumber(d.releaseMs, 'limiter release', 10, 1000) }
  }
  return { schema: r.schema, version: 2, gainMilliDb: avgNumber(r.gainMilliDb, 'audio gain', -60000, 24000),
    maximumDurationMs: avgNumber(r.maximumDurationMs, 'audio maximum duration', 1000, 120000), sampleRatePolicy, targetSampleRateHz,
    channelPolicy: avgEnum(r.channelPolicy, ['preserve'] as const, 'audio channels'),
    timelinePolicy: avgEnum(r.timelinePolicy, ['preserve'] as const, 'audio timeline'),
    overflowPolicy: avgEnum(r.overflowPolicy, ['reject'] as const, 'audio overflow'),
    resampler: avgEnum(r.resampler, ['blackman-sinc64.v1'] as const, 'audio resampler'),
    processingOrder: avgEnum(r.processingOrder, ['resample-gain-linked-limit.v1'] as const, 'audio processing order'),
    dynamics, declaration: avgText(r.declaration, 'audio processing declaration', 2000) }
}
