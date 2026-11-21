import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatNarrativeActionV1, ChatNarrativeTriggerStateV1 } from '../../types/chat-narrative';
import { requireChatPlayerRequestV1 } from './narrative-player-pause';
import { interactionMessageVisibleTo } from './message-visibility';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';

function fail(message: string): never {throw new Error(`[chat-promise-request] ${message}`)}

/** Eligibility is deterministic. The independent commitment review must still
 * establish that the quoted request warrants exactly this own future duty. */
export function requireChatPromiseRequestV1(state: CharacterInteractionRuntimeState, actorKey: string, trigger: ChatNarrativeTriggerStateV1, action: ChatNarrativeActionV1) {
  if (action.promiseRequest == null) return null
  const story = state.chatNarrative, effects = action.commitmentEffects ?? []
  const goal = story?.situation.goals.find(g => g.actorKey === actorKey && g.goalKey === action.goalKey)
  if (!goal || !['active', 'paused'].includes(goal.status) || goal.playerPause
    || action.kind !== 'speak' || action.evidenceFactKeys.length || action.goalStatus !== null
    || effects.length !== 1 || effects[0].kind !== 'promise'
    || action.newFacts.length || action.disclosures.length || action.threadUpdates.length || action.goalUpdates?.length
    || action.relationshipUpdates?.length || action.beliefUpdates?.length || action.nextPossibilities != null
    || action.pauseGoal != null || action.situationRequest != null || action.followupGoal != null || action.threadFollowupGoal != null || action.resumeGoal != null) {
    fail('对话约定只可登记已有自身目标的一项新承诺，不能附带事实、履行、改约、恢复或其他后果')
  }
  const source = requireChatPlayerRequestV1(state, actorKey, trigger, action.promiseRequest, action.audienceKeys)
  const latest = state.messages.filter(m => m.supersededBySequence == null && interactionMessageVisibleTo(m, actorKey) && isChatMessageRetrievableV1(state, m)).slice(-1)[0]
  if (source !== latest) fail('对话约定必须来自当前实际读取的最新玩家消息')
  return source
}
