/**
 * P10 audio planning and replay primitives.
 *
 * This module deliberately has no transport, database, timer, resource
 * reservation, settlement, or reducer dependency. Audio is a presentation
 * side effect: callers may dispatch the returned requests after a turn has
 * been committed, and a failed request can only produce fallback text.
 */

export const TTRPG_AUDIO_CHANNELS_V1 = [
  'music',
  'ambience',
  'sfx',
  'voice',
] as const

export type TtrpgAudioChannelV1 = typeof TTRPG_AUDIO_CHANNELS_V1[number]

export const TTRPG_AUDIO_AUDIENCES_V1 = [
  'gm-only',
  'party',
  'private',
  'public',
] as const

export type TtrpgAudioAudienceV1 = typeof TTRPG_AUDIO_AUDIENCES_V1[number]

export const TTRPG_AUDIO_CUE_ACTIONS_V1 = ['play', 'stop'] as const
export type TtrpgAudioCueActionV1 = typeof TTRPG_AUDIO_CUE_ACTIONS_V1[number]

export const TTRPG_AUDIO_MAX_REQUEST_CHARACTERS_V1 = 2_000
export const TTRPG_AUDIO_MAX_REQUESTS_PER_WORLD_TURN_V1 = 3
export const TTRPG_AUDIO_MAX_VOICE_CHARACTERS_PER_WORLD_TURN_V1 =
  TTRPG_AUDIO_MAX_REQUEST_CHARACTERS_V1 *
  TTRPG_AUDIO_MAX_REQUESTS_PER_WORLD_TURN_V1

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

export interface TtrpgVoiceTimelineMarkV1 {
  textOffset: number
  textLength: number
  startMs: number
  durationMs: number
}

export interface TtrpgVoiceTimelineV1 {
  granularity: 'char' | 'word'
  marks: TtrpgVoiceTimelineMarkV1[]
  speakerVoiceId: string
  styleKey: string | null
  styleDegree: number | null
}

export interface TtrpgAudioCueAppliedEventV1 {
  type: 'ttrpg.audio.cue.applied'
  eventSequence: number
  commandId: string
  worldTurn: number
  slotKey: string
  channel: TtrpgAudioChannelV1
  action: TtrpgAudioCueActionV1
  fade: number
  audience: TtrpgAudioAudienceV1
  targetRef: string
  assetKey: string | null
  fallbackText: string
  voiceTimeline: TtrpgVoiceTimelineV1 | null
}

function fail(message: string): never {
  throw new Error(`[ttrpg-open-audio] ${message}`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`${label}必须是对象`)
  }
  return value as Record<string, unknown>
}

function key(value: unknown, label: string): string {
  if (typeof value !== 'string') return fail(`${label}必须是字符串`)
  const result = value.trim()
  if (!result || !KEY.test(result)) return fail(`${label}不是稳定 key`)
  return result
}

function nonEmptyText(value: unknown, label: string, maximum = 20_000): string {
  if (typeof value !== 'string') return fail(`${label}必须是字符串`)
  const result = value.normalize('NFC')
  if (!result.trim() || result.length > maximum) {
    return fail(`${label}为空或过长`)
  }
  return result
}

function nonNegativeInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    return fail(`${label}必须是非负整数`)
  }
  return Number(value)
}

function positiveInteger(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const result = nonNegativeInteger(value, label, maximum)
  if (result < 1) return fail(`${label}必须大于 0`)
  return result
}

function numberInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    return fail(`${label}超出范围`)
  }
  return value
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value === 'string' && values.includes(value as T)) return value as T
  return fail(`${label}不在闭集内`)
}

function cloneTimeline(timeline: TtrpgVoiceTimelineV1 | null): TtrpgVoiceTimelineV1 | null {
  if (!timeline) return null
  return {
    ...timeline,
    marks: timeline.marks.map(mark => ({ ...mark })),
  }
}

