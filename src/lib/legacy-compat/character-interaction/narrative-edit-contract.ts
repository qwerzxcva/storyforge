import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatMessageEditDraftV1 } from '../../types/chat-narrative';

function fail(message: string): never {throw new Error(`[chat-edit] ${message}`)}

export function validateChatMessageEditDraftV1(value: unknown, state: {playerKey: string; profiles: Array<{participantKey: string}>}, maxCharacters: number): asserts value is ChatMessageEditDraftV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== ('sourceOption' in value ? 'actorKey,audienceKeys,mode,requestedSequence,role,sourceMessageId,sourceOption,text' : 'mode' in value ? 'actorKey,audienceKeys,mode,requestedSequence,role,sourceMessageId,text' : 'actorKey,audienceKeys,requestedSequence,role,sourceMessageId,text')) fail('改写草稿字段无效')
  const draft = value as ChatMessageEditDraftV1
  if ('mode' in draft && (!['continue', 'option'].includes(draft.mode!) || draft.role !== 'character')) fail('保留来源的改写必须是角色回复')
  if (draft.mode === 'continue' && (typeof draft.text !== 'string' || draft.text.length >= maxCharacters)) fail('续写必须保留角色原文并留有长度预算')
  if (draft.mode === 'option' ? !draft.sourceOption || Object.keys(draft.sourceOption).sort().join(',') !== 'candidateHash,optionKey'
    || !/^[a-f0-9]{64}$/.test(draft.sourceOption.candidateHash) || !['option-1', 'option-2'].includes(draft.sourceOption.optionKey) : 'sourceOption' in draft) fail('历史候选改选缺少合法来源')
  if (!['player', 'character'].includes(draft.role) || typeof draft.sourceMessageId !== 'string' || !draft.sourceMessageId.trim() || draft.sourceMessageId.length > 200
    || !Number.isSafeInteger(draft.requestedSequence)) fail('改写草稿来源无效')
  if (draft.role === 'player' ? draft.actorKey !== state.playerKey : !state.profiles.some(p => p.participantKey === draft.actorKey)) fail('改写角色不属于当前会话')
  if (draft.audienceKeys !== null && (!Array.isArray(draft.audienceKeys) || new Set(draft.audienceKeys).size !== draft.audienceKeys.length || draft.audienceKeys.some(k => k !== state.playerKey && !state.profiles.some(p => p.participantKey === k)))) fail('改写听众不属于当前会话')
  if (typeof draft.text !== 'string' || !draft.text.trim() || draft.text !== draft.text.trim() || draft.text.length > (draft.role === 'player' ? 12000 : maxCharacters)) fail('改写内容为空或超出允许长度')
}

export function updateChatMessageEditDraftV1(stateValue: CharacterInteractionRuntimeState, input: {sequence: number; text: unknown; cancel?: boolean}): CharacterInteractionRuntimeState {
  const state = structuredClone(stateValue), story = state.chatNarrative
  if (!state.activeScene || !story?.pendingEdit) fail('当前没有待处理改写')
  if (input.cancel) delete story.pendingEdit
  else {
    if (story.pendingEdit.mode === 'continue' && input.text !== story.pendingEdit.text) fail('续写起点不能改写；如需修改原文，请使用历史改写')
    if (story.pendingEdit.mode === 'option' && input.text !== story.pendingEdit.text) fail('所选历史候选不能改写；如需另改文字，请使用历史改写')
    const draft = {...story.pendingEdit, text: input.text, requestedSequence: input.sequence}
    validateChatMessageEditDraftV1(draft, state, story.permissions.maxActionCharacters)
    story.pendingEdit = draft
  }
  story.revision++; story.lastEventSequence = input.sequence
  return state
}
