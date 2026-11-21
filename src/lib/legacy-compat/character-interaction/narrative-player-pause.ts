import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatActorGoalV1, ChatNarrativeActionV1, ChatNarrativeTriggerStateV1, ChatPlayerRequestEvidenceV1 } from '../../types/chat-narrative';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';

function fail(message: string): never {throw new Error(`[chat-player-pause] ${message}`)}
function row(value: unknown, fields: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== fields.split(',').sort().join(',')) fail('暂停依据字段无效')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('暂停依据文本无效')
}
function sequence(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || value === 0) fail('暂停依据必须来自实际事件')
}
export function validateChatPlayerRequestEvidenceV1(value: unknown): void {
  const r = row(value, 'playerEventSequence,playerExcerpt')
  sequence(r.playerEventSequence); text(r.playerExcerpt, 1200)
}
export function validateChatGoalPlayerPauseV1(value: unknown, input: {initial: boolean; status: string; updatedSequence: number; threadKeys: string[]}): void {
  if (value === undefined) return
  if (input.initial || input.status !== 'paused') fail('玩家暂停只能属于运行中的暂停目标')
  const p = row(value, 'threadKey,requested,acknowledged')
  if (!input.threadKeys.includes(String(p.threadKey))) fail('暂停引用的原事项不存在')
  for (const item of [p.requested, p.acknowledged]) {
    const e = row(item, 'messageId,sequence,excerpt'); text(e.messageId, 200); text(e.excerpt, 2000); sequence(e.sequence)
  }
  const requested = p.requested as {sequence: number; messageId: string}, acknowledged = p.acknowledged as {sequence: number; messageId: string}
  if (requested.sequence >= acknowledged.sequence || acknowledged.sequence > input.updatedSequence || requested.messageId === acknowledged.messageId) fail('暂停请求和确认的事件顺序无效')
}

/** The semantic reviewer decides whether the quote actually grants a hold or
 * release. Domain checks bind it to this turn and to the entire audience. */
export function requireChatPlayerRequestV1(state: CharacterInteractionRuntimeState, actorKey: string, trigger: ChatNarrativeTriggerStateV1, request: ChatPlayerRequestEvidenceV1, audiences: string[]) {
  const source = state.messages.find(m => m.role === 'player' && m.eventSequence === request.playerEventSequence)
  if (trigger.kind !== 'player-response' || trigger.actionSequences.length || trigger.sourceEventSequence !== request.playerEventSequence
    || !source || source.supersededBySequence != null || !isChatMessageRetrievableV1(state, source)
    || state.messages.filter(m => m.role === 'player' && m.supersededBySequence == null).slice(-1)[0] !== source
    || !source.text.includes(request.playerExcerpt) || source.audienceKeys != null && [actorKey, ...audiences.filter(k => k !== state.playerKey)].some(k => !source.audienceKeys!.includes(k))) fail('暂停或恢复必须引用本轮真实可见的最新玩家消息，不以继续操作代替')
  return source
}

/** A hold on an existing responsibility needs no invented followup goal.
 * Only the current player's request authorizes this new boundary; the review
 * still verifies the acknowledgement and every separately promised term. */
export function requireChatExistingGoalPauseV1(state: CharacterInteractionRuntimeState, actorKey: string, trigger: ChatNarrativeTriggerStateV1, action: ChatNarrativeActionV1) {
  const pause = action.pauseGoal
  if (pause == null) return null
  const story = state.chatNarrative, goal = story?.situation.goals.find(g => g.actorKey === actorKey && g.goalKey === action.goalKey)
  const thread = story?.situation.threads.find(t => t.threadKey === pause.threadKey)
  if (!goal || !['active', 'paused'].includes(goal.status) || goal.playerPause
    || !thread || !['open', 'blocked', 'paused'].includes(thread.status)
    || !thread.participantKeys.includes(actorKey) || !thread.audienceKeys.includes(actorKey)
    || action.kind !== 'speak' || !action.waitingForPlayer
    || action.goalStatus !== (goal.status === 'active' ? 'paused' : null)
    || action.followupGoal != null || action.threadFollowupGoal != null || action.resumeGoal != null || action.promiseRequest != null
    || action.newFacts.length || action.goalUpdates?.length || action.relationshipUpdates?.length || action.beliefUpdates?.length
    || action.nextPossibilities?.length || action.situationRequest != null
    || action.commitmentEffects?.some(e => e.kind !== 'promise')
    || action.threadUpdates.some(e => e.threadKey !== pause.threadKey || e.status !== 'paused')
    || !action.evidenceFactKeys.length && action.disclosures.length
    || !action.text.includes(pause.evidenceExcerpt)) fail('已有目标暂停只能确认当前自身剩余责任及真实请求，不能推进、换目标或处置旧约')
  const source = requireChatPlayerRequestV1(state, actorKey, trigger, pause, action.audienceKeys)
  return {goal, source, pause}
}

