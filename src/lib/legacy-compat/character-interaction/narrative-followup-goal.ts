import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatNarrativeActionV1, ChatNarrativeTriggerStateV1 } from '../../types/chat-narrative';
import { chatCanRespondAfterClosureV1 } from './narrative-scheduling';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';

function fail(message: string): never {throw new Error(`[chat-followup] ${message}`)}

/** Called only on the private action preview. No background, ownership or
 * permissions come from the model; rejection discards this entire preview. */
export function applyChatOwnFollowupGoalV1(state: CharacterInteractionRuntimeState, input: {
  action: ChatNarrativeActionV1; actorKey: string; sequence: number; trigger: ChatNarrativeTriggerStateV1
}): void {
  const {action, actorKey, sequence, trigger} = input, proposal = action.followupGoal
  if (proposal == null) return
  const story = state.chatNarrative!, source = state.messages.find(m => m.role === 'player' && m.eventSequence === proposal.playerEventSequence)
  if (story.permissions.allowPlayerFollowupSituations !== true || story.permissions.allowActorSituationExpansion !== true
    || !chatCanRespondAfterClosureV1(state, actorKey, trigger) || story.pendingSituation) fail('新目标只允许在授权且无待处理事项的首次玩家回应中建立')
  if (trigger.sourceEventSequence !== proposal.playerEventSequence || !source || source.supersededBySequence != null || !isChatMessageRetrievableV1(state, source)
    || state.messages.filter(m => m.role === 'player' && m.supersededBySequence == null).slice(-1)[0] !== source
    || !source.text.includes(proposal.playerExcerpt) || source.audienceKeys != null && action.audienceKeys.some(k => k !== state.playerKey && !source.audienceKeys!.includes(k))) fail('新目标须引用本轮真实可见的玩家请求并保持对话范围')
  if (action.goalKey !== proposal.goal.goalKey || !action.text.includes(proposal.evidenceExcerpt)
    || action.waitingForPlayer || action.kind === 'pause' || action.kind === 'attempt'
    || action.situationRequest != null && !['observation-result', 'inquiry-result'].includes(action.situationRequest.purpose ?? '')) fail('新目标须与自身实际表达一起成立；新背景仍须先构建')
  if (story.situation.goals.some(g => g.goalKey === proposal.goal.goalKey || g.actorKey === actorKey && g.desire === proposal.goal.desire)
    || story.situation.threads.some(t => t.threadKey === proposal.thread.threadKey || t.question === proposal.thread.question)) fail('不得复活、复制或覆写旧目标与剧情线')
  const evidence = (ids: string[], audiences: string[]) => {
    if (!ids.length || ids.some(id => {
      const fact = story.situation.facts.find(f => f.factKey === id)
      return !fact || audiences.some(viewer => !fact.audienceKeys.includes(viewer))
    })) fail('新目标或问题缺少当前可知事实依据')
  }
  evidence(proposal.goal.evidenceFactKeys, [actorKey])
  evidence(proposal.thread.evidenceFactKeys, action.audienceKeys)
  story.situation.goals.push({...proposal.goal, actorKey, status: 'active', updatedSequence: sequence})
  story.situation.threads.push({...proposal.thread, audienceKeys: [...action.audienceKeys], participantKeys: [actorKey], status: 'open', updatedSequence: sequence})
}
