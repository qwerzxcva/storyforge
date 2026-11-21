import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatNarrativeActionV1, ChatNarrativeStateV1, ChatNarrativeTriggerStateV1 } from '../../types/chat-narrative';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';
import { validateChatPlayerRequestEvidenceV1 } from './narrative-player-pause';

function fail(message: string): never {throw new Error(`[chat-scene-transition] ${message}`)}
function row(value: unknown, fields: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== fields.split(',').sort().join(',')) fail('转场字段无效')
  return value as Record<string, unknown>
}
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('转场文本无效')
}
function key(value: unknown): asserts value is string {
  text(value, 160)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)) fail('转场引用无效')
}
function sequence(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || value === 0) fail('转场须引用实际事件')
}
export function validateChatSceneTransitionV1(value: unknown): void {
  const r = row(value, 'destinationFactKey,destinationExcerpt,arrivalFactKey,evidenceExcerpt,playerEventSequence,playerExcerpt')
  key(r.destinationFactKey); key(r.arrivalFactKey); text(r.destinationExcerpt, 200); text(r.evidenceExcerpt, 2000)
  validateChatPlayerRequestEvidenceV1({playerEventSequence: r.playerEventSequence, playerExcerpt: r.playerExcerpt})
}

/** Check the unchanged situation, before disclosures or newly created facts.
 * Semantic consent/arrival is independently reviewed, never inferred from a quote match. */
export function requireChatSceneTransitionV1(state: CharacterInteractionRuntimeState, actorKey: string, trigger: ChatNarrativeTriggerStateV1, action: ChatNarrativeActionV1) {
  const change = action.sceneTransition
  if (change == null) return null
  const story = state.chatNarrative!, scene = state.activeScene!
  const destination = story.situation.facts.find(f => f.factKey === change.destinationFactKey)
  const arrival = action.newFacts.find(f => f.factKey === change.arrivalFactKey)
  const source = state.messages.filter(m => m.role === 'player' && m.supersededBySequence == null).slice(-1)[0]
  if (!source || source.eventSequence !== change.playerEventSequence || !isChatMessageRetrievableV1(state, source)
    || source.eventSequence <= scene.startedAtSequence || !source.text.includes(change.playerExcerpt)
    || source.audienceKeys != null && !source.audienceKeys.includes(actorKey)
    || !['player-response', 'continue'].includes(trigger.kind)
    || trigger.kind === 'player-response' && trigger.sourceEventSequence !== source.eventSequence
    || source.eventSequence >= trigger.requestedSequence
    || story.sceneTransitions?.some(t => t.requested.messageId === source.messageId)) fail('转场缺少当前场景最新且未消费的真实玩家授权来源')
  if (scene.activeParticipantKeys.length !== 1 || scene.activeParticipantKeys[0] !== actorKey
    || action.audienceKeys.length !== 2 || !action.audienceKeys.includes(actorKey) || !action.audienceKeys.includes(state.playerKey)
    || action.kind !== 'complete' || action.waitingForPlayer
    || !story.situation.goals.some(g => g.goalKey === action.goalKey && g.actorKey === actorKey && g.status === 'active')
    || action.followupGoal != null || action.threadFollowupGoal != null || action.pauseGoal != null || action.promiseRequest != null) fail('转场须是当前单角色场景的实际完成行动，不能代其他角色移动或绕过目标授权')
  if (!destination || !destination.audienceKeys.includes(actorKey) || !destination.audienceKeys.includes(state.playerKey)
    || !destination.text.includes(change.destinationExcerpt) || change.destinationExcerpt === story.situation.location
    || !action.evidenceFactKeys.includes(destination.factKey)
    || !arrival || action.newFacts.length !== 1 || arrival.kind !== 'observation'
    || !arrival.evidenceFactKeys.includes(destination.factKey) || !arrival.text.includes(change.destinationExcerpt)
    || !change.evidenceExcerpt.includes(arrival.text) || !action.text.includes(change.evidenceExcerpt)) fail('转场必须引用此前双方已知地点和本次实际到达事实；不得以新造地点或调查结果代替')
  return {change, source}
}

export function applyChatSceneTransitionV1(state: CharacterInteractionRuntimeState, input: {
  actorKey: string; messageId: string; sequence: number; transition: NonNullable<ReturnType<typeof requireChatSceneTransitionV1>>
}): void {
  const {change, source} = input.transition, story = state.chatNarrative!, scene = state.activeScene!
  const record = {sceneKey: scene.sceneKey, actorKey: input.actorKey, fromLocation: story.situation.location,
    destinationFactKey: change.destinationFactKey, destinationExcerpt: change.destinationExcerpt, arrivalFactKey: change.arrivalFactKey,
    requested: {messageId: source.messageId, sequence: source.eventSequence, excerpt: source.text},
    arrived: {messageId: input.messageId, sequence: input.sequence, excerpt: change.evidenceExcerpt}}
  story.sceneTransitions = [...(story.sceneTransitions ?? []), record]
  story.situation.location = scene.location = change.destinationExcerpt
  story.situation.title = scene.title = change.destinationExcerpt
}