function assertTimelineShape(
  value: unknown,
  label: string,
  textLength?: number,
): TtrpgVoiceTimelineV1 {
  const row = record(value, label)
  const granularity = oneOf(row.granularity, ['char', 'word'] as const, `${label}.granularity`)
  if (!Array.isArray(row.marks) || row.marks.length > 20_000) {
    return fail(`${label}.marks必须是有界数组`)
  }
  const speakerVoiceId = key(row.speakerVoiceId, `${label}.speakerVoiceId`)
  const styleKey = row.styleKey == null ? null : key(row.styleKey, `${label}.styleKey`)
  const styleDegree = row.styleDegree == null
    ? null
    : numberInRange(row.styleDegree, `${label}.styleDegree`, 0, 1)
  const marks = row.marks.map((raw, index) => {
    const mark = record(raw, `${label}.marks[${index}]`)
    return {
      textOffset: nonNegativeInteger(mark.textOffset, `${label}.marks[${index}].textOffset`),
      textLength: positiveInteger(mark.textLength, `${label}.marks[${index}].textLength`),
      startMs: nonNegativeInteger(mark.startMs, `${label}.marks[${index}].startMs`),
      durationMs: positiveInteger(mark.durationMs, `${label}.marks[${index}].durationMs`),
    }
  })
  let textEnd = 0
  let audioEnd = 0
  for (const mark of marks) {
    if (mark.textOffset !== textEnd) return fail(`${label}.marks必须连续覆盖全文`)
    if (mark.startMs < audioEnd) return fail(`${label}.marks音频时间重叠`)
    textEnd = mark.textOffset + mark.textLength
    audioEnd = mark.startMs + mark.durationMs
  }
  if (textLength !== undefined && (marks.length === 0 || textEnd !== textLength)) {
    return fail(`${label}.marks未覆盖全文`)
  }
  return { granularity, marks, speakerVoiceId, styleKey, styleDegree }
}

export function validateTtrpgVoiceTimelineV1(
  value: unknown,
  text: string,
): TtrpgVoiceTimelineV1 {
  const normalizedText = nonEmptyText(text, 'voiceTimeline.text')
  return assertTimelineShape(value, 'voiceTimeline', normalizedText.length)
}

export function parseTtrpgAudioCueAppliedEventV1(event: unknown): TtrpgAudioCueAppliedEventV1 {
  const row = record(event, 'audio.event')
  if (row.type !== 'ttrpg.audio.cue.applied') return fail('audio.event.type无效')
  const eventSequence = positiveInteger(row.eventSequence, 'audio.event.eventSequence')
  const commandId = key(row.commandId, 'audio.event.commandId')
  const worldTurn = nonNegativeInteger(row.worldTurn, 'audio.event.worldTurn')
  const slotKey = key(row.slotKey, 'audio.event.slotKey')
  const channel = oneOf(row.channel, TTRPG_AUDIO_CHANNELS_V1, 'audio.event.channel')
  const action = oneOf(row.action, TTRPG_AUDIO_CUE_ACTIONS_V1, 'audio.event.action')
  const fade = nonNegativeInteger(row.fade, 'audio.event.fade', 60_000)
  const audience = oneOf(row.audience, TTRPG_AUDIO_AUDIENCES_V1, 'audio.event.audience')
  const targetRef = key(row.targetRef, 'audio.event.targetRef')
  const assetKey = row.assetKey == null ? null : key(row.assetKey, 'audio.event.assetKey')
  const fallbackText = nonEmptyText(row.fallbackText, 'audio.event.fallbackText')
  const voiceTimeline = row.voiceTimeline == null
    ? null
    : assertTimelineShape(row.voiceTimeline, 'audio.event.voiceTimeline')
  return {
    type: 'ttrpg.audio.cue.applied',
    eventSequence,
    commandId,
    worldTurn,
    slotKey,
    channel,
    action,
    fade,
    audience,
    targetRef,
    assetKey,
    fallbackText,
    voiceTimeline: channel === 'voice' ? cloneTimeline(voiceTimeline) : null,
  }
}
