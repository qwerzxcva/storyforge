import type { CharacterInteractionRuntimeState } from '../../types/index';
import { interactionMessageVisibleTo } from './message-visibility';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';
import { assertChatTurnActorV1 } from './narrative-scheduling';

/** A disposition of an already adopted pause. It never adds dialogue or
 * changes a goal, responsibility, permission, fact or story progress. */
export interface ChatMaintainedPauseControlV1 {
  version: 3
  kind: 'maintain-existing-pause'
  reason: 'pause-still-applicable'
  source: {messageId: string; sequence: number; excerpt: string}
  goalKey: string
  rationale: string
}
export const CHAT_MAINTAINED_PAUSE_CHECKS_V1 = [
  'current-pause', 'current-opportunity', 'pending-obligations', 'available-direction', 'player-agency', 'visibility',
] as const
function fail(reason: string): never {throw new Error(`[chat-maintained-pause] ${reason}`)}
function record(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('维持暂停必须是对象')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))) fail('维持暂停字段缺失或夹带写入')
  return row
}
function text(value: unknown, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail('维持暂停文本为空或过长')
}
export function parseChatMaintainedPauseControlV1(value: unknown): ChatMaintainedPauseControlV1 {
  const row = record(value, ['version', 'kind', 'reason', 'source', 'goalKey', 'rationale'])
  if (row.version !== 3 || row.kind !== 'maintain-existing-pause' || row.reason !== 'pause-still-applicable') fail('维持暂停版本或原因无效')
  const source = record(row.source, ['messageId', 'sequence', 'excerpt'])
  text(source.messageId, 200); text(source.excerpt, 1200); text(row.goalKey, 160); text(row.rationale, 1200)
  if (!Number.isSafeInteger(source.sequence) || source.sequence === 0) fail('维持暂停来源事件无效')
  return structuredClone(value) as ChatMaintainedPauseControlV1
}

/** Do not let an excluded answer disappear from the independent review. */
export function readChatMaintainedPauseBasisV1(state: CharacterInteractionRuntimeState, actorKey: string, handoff: ChatMaintainedPauseControlV1) {
  const index = state.messages.findIndex(message => message.messageId === handoff.source.messageId && message.eventSequence === handoff.source.sequence)
  if (index < 0) fail('暂停的实际表达缺失')
  const basis = state.messages.slice(index).filter(message => message.supersededBySequence == null && interactionMessageVisibleTo(message, actorKey))
  if (basis.some(message => !isChatMessageRetrievableV1(state, message))) fail('暂停后对话已被排除，无法核对暂停仍然适用')
  return structuredClone(basis)
}

export function previewChatMaintainedPauseControlV1(state: CharacterInteractionRuntimeState, input: {
  sequence: number; triggerSequence: number; actorKey: string; handoff: ChatMaintainedPauseControlV1
}): CharacterInteractionRuntimeState {
  const handoff = parseChatMaintainedPauseControlV1(input.handoff), story = state.chatNarrative, scene = state.activeScene
  const trigger = story?.triggers.slice(-1)[0]
  if (!story || !scene || scene.status !== 'active' || scene.sceneKey !== story.situation.sceneKey || !scene.activeParticipantKeys.includes(input.actorKey)) fail('维持暂停缺少当前角色与情境')
  if (!Number.isSafeInteger(input.sequence) || input.sequence <= 0 || input.sequence <= story.lastEventSequence) fail('维持暂停事件序号无效')
  if (!trigger || trigger.status !== 'ready' || trigger.requestedSequence !== input.triggerSequence
    || !['continue', 'return'].includes(trigger.kind) || trigger.actionSequences.length) fail('维持暂停只适用于尚未行动的继续或返回轮次')
  if (story.pendingEdit || story.pendingSituation || trigger.direction?.scheduling) fail('维持暂停不能跳过待处理结果、改写或多人调度')
  assertChatTurnActorV1(state, trigger, input.actorKey)
  const ownGoals = story.situation.goals.filter(goal => goal.actorKey === input.actorKey)
  const goal = ownGoals.find(goal => goal.goalKey === handoff.goalKey)
  if (!goal || goal.status !== 'paused' || goal.playerPause || goal.updatedSequence !== handoff.source.sequence
    || ownGoals.some(other => other.status === 'active' || other.status === 'paused' && other.playerPause)) fail('缺少已采用的自主暂停，或仍有活跃目标/玩家暂停')
  const matches = state.messages.filter(message => message.messageId === handoff.source.messageId && message.eventSequence === handoff.source.sequence)
  const source = matches[0]
  if (matches.length !== 1 || source.role !== 'character' || source.speakerKey !== input.actorKey || source.supersededBySequence != null
    || !interactionMessageVisibleTo(source, state.playerKey) || !interactionMessageVisibleTo(source, input.actorKey)
    || !isChatMessageRetrievableV1(state, source) || !source.text.includes(handoff.source.excerpt)
    || source.eventSequence < scene.startedAtSequence || source.eventSequence >= trigger.requestedSequence) fail('暂停来源不是当前场景中已保存的共同可见表达')
  const basis = readChatMaintainedPauseBasisV1(state, input.actorKey, handoff)
  const lastPlayer = basis.filter(message => message.role === 'player').slice(-1)[0]
  const lastActor = basis.filter(message => message.role === 'character' && message.speakerKey === input.actorKey).slice(-1)[0]
  if (lastPlayer && (!lastActor || lastPlayer.eventSequence > lastActor.eventSequence)) fail('新的玩家消息尚未承接')
  if (state.remainingDirectorBudget < 3) fail('维持暂停的选择、结果与审查预算不足')
  const result = structuredClone(state), target = result.chatNarrative!, next = target.triggers.slice(-1)[0]
  next.status = 'complete'
  next.controlHandoff = {version: 3, sequence: input.sequence, actorKey: input.actorKey,
    sourceMessageId: source.messageId, sourceSequence: source.eventSequence}
  target.revision += 1; target.lastEventSequence = input.sequence; result.remainingDirectorBudget -= 3
  return result
}
