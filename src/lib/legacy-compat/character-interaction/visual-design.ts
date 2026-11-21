
export interface ChatVisualDesignV1 {
  schema: 'storyforge.chat-visual-design'; version: 1
  contextHash: string
  style: string
  characters: Array<{characterKey: string; participantKey: string; name: string; appearance: string; costume: string; evidenceKeys: string[]}>
  scene: {sceneKey: string; location: string; timeLabel: string; depiction: string; evidenceKeys: string[]}
  runtime: {enabled: boolean; maximumImages: number}
}
function fail(message: string): never {throw new Error(`[chat-visual-design] ${message}`)}
function exact(value: unknown, keys: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.split(',').sort().join(',')) fail('设计字段无效')
  return value as Record<string, unknown>
}
function text(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('设计文本为空或过长')
  return value
}
function evidence(value: unknown, keys?: Set<string>): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some(key => typeof key !== 'string' || (keys && !keys.has(key))) || new Set(value).size !== value.length) fail('设计引用了未交付的资料')
  return value as string[]
}
export function parseChatVisualDesignV1(value: unknown): ChatVisualDesignV1 {
  const row = exact(value, 'schema,version,contextHash,style,characters,scene,runtime')
  if (row.schema !== 'storyforge.chat-visual-design' || row.version !== 1 || typeof row.contextHash !== 'string' || !/^[a-f0-9]{64}$/.test(row.contextHash)) fail('设计版本或来源无效')
  text(row.style, 2000)
  if (!Array.isArray(row.characters) || !row.characters.length || row.characters.length > 8) fail('设计角色数量无效')
  for (const value of row.characters) {
    const item = exact(value, 'characterKey,participantKey,name,appearance,costume,evidenceKeys')
    for (const key of ['characterKey', 'participantKey', 'name', 'appearance', 'costume']) text(item[key])
    evidence(item.evidenceKeys)
  }
  if (new Set(row.characters.map(item => item.characterKey)).size !== row.characters.length || new Set(row.characters.map(item => item.participantKey)).size !== row.characters.length) fail('设计角色重复')
  const scene = exact(row.scene, 'sceneKey,location,timeLabel,depiction,evidenceKeys')
  for (const key of ['sceneKey', 'location', 'depiction']) text(scene[key])
  if (typeof scene.timeLabel !== 'string' || scene.timeLabel.length > 4000) fail('场景时间无效')
  evidence(scene.evidenceKeys)
  const runtime = exact(row.runtime, 'enabled,maximumImages')
  if (typeof runtime.enabled !== 'boolean' || runtime.maximumImages !== 60) fail('运行图片额度无效')
  return structuredClone(value) as ChatVisualDesignV1
}