export function assertChatPlayerPauseSourcesV1(state: CharacterInteractionRuntimeState): void {
  for (const goal of state.chatNarrative?.situation.goals ?? []) {
    const pause = goal.playerPause
    if (!pause) continue
    const request = state.messages.find(m => m.messageId === pause.requested.messageId && m.eventSequence === pause.requested.sequence)
    const ack = state.messages.find(m => m.messageId === pause.acknowledged.messageId && m.eventSequence === pause.acknowledged.sequence)
    if (!request || request.role !== 'player' || request.supersededBySequence != null || !request.text.includes(pause.requested.excerpt)
      || !ack || ack.role !== 'character' || ack.speakerKey !== goal.actorKey || ack.supersededBySequence != null || !ack.text.includes(pause.acknowledged.excerpt)
      || !ack.audienceKeys?.includes(goal.actorKey) || !ack.audienceKeys.includes(state.playerKey)
      || request.audienceKeys != null && ack.audienceKeys.some(k => k !== state.playerKey && !request.audienceKeys!.includes(k))) fail('暂停缺少同一玩家请求与角色实际确认的消息依据')
    const thread = state.chatNarrative!.situation.threads.find(t => t.threadKey === pause.threadKey)
    if (!thread?.participantKeys.includes(goal.actorKey) || !thread.audienceKeys.includes(goal.actorKey)) fail('暂停不能接管其他角色或不可知事项')
  }
}

/** Run before a new followup goal is previewed. No background, ownership,
 * message or event is created here; the existing reviewed action commits it. */
export function applyChatPlayerGoalResumeV1(state: CharacterInteractionRuntimeState, input: {action: ChatNarrativeActionV1; actorKey: string; trigger: ChatNarrativeTriggerStateV1}): void {
  const {action, actorKey, trigger} = input, goals = state.chatNarrative!.situation.goals
  const held = goals.filter(g => g.actorKey === actorKey && g.playerPause)
  if (held.some(g => g.goalKey !== action.goalKey && (action.goalUpdates?.some(e => e.goalKey === g.goalKey) || action.threadUpdates.some(e => e.threadKey === g.playerPause!.threadKey)))) fail('不能用另一个目标或附带变化绕过玩家暂停')
  const goal = held.find(g => g.goalKey === action.goalKey)
  if (!goal) {if (action.resumeGoal != null) fail('当前目标没有待恢复的玩家暂停'); return}
  if (action.resumeGoal == null) {
    if (!['speak', 'pause'].includes(action.kind) || !action.waitingForPlayer || action.goalStatus !== null || action.goalUpdates?.length
      || action.newFacts.length || action.threadUpdates.length || action.commitmentEffects?.length || action.nextPossibilities?.length || action.situationRequest != null) fail('玩家暂停尚未解除，只能等待或回应，不能执行和改写暂停事项')
    return
  }
  const source = requireChatPlayerRequestV1(state, actorKey, trigger, action.resumeGoal, action.audienceKeys)
  if (source.eventSequence <= goal.playerPause!.acknowledged.sequence || !['active', 'fulfilled', 'abandoned'].includes(action.goalStatus ?? '')
    || action.followupGoal != null || action.threadFollowupGoal != null) fail('恢复须来自确认暂停后的新玩家依据，并明确处置原目标')
  delete goal.playerPause
}

export function chatPlayerPauseSequencesV1(goals: ChatActorGoalV1[]): number[] {
  return goals.flatMap(g => g.playerPause ? [g.playerPause.requested.sequence, g.playerPause.acknowledged.sequence] : [])
}
export function rebaseChatPlayerPausesV1(goals: ChatActorGoalV1[], rebase: (sequence: number) => number): void {
  for (const g of goals) if (g.playerPause) {
    g.playerPause.requested.sequence = rebase(g.playerPause.requested.sequence)
    g.playerPause.acknowledged.sequence = rebase(g.playerPause.acknowledged.sequence)
  }
}
