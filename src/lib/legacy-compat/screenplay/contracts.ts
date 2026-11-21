import type { ScreenplayBlock } from '../../types/index';

const BLOCK_TYPES = new Set<ScreenplayBlock['type']>(['action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'note'])
const CHARACTER_EXTENSIONS = new Set(['V.O.', 'O.S.', 'O.C.', "CONT'D"])

export interface ScreenplayValidationIssueV1 {
  level: 'error' | 'warning'
  code: string
  message: string
  blockId?: string
}

export interface ScreenplayValidationReportV1 {
  valid: boolean
  issues: ScreenplayValidationIssueV1[]
}

function issue(issues: ScreenplayValidationIssueV1[], level: 'error' | 'warning', code: string, message: string, blockId?: string) {
  issues.push({ level, code, message, ...(blockId ? { blockId } : {}) })
}

export function validateScreenplayBlocksV1(blocks: ScreenplayBlock[]): ScreenplayValidationReportV1 {
  const issues: ScreenplayValidationIssueV1[] = []
  if (!Array.isArray(blocks) || blocks.length > 1000) return { valid: false, issues: [{ level: 'error', code: 'blocks-shape', message: '场景块必须是至多 1000 项的数组。' }] }
  const ids = new Set<string>()
  let activeCharacter = false
  let priorDialogueSequence = false
  let pendingDual = false
  for (const raw of blocks) {
    const block = raw as ScreenplayBlock
    if (!block || typeof block !== 'object' || !BLOCK_TYPES.has(block.type)) {
      issue(issues, 'error', 'block-type', '存在不支持的剧本块类型。')
      continue
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(block.id)) issue(issues, 'error', 'block-id', '块 stable id 非法。', block.id)
    if (ids.has(block.id)) issue(issues, 'error', 'block-id-duplicate', '场景内块 id 重复。', block.id)
    ids.add(block.id)
    const text = block.type === 'character' ? block.name : block.text
    if (typeof text !== 'string' || !text.trim() || text.length > 20_000) issue(issues, 'error', 'block-text', '块文本必须为 1～20000 字符。', block.id)
    if (block.type === 'character') {
      if (activeCharacter) issue(issues, 'error', 'character-without-dialogue', '角色 cue 后必须先有对白，不能直接开始下一角色。', block.id)
      if (block.characterId != null && (!Number.isInteger(block.characterId) || block.characterId <= 0)) issue(issues, 'error', 'character-id', '角色引用非法。', block.id)
      if (block.extension && !CHARACTER_EXTENSIONS.has(block.extension)) issue(issues, 'error', 'character-extension', '角色扩展标记非法。', block.id)
      if (block.dualDialogue && !priorDialogueSequence) issue(issues, 'error', 'dual-dialogue-pair', '双栏对白的第二个角色 cue 前必须有一组完整对白。', block.id)
      pendingDual = block.dualDialogue === true
      activeCharacter = true
      continue
    }
    if (block.type === 'parenthetical') {
      if (!activeCharacter) issue(issues, 'error', 'parenthetical-order', '括注只能位于角色 cue 与对白之间。', block.id)
      continue
    }
    if (block.type === 'dialogue') {
      if (!activeCharacter) issue(issues, 'error', 'dialogue-order', '对白前必须有合法角色 cue。', block.id)
      priorDialogueSequence = activeCharacter
      activeCharacter = false
      pendingDual = false
      continue
    }
    if (activeCharacter) issue(issues, 'error', 'character-without-dialogue', '角色 cue 后必须先有对白，不能直接开始动作或转场。', block.id)
    if (pendingDual) issue(issues, 'error', 'dual-dialogue-missing', '双栏对白角色 cue 后必须紧跟对白。', block.id)
    activeCharacter = false
    priorDialogueSequence = false
    pendingDual = false
  }
  if (pendingDual || activeCharacter) issue(issues, 'error', 'character-without-dialogue', '场景末尾角色 cue 缺少对白。')
  const totalLength = blocks.reduce((sum, block) => sum + (block.type === 'character' ? block.name.length : block.text.length), 0)
  if (totalLength > 256_000) issue(issues, 'error', 'scene-size', '单场内容超过 256000 字符上限。')
  return { valid: !issues.some(item => item.level === 'error'), issues }
}
