import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatNarrativeTriggerStateV1, ChatTurnDirectionV1 } from '../../types/chat-narrative';

type ConversationBoundary = Pick<ChatTurnDirectionV1, 'audienceParticipantKeys' | 'conversationMode'>

/** Low-level callers cannot omit a new message's send-time privacy by omitting
 * UI direction fields. Historical messages without a mode retain their rules. */
export function chatTurnAudienceBoundaryV1(state: CharacterInteractionRuntimeState, trigger: ChatNarrativeTriggerStateV1): ConversationBoundary | undefined {
  const direction = trigger.direction
  const message = trigger.kind === 'player-response' ? state.messages.find(m => m.role === 'player' && m.eventSequence === trigger.sourceEventSequence) : null
  if (!message?.playerConversation) return direction
  const listeners = message.audienceKeys!.filter(key => key !== state.playerKey)
  return {
    audienceParticipantKeys: direction?.audienceParticipantKeys?.filter(key => listeners.includes(key)) ?? listeners,
    conversationMode: message.playerConversation === 'private' ? 'private' : direction?.conversationMode ?? (direction?.audienceParticipantKeys ? 'private' : 'present'),
  }
}

export function assertChatTurnAudienceV1(direction: ConversationBoundary | undefined, playerKey: string, recipients: readonly string[]): void {
  const audience = direction?.audienceParticipantKeys
  if (audience && recipients.some(key => key !== playerKey && !audience.includes(key))) throw new Error('候选超出本轮私聊或对话的听众范围。')
}

/** Public conversation remains public even if another role is currently absent.
 * Historical narrowed turns without an explicit mode keep conservative metadata rules. */
export function chatTurnHasPrivateSceneBoundaryV1(state: CharacterInteractionRuntimeState, direction: ConversationBoundary | undefined): boolean {
  return direction?.conversationMode === 'private' || direction?.audienceParticipantKeys !== undefined && direction.conversationMode !== 'present'
    && state.profiles.some(profile => !direction.audienceParticipantKeys!.includes(profile.participantKey))
}
