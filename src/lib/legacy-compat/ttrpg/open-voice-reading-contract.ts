
import * as p from './open-contract-parse'

export const TTRPG_OPEN_VOICE_READING_LIMITS_V1 = { maxSourceUtf16: 2000, maxReadingUtf16: 4000, maxOverrides: 64 } as const
export interface TtrpgOpenVoicePronunciationV1 { textOffset: number; textLength: number; spokenText: string }

export function ttrpgOpenVoiceReadingTextV1(text: string, raw: unknown): { overrides: TtrpgOpenVoicePronunciationV1[]; readingText: string } {
  if (typeof text !== 'string' || !text.trim() || text.length > TTRPG_OPEN_VOICE_READING_LIMITS_V1.maxSourceUtf16 || /[\uD800-\uDFFF]/u.test(text)) p.fail('朗读来源须是有限且完整的原文字符')
  const boundary = (offset: number) => !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]))
  let cursor = 0, readingText = ''
  const overrides = p.list(raw, 'explicit pronunciation choices', value => {
    const row = p.record(value, ['textOffset', 'textLength', 'spokenText'], 'pronunciation choice')
    const textOffset = p.integer(row.textOffset, 'pronunciation offset', cursor, text.length)
    const textLength = p.integer(row.textLength, 'pronunciation range', 1, text.length)
    if (textOffset + textLength > text.length || !boundary(textOffset) || !boundary(textOffset + textLength)
      || typeof row.spokenText !== 'string' || !row.spokenText.trim() || row.spokenText.length > TTRPG_OPEN_VOICE_READING_LIMITS_V1.maxReadingUtf16
      || /[\uD800-\uDFFF]/u.test(row.spokenText)) p.fail('读法须指向有序、不重叠且完整的原文范围')
    readingText += text.slice(cursor, textOffset) + row.spokenText; cursor = textOffset + textLength
    return { textOffset, textLength, spokenText: row.spokenText }
  }, TTRPG_OPEN_VOICE_READING_LIMITS_V1.maxOverrides, 0)
  readingText += text.slice(cursor)
  if (readingText.length > TTRPG_OPEN_VOICE_READING_LIMITS_V1.maxReadingUtf16) p.fail('展开读法超出独立文字预算')
  return { overrides, readingText }
}
