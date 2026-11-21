import type { CharacterInteractionRuntimeState } from '../../types/index';
import { interactionMessageVisibleTo } from './message-visibility';
import { chatTurnActionLimitV1 } from './narrative-contract';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';
import { assertChatTurnActorV1 } from './narrative-scheduling';

/** A reviewed disposition of progress already adopted in this same turn.
 * It contributes no speech, action, goal change or claimed story progress. */
export interface ChatTurnEndControlV1 {
  version: 2
  kind: 'finish-current-turn'
  reason: 'local-purpose-completed'
  source: {messageId: string; sequence: number; excerpt: string}
  purpose: string
}
export const CHAT_TURN_END_CONTROL_CHECKS_V1 = [
  'current-turn-progress', 'local-purpose', 'pending-obligations', 'player-agency', 'visibility',
] as const

function fail(reason: string): never {throw new Error(`[chat-turn-end] ${reason}`)}
function object(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('本轮结束合同必须是对象')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))) fail('本轮结束字段缺失或夹带写入')
  return row
}
function text(value: unknown, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail('本轮结束文本为空或过长')
}

export function parseChatTurnEndControlV1(value: unknown): ChatTurnEndControlV1 {
  const row = object(value, ['version', 'kind', 'reason', 'source', 'purpose'])
  if (row.version !== 2 || row.kind !== 'finish-current-turn' || row.reason !== 'local-purpose-completed') fail('本轮结束版本或原因无效')
  const source = object(row.source, ['messageId', 'sequence', 'excerpt'])
  text(source.messageId, 200); text(source.excerpt, 1200); text(row.purpose, 1200)
  if (!Number.isSafeInteger(source.sequence) || source.sequence === 0) fail('本轮结束来源事件无效')
  return structuredClone(value) as ChatTurnEndControlV1
}

/** All visible dialogue for the triggering player input and this turn must
 * reach the reviewer. Exclusion cannot erase an unanswered request. */
export function readChatTurnEndBasisV1(state: CharacterInteractionRuntimeState, actorKey: string, control: ChatTurnEndControlV1) {
  const trigger = state.chatNarrative?.triggers.slice(-1)[0]
  if (!trigger || !trigger.actionSequences.length || trigger.actionSequences.slice(-1)[0] !== control.source.sequence) fail('结束依据不是本轮最新已保存行动')
  const start = Math.min(trigger.requestedSequence, trigger.sourceEventSequence)
  const basis = state.messages.filter(message => message.eventSequence >= start
    && message.supersededBySequence == null && interactionMessageVisibleTo(message, actorKey))
  if (basis.some(message => !isChatMessageRetrievableV1(state, message))) fail('本轮对话已被排除，无法核对局部目的是否完成')
  const source = basis.find(message => message.messageId === control.source.messageId && message.eventSequence === control.source.sequence)
  if (!source || source.role !== 'character' || source.speakerKey !== actorKey
    || !interactionMessageVisibleTo(source, state.playerKey) || !source.text.includes(control.source.excerpt)) fail('本轮结束缺少共同可见的真实行动原文')
  if (basis.some(message => message.role === 'player' && message.eventSequence > source.eventSequence)) fail('新的玩家消息尚未承接')
  return structuredClone(basis)
}

export function previewChatTurnEndControlV1(state: CharacterInteractionRuntimeState, input: {
  sequence: number; triggerSequence: number; actorKey: string; handoff: ChatTurnEndControlV1
}): CharacterInteractionRuntimeState {
  const control = parseChatTurnEndControlV1(input.handoff)
  const story = state.chatNarrative, scene = state.activeScene, trigger = story?.triggers.slice(-1)[0]
  if (!story || !scene || scene.status !== 'active' || scene.sceneKey !== story.situation.sceneKey
    || !scene.activeParticipantKeys.includes(input.actorKey)) fail('本轮结束缺少当前角色与情境')
  if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0 || input.sequence <= story.lastEventSequence) fail('本轮结束事件序号无效')
  if (!trigger || trigger.status !== 'ready' || trigger.requestedSequence !== input.triggerSequence) fail('本轮结束只适用于当前可运行轮次')
  if (story.pendingEdit || story.pendingSituation || trigger.direction?.scheduling) fail('本轮结束不能跳过待处理结果、改写或多人调度')
  assertChatTurnActorV1(state, trigger, input.actorKey)
  if (trigger.actionSequences.length >= chatTurnActionLimitV1(story.permissions, trigger)) fail('本轮额度已经结束')
  if (state.remainingDirectorBudget < 3) fail('本轮结束的选择、结果与审查预算不足')
  if (control.source.sequence <= trigger.requestedSequence || control.source.sequence < scene.startedAtSequence
    || control.source.sequence > story.lastEventSequence) fail('结束依据不属于当前场景和轮次')
  readChatTurnEndBasisV1(state, input.actorKey, control)
  const result = structuredClone(state), target = result.chatNarrative!
  const next = target.triggers.slice(-1)[0]
  next.status = 'complete'
  next.controlHandoff = {version: 2, sequence: input.sequence, actorKey: input.actorKey,
    sourceMessageId: control.source.messageId, sourceSequence: control.source.sequence}
  target.revision += 1; target.lastEventSequence = input.sequence
  result.remainingDirectorBudget -= 3
  return result
}
