import { CHAT_HISTORY_CAPACITY_V1 } from './history-capacity';
import { requireChatPlayerRequestV1 } from './narrative-player-pause';
import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatNarrativeActionV1, ChatNarrativeTriggerStateV1 } from '../../types/chat-narrative';

type Trigger = Pick<ChatNarrativeTriggerStateV1, 'kind' | 'actionSequences'>
function fail(message: string): never {throw new Error(`[chat-thread-followup] ${message}`)}

/** One bounded opportunity, not consent to participate or resume a pause. */
export function chatThreadFollowupThreadsV1(state: CharacterInteractionRuntimeState, actorKey: string, trigger: Trigger) {
  const story = state.chatNarrative
  if (!story || story.permissions.allowActorThreadFollowups !== true || story.permissions.allowActorSituationExpansion !== true
    || !state.activeScene?.activeParticipantKeys.includes(actorKey) || story.pendingEdit || story.pendingSituation
    || !['player-response', 'continue', 'return'].includes(trigger.kind) || trigger.actionSequences.length
    || story.situation.goals.some(g => g.actorKey === actorKey && ['active', 'paused'].includes(g.status))) return []
  return story.situation.threads.filter(t => ['open', 'blocked'].includes(t.status)
    && t.participantKeys.includes(actorKey) && t.audienceKeys.includes(actorKey))
}

export function chatCanFollowThreadV1(state: CharacterInteractionRuntimeState, actorKey: string, trigger: Trigger): boolean {
  return chatThreadFollowupThreadsV1(state, actorKey, trigger).length > 0
}

/** Preview only; the existing reviewed action atomically commits the new goal
 * and first step. Historical goals, threads and facts remain unchanged. */
export function applyChatThreadFollowupGoalV1(state: CharacterInteractionRuntimeState, input: {
  action: ChatNarrativeActionV1; actorKey: string; sequence: number; messageId: string; trigger: ChatNarrativeTriggerStateV1
}): void {
  const {action, actorKey, sequence, messageId, trigger} = input, proposal = action.threadFollowupGoal
  if (proposal == null) return
  const threads = chatThreadFollowupThreadsV1(state, actorKey, trigger), story = state.chatNarrative!
  if (!threads.some(t => t.threadKey === proposal.threadKey)) fail('没有授权、参与且可接续的未完成事项')
  const pause = proposal.pauseRequest
  if (action.followupGoal != null || action.resumeGoal != null || action.goalKey !== proposal.goal.goalKey
    || !pause && (action.waitingForPlayer || ['attempt', 'pause'].includes(action.kind)) || !action.text.includes(proposal.evidenceExcerpt)
    || action.situationRequest != null && (!['observation-result', 'inquiry-result'].includes(action.situationRequest.purpose ?? '') || action.situationRequest.threadKey !== proposal.threadKey)) fail('接续目标必须与自己的实际行动一起成立，不能代替新背景或玩家决定')
  if (story.situation.goals.some(g => g.goalKey === proposal.goal.goalKey || g.actorKey === actorKey && g.desire === proposal.goal.desire)) fail('接续不能复活、复制或覆盖旧目标')
  if (story.situation.goals.length >= CHAT_HISTORY_CAPACITY_V1.goals) fail('目标历史已达上限，请保存并停止演绎')
  if (!proposal.goal.evidenceFactKeys.length || proposal.goal.evidenceFactKeys.some(id => !story.situation.facts.some(f => f.factKey === id && f.audienceKeys.includes(actorKey)))) fail('接续目标缺少角色当前可知的事实依据')
  let playerPause
  if (pause) {
    const source = requireChatPlayerRequestV1(state, actorKey, trigger, pause, action.audienceKeys)
    if (action.kind !== 'speak' || !action.waitingForPlayer || action.goalStatus !== 'paused' || action.newFacts.length || action.disclosures.length
      || action.goalUpdates?.length || action.relationshipUpdates?.length || action.beliefUpdates?.length || action.nextPossibilities?.length || action.situationRequest != null
      || action.commitmentEffects?.some(e => e.kind !== 'promise') || action.threadUpdates.some(e => e.threadKey !== proposal.threadKey || e.status !== 'paused')) fail('明确暂停只能确认自身剩余责任及约定，不能夹带推进或其他后果')
    playerPause = {threadKey: proposal.threadKey, requested: {messageId: source.messageId, sequence: source.eventSequence, excerpt: pause.playerExcerpt},
      acknowledged: {messageId, sequence, excerpt: proposal.evidenceExcerpt}}
  }
  story.situation.goals.push({...proposal.goal, actorKey, status: 'active', updatedSequence: sequence, ...(playerPause ? {playerPause} : {})})
}
