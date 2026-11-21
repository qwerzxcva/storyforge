import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatPlayerDecisionHandoffV1 } from './control-handoff-contract';
import { interactionMessageVisibleTo } from './message-visibility';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';

/** The existing trigger binds the exact new player message. No generated
 * classification becomes a player decision, permission, pause or story fact. */
export interface ChatPlayerAcknowledgementHandoffV1 extends Omit<ChatPlayerDecisionHandoffV1, 'version'> {
  version: 4
}

function fail(): never {throw new Error('[chat-player-acknowledgement] 缺少本轮尚未承接、共同可见的真实玩家回应')}

export function assertChatPlayerAcknowledgementStateV1(state: CharacterInteractionRuntimeState, actorKey: string,
  handoff: ChatPlayerAcknowledgementHandoffV1): void {
  const trigger = state.chatNarrative?.triggers.slice(-1)[0]
  const visible = state.messages.filter(message => message.supersededBySequence == null && interactionMessageVisibleTo(message, actorKey))
  const matches = visible.filter(message => message.eventSequence === trigger?.sourceEventSequence)
  if (!trigger || trigger.kind !== 'player-response' || trigger.actionSequences.length || matches.length !== 1
    || matches[0].role !== 'player' || matches[0].speakerKey !== state.playerKey || visible[visible.length - 1] !== matches[0]
    || !interactionMessageVisibleTo(matches[0], state.playerKey) || !isChatMessageRetrievableV1(state, matches[0])
    || handoff.source.sequence >= matches[0].eventSequence || matches[0].eventSequence >= trigger.requestedSequence) fail()
}
