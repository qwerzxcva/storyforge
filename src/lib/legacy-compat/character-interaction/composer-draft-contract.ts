import { z } from 'zod';
import type { ChatComposerDraftV1 } from '../../types/character-interaction';

export const CHAT_COMPOSER_MAX_CHARACTERS = 12_000
const schema = z.object({version: z.literal(1), text: z.string().max(CHAT_COMPOSER_MAX_CHARACTERS),
  audienceKeys: z.array(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/).max(160)).min(1).max(32)
    .refine(keys => new Set(keys).size === keys.length).nullable().optional(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict()
export function parseChatComposerDraftV1(value: unknown, participantKeys?: readonly string[]): ChatComposerDraftV1 {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new Error('未发送消息草稿的格式或长度无效。')
  if (participantKeys && parsed.data.audienceKeys?.some(key => !participantKeys.includes(key))) throw new Error('聊天草稿的收件人不属于此作品。')
  return parsed.data
}
