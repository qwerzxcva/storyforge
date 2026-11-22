
import type { ProductProductionMediaProfileV1 } from '../../types/index';
import type { ChatAuthoringSettings } from './authoring-contract';

/** Author-written picture descriptions. These are presentation inputs, not
 * character knowledge, world facts or permission to generate/publish media. */
export interface ChatVisualIntentV1 {
  version: 1
  characters: Array<{characterKey: string; description: string}>
  openingBackground: string
}
/** New productions derive their art from confirmed content. V1 remains exact
 * for historical plans; switching modes creates a new authorized Brief. */
export interface ChatVisualIntentV2 extends Omit<ChatVisualIntentV1, 'version'> {
  version: 2
  style: string
  runtimeImages: boolean
}
export type ChatVisualIntent = ChatVisualIntentV1 | ChatVisualIntentV2

function fail(message: string): never {throw new Error(`[chat-visual-intent] ${message}`)}
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('画面描述字段无效')
  return value as Record<string, unknown>
}
export function parseChatVisualIntentV1(value: unknown): ChatVisualIntent {
  if (value && typeof value === 'object' && 'version' in value && value.version === 2) {
    const row = exact(value, ['version', 'characters', 'openingBackground', 'style', 'runtimeImages'])
    if (typeof row.style !== 'string' || row.style.length > 2000 || !row.style.trim() || typeof row.runtimeImages !== 'boolean') fail('画风或随剧情配图设置无效')
    const base = parseChatVisualIntentV1({version: 1, characters: row.characters, openingBackground: row.openingBackground})
    return {...base, version: 2, style: row.style, runtimeImages: row.runtimeImages}
  }
  const row = exact(value, ['version', 'characters', 'openingBackground'])
  if (row.version !== 1 || !Array.isArray(row.characters) || row.characters.length > 8
    || typeof row.openingBackground !== 'string' || row.openingBackground.length > 4000) fail('画面描述版本或数量无效')
  const characters = row.characters.map(value => {
    const item = exact(value, ['characterKey', 'description'])
    if (typeof item.characterKey !== 'string' || !item.characterKey.trim() || item.characterKey !== item.characterKey.trim()
      || item.characterKey.length > 500 || typeof item.description !== 'string' || !item.description.trim()
      || item.description.length > 4000) fail('人物画面描述无效')
    return {characterKey: item.characterKey, description: item.description}
  })
  if (new Set(characters.map(item => item.characterKey)).size !== characters.length) fail('人物画面描述重复')
  return {version: 1, characters, openingBackground: row.openingBackground}
}

/** Only an explicit illustrated Brief enables production. A saved picture
 * draft alone does not authorize calls or turn historical text plans on. */
export function chatVisualMediaProfileV1(settings: ChatAuthoringSettings | undefined, visualLevel: ProductProductionMediaProfileV1['visualLevel']) {
  if (visualLevel === 'none') return {imageCount: 0, requiredMediaKinds: [] as ProductProductionMediaProfileV1['requiredMediaKinds']}
  if (visualLevel !== 'key-scenes' || settings?.version !== 3 || !settings.visuals) fail('图片制作需要主动叙事方案和明确的公开画面描述')
  const intent = parseChatVisualIntentV1(settings.visuals)
  const selected = new Set([...settings.characters.map(character => character.sourceKey), ...(settings.privateCharacters ?? []).map(character => character.characterKey)])
  if (intent.characters.some(character => !selected.has(character.characterKey))) fail('画面人物不属于当前选择，请重新选择或移除旧描述')
  if (intent.version === 2) {
    if (!selected.size) fail('请先确认参与角色')
    return {imageCount: selected.size + 1, requiredMediaKinds: ['character-pose', 'background'] as ProductProductionMediaProfileV1['requiredMediaKinds']}
  }
  const requiredMediaKinds: ProductProductionMediaProfileV1['requiredMediaKinds'] = []
  if (intent.characters.length) requiredMediaKinds.push('character-pose')
  if (intent.openingBackground.trim()) requiredMediaKinds.push('background')
  const imageCount = intent.characters.length + Number(!!intent.openingBackground.trim())
  if (!imageCount) fail('请先填写至少一项公开画面描述')
  return {imageCount, requiredMediaKinds}
}
