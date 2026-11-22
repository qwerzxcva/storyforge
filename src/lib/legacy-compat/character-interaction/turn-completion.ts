import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatNarrativeActionV1, ChatTurnCompletionV1 } from '../../types/chat-narrative';

function fail(reason: string): never {throw new Error(`[chat-turn-completion] ${reason}`)}

/** This is a disposition of the same reviewed action, not another speech,
 * consequence, goal state or model call. Historical actions omit it. */
export function parseChatTurnCompletionV1(value: unknown): ChatTurnCompletionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('本轮结束依据必须是对象')
  const row = value as Record<string, unknown>
  if (Object.keys(row).sort().join(',') !== 'evidenceExcerpt,purpose,version' || row.version !== 1) fail('本轮结束合同字段或版本无效')
  for (const field of ['purpose', 'evidenceExcerpt']) {
    if (typeof row[field] !== 'string' || !row[field].trim() || row[field].length > 1200) fail('本轮结束依据为空或过长')
  }
  return structuredClone(value) as ChatTurnCompletionV1
}

/** Structural eligibility cannot prove useful progress. The separate review
 * must establish that this action actually meets the stated local purpose. */
export function assertChatTurnCompletionV1(state: CharacterInteractionRuntimeState, actorKey: string, action: ChatNarrativeActionV1): void {
  if (action.turnCompletion == null) return
  const completion = parseChatTurnCompletionV1(action.turnCompletion)
  const story = state.chatNarrative, trigger = story?.triggers.slice(-1)[0]
  if (!story || !trigger || trigger.status !== 'ready' || trigger.direction?.scheduling) fail('本轮结束只适用于当前单角色轮次')
  if (story.pendingEdit || story.pendingSituation || action.situationRequest || action.sceneTransition) fail('本轮结束不能跳过改写、情境结果或转场')
  if (action.waitingForPlayer || !['speak', 'complete'].includes(action.kind)) fail('等待决定或暂停不能伪装成本轮完成')
  if (!story.situation.goals.some(goal => goal.goalKey === action.goalKey && goal.actorKey === actorKey && goal.status === 'active')
    || action.goalStatus !== null || action.goalUpdates?.length || action.followupGoal || action.threadFollowupGoal || action.pauseGoal || action.resumeGoal) fail('本轮结束必须保留原有活跃目标')
  if (!action.text.includes(completion.evidenceExcerpt)) fail('本轮结束须引用本次实际表达，不能借用旧进展')
}

export function validateChatTurnCompletionCheckV1(value: unknown, action: ChatNarrativeActionV1): void {
  if (action.turnCompletion == null) {
    if (value !== undefined) fail('无本轮结束候选不能添加结束审查')
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('本轮结束缺少独立审查')
  const row = value as Record<string, unknown>
  if (Object.keys(row).sort().join(',') !== 'passed,reason' || typeof row.passed !== 'boolean'
    || typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 2000) fail('本轮结束审查无效')
}