export function validateChatSceneTransitionRecordsV1(state: ChatNarrativeStateV1, boundary: {participantKeys: readonly string[]; sceneKeys: readonly string[]}): void {
  if (state.sceneTransitions === undefined) return
  if (!Array.isArray(state.sceneTransitions) || state.sceneTransitions.length > 1000 || state.revision === 0 && state.sceneTransitions.length) fail('转场历史无效')
  const requests = new Set<string>(), arrivals = new Set<string>()
  let previous = Number.MIN_SAFE_INTEGER
  for (const value of state.sceneTransitions) {
    const r = row(value, 'sceneKey,actorKey,fromLocation,destinationFactKey,destinationExcerpt,arrivalFactKey,requested,arrived')
    key(r.sceneKey); key(r.actorKey); key(r.destinationFactKey); key(r.arrivalFactKey)
    text(r.fromLocation, 4000); text(r.destinationExcerpt, 200)
    if (!boundary.sceneKeys.includes(r.sceneKey) || !boundary.participantKeys.includes(r.actorKey)) fail('转场场景或角色越界')
    for (const v of [r.requested, r.arrived]) {
      const e = row(v, 'messageId,sequence,excerpt'); text(e.messageId, 200); text(e.excerpt, 20000); sequence(e.sequence)
    }
    const {requested, arrived} = value
    const destination = state.situation.facts.find(f => f.factKey === value.destinationFactKey)
    const arrival = state.situation.facts.find(f => f.factKey === value.arrivalFactKey)
    if (!destination || !destination.text.includes(value.destinationExcerpt)
      || destination.sourceEventSequence !== 0 && destination.sourceEventSequence >= arrived.sequence
      || !arrival || arrival.origin !== 'runtime-consequence' || arrival.sourceEventSequence !== arrived.sequence
      || !arrival.text.includes(value.destinationExcerpt) || !arrived.excerpt.includes(arrival.text)
      || [destination, arrival].some(f => !f.audienceKeys.includes('player') || !f.audienceKeys.includes(value.actorKey))
      || value.fromLocation === value.destinationExcerpt || requested.sequence >= arrived.sequence || arrived.sequence > state.lastEventSequence
      || arrived.sequence <= previous || requested.messageId === arrived.messageId || requests.has(requested.messageId) || arrivals.has(arrived.messageId)) fail('转场历史缺少一致的事实、授权及到达顺序')
    requests.add(requested.messageId); arrivals.add(arrived.messageId); previous = arrived.sequence
  }
}

export function assertChatSceneTransitionSourcesV1(state: CharacterInteractionRuntimeState): void {
  for (const r of state.chatNarrative?.sceneTransitions ?? []) {
    const source = state.messages.find(m => m.messageId === r.requested.messageId && m.eventSequence === r.requested.sequence)
    const arrival = state.messages.find(m => m.messageId === r.arrived.messageId && m.eventSequence === r.arrived.sequence)
    if (!source || source.role !== 'player' || source.supersededBySequence != null || source.text !== r.requested.excerpt
      || source.audienceKeys != null && !source.audienceKeys.includes(r.actorKey)
      || !arrival || arrival.role !== 'character' || arrival.speakerKey !== r.actorKey || arrival.supersededBySequence != null
      || !arrival.text.includes(r.arrived.excerpt) || !arrival.audienceKeys?.includes(r.actorKey) || !arrival.audienceKeys.includes(state.playerKey)) fail('转场缺少完整玩家授权或角色到达消息')
  }
  const latest = state.chatNarrative?.sceneTransitions?.slice(-1)[0], scene = state.activeScene, situation = state.chatNarrative?.situation
  // A later explicitly constructed scene may have its own location. Otherwise
  // the last completed visit must still be reflected in both current views.
  if (latest && scene && situation && latest.sceneKey === scene.sceneKey && situation.sceneKey === scene.sceneKey
    && latest.arrived.sequence > scene.startedAtSequence && situation.seed.sourceEventSequence <= latest.arrived.sequence
    && (scene.location !== latest.destinationExcerpt || situation.location !== latest.destinationExcerpt)) fail('已完成转场与当前场景地点不一致')
}

export function validateChatSceneTransitionCheckV1(value: unknown, action: ChatNarrativeActionV1): void {
  const transition = action.sceneTransition
  if (transition == null) {if (value !== undefined) fail('没有转场的候选不能附带转场审查'); return}
  const check = row(value, 'destinationFactKey,arrivalFactKey,playerEventSequence,passed,reason')
  text(check.reason, 2000)
  if (check.destinationFactKey !== transition.destinationFactKey || check.arrivalFactKey !== transition.arrivalFactKey
    || check.playerEventSequence !== transition.playerEventSequence || typeof check.passed !== 'boolean') fail('转场审查未绑定本次授权和到达')
}
