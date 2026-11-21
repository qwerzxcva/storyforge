
import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatNarrativeActionV1, ChatNarrativeTriggerStateV1 } from '../../types/chat-narrative';
import { interactionMessageVisibleTo } from './message-visibility';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';
import { assertChatPlayerPauseSourcesV1 } from './narrative-player-pause';

/** Conversation can ground an acknowledgement, never an unrecorded action.
 * This only establishes evidence eligibility; the independent reviewer still
 * checks the meaning of the full text and every required consequence. */
export function chatConversationEvidenceV1(state: CharacterInteractionRuntimeState, actorKey: string, trigger: ChatNarrativeTriggerStateV1, action: ChatNarrativeActionV1): 'player-message' | 'confirmed-pause' | null {
  const story = state.chatNarrative
  // The caller validates the same action's local completion before applying
  // evidence. A completed response need not invent another player decision.
  const completedResponse = trigger.kind === 'player-response' && action.kind === 'speak' && action.turnCompletion != null
  if (!story || trigger.actionSequences.length || !['speak', 'pause'].includes(action.kind)
    || action.goalKey !== null && !action.waitingForPlayer && !completedResponse || action.goalStatus !== null
    || action.newFacts.length || action.disclosures.length || action.threadUpdates.length || action.goalUpdates?.length
    || action.relationshipUpdates?.length || action.beliefUpdates?.length || action.commitmentEffects?.length
    || action.nextPossibilities?.length || action.nextPossibilities != null && story.situation.possibilities.some(p => p.actorKey === actorKey)
    || action.situationRequest != null || action.followupGoal != null || action.threadFollowupGoal != null || action.resumeGoal != null || action.pauseGoal != null || action.promiseRequest != null) return null
  const visible = state.messages.filter(m => m.supersededBySequence == null && interactionMessageVisibleTo(m, actorKey) && isChatMessageRetrievableV1(state, m))
  const latest = visible.slice(-1)[0]
  // The latest visible message is retained by the registered role reader even
  // at its final budget boundary. Do not rely on omitted older conversation.
  if (trigger.kind === 'player-response' && latest?.role === 'player' && latest.eventSequence === trigger.sourceEventSequence
    && action.audienceKeys.every(k => interactionMessageVisibleTo(latest, k))) return 'player-message'
  const goal = story.situation.goals.find(g => g.actorKey === actorKey && g.goalKey === action.goalKey && g.status === 'paused' && g.playerPause)
  if (!goal || !['player-response', 'continue', 'return'].includes(trigger.kind)) return null
  assertChatPlayerPauseSourcesV1(state)
  const pause = goal.playerPause!
  const sources = [pause.requested, pause.acknowledged].map(e => state.messages.find(m => m.messageId === e.messageId && m.eventSequence === e.sequence)!)
  // A pause is still binding when its dialogue is excluded. Its confirmed
  // evidence remains in the own-goal context; exclusion cannot release it.
  return sources.every(m => action.audienceKeys.every(k => interactionMessageVisibleTo(m, k))) ? 'confirmed-pause' : null
}
