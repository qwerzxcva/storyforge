
import { avgBoolean, avgEnum, avgHash, avgKey, avgList, avgNumber, avgProtocolBody, avgRecord, avgText, avgUnique } from './protocol-validation';
export const AVG_VOICE_TASK_TIMEOUT_MS_V1 = 180_000

/** A declared wire contract, not proof of account access, voice rights,
 * pronunciation, performance or author authorization. The configured gateway
 * must rebuild this identity before any durable, explicitly authorized call. */
export interface AvgSpeechProtocolV1 {
  schema: 'storyforge.avg.speech-protocol'
  version: 1
  adapterId: 'storyforge.avg.compatible-speech.v1'
  provider: string
  model: string
  endpointRouteHash: string
  voices: Array<{ voiceId: string; locales: Array<'zh-CN'> }>
  outputFormat: 'wav'
  maximumInputCharacters: number
  supportsInstructions: boolean
  maximumInstructionsCharacters: number
  speedRange: { minimum: number; maximum: number } | null
}

function exactIdentifier(value: unknown, label: string): string {
  const text = avgText(value, label, 200)
  if (text !== text.trim() || Array.from(text).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error(`[avg-voice] ${label} 标识含空白边界或控制字符`)
  }
  return text
}

export function parseAvgSpeechProtocolV1(value: unknown): AvgSpeechProtocolV1 {
  const row = avgRecord(avgProtocolBody(value), [
    'schema', 'version', 'adapterId', 'provider', 'model', 'endpointRouteHash', 'voices',
    'outputFormat', 'maximumInputCharacters', 'supportsInstructions', 'maximumInstructionsCharacters', 'speedRange',
  ], 'speech protocol')
  if (row.schema !== 'storyforge.avg.speech-protocol' || row.version !== 1) throw new Error('[avg-voice] 语音请求协议版本无效')
  const voices = avgUnique(avgList(row.voices, 'speech voices', value => {
    const voice = avgRecord(value, ['voiceId', 'locales'], 'speech voice')
    const locales = avgUnique(avgList(voice.locales, 'speech voice locales', item => avgEnum(item, ['zh-CN'] as const, 'voice locale'), 1), item => item, 'voice locales')
    if (!locales.length) throw new Error('[avg-voice] 音色没有声明当前运行时支持的语言')
    return { voiceId: exactIdentifier(voice.voiceId, 'speech voice ID'), locales }
  }, 64), voice => voice.voiceId, 'speech voice IDs')
  if (!voices.length) throw new Error('[avg-voice] 语音协议缺少明确音色目录')
  const supportsInstructions = avgBoolean(row.supportsInstructions, 'speech supportsInstructions')
  const maximumInstructionsCharacters = avgNumber(row.maximumInstructionsCharacters, 'speech instructions limit', 0, 4096)
  if (supportsInstructions !== (maximumInstructionsCharacters > 0)) throw new Error('[avg-voice] 演法字段与明确指令上限不一致')
  const speed = row.speedRange === null ? null : avgRecord(row.speedRange, ['minimum', 'maximum'], 'speech speed range')
  const speedRange = speed === null ? null : {
    minimum: avgNumber(speed.minimum, 'speech minimum speed', 0.25, 4, false),
    maximum: avgNumber(speed.maximum, 'speech maximum speed', 0.25, 4, false),
  }
  if (speedRange && speedRange.minimum > speedRange.maximum) throw new Error('[avg-voice] 声明语速范围无效')
  return {
    schema: row.schema, version: 1,
    adapterId: avgEnum(row.adapterId, ['storyforge.avg.compatible-speech.v1'] as const, 'speech adapter'),
    provider: avgKey(row.provider, 'speech provider'), model: exactIdentifier(row.model, 'speech model'),
    endpointRouteHash: avgHash(row.endpointRouteHash, 'speech endpointRouteHash'), voices,
    outputFormat: avgEnum(row.outputFormat, ['wav'] as const, 'speech outputFormat'),
    // Conservative compatibility-profile limits, not an assertion that a
    // particular configured provider or account supports the whole envelope.
    maximumInputCharacters: avgNumber(row.maximumInputCharacters, 'speech input limit', 1, 4096),
    supportsInstructions, maximumInstructionsCharacters,
    speedRange,
  }
}
