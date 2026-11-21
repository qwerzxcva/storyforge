import type { CharacterInteractionRuntimeState } from '../../types/index';
import type { ChatActorSituationRequestV1, ChatNarrativeActionV1 } from '../../types/chat-narrative';
import { isChatMessageRetrievableV1 } from './narrative-retrieval';
function fail(message: string): never {throw new Error(`[chat-inquiry-settlement] ${message}`)}

export function assertChatInquiryRespondentReferenceV1(value: Record<string, unknown>): void {
  if (typeof value.respondentFactKey !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value.respondentFactKey)
    || typeof value.respondentName !== 'string' || !value.respondentName.trim() || value.respondentName.length > 200
    || typeof value.respondentExcerpt !== 'string' || !value.respondentExcerpt.trim() || value.respondentExcerpt.length > 2000
    || !value.respondentExcerpt.includes(value.respondentName)) fail('询问对象必须有明确姓名及逐字人物依据')
}

type CompletedRequest = Extract<ChatActorSituationRequestV1, {purpose: 'inquiry-result'}>
function assertRespondent(state: CharacterInteractionRuntimeState, request: CompletedRequest, actorKey: string, at: number) {
  assertChatInquiryRespondentReferenceV1(request)
  const story = state.chatNarrative!, fact = story.situation.facts.find(f => f.factKey === request.respondentFactKey)
  if (story.permissions.allowInquiryResults !== true || story.permissions.allowActorSituationExpansion !== true
    || !story.permissions.allowedNewFactKinds.includes('observation') || story.permissions.maxNewFactsPerAction < 1) fail('作品未授权询问结果')
  if (!fact || !fact.audienceKeys.includes(actorKey) || fact.sourceEventSequence !== 0 && fact.sourceEventSequence >= at
    || !request.evidenceFactKeys.includes(fact.factKey) || !fact.text.includes(request.respondentExcerpt)) fail('询问对象须来自提问前已知且实际引用的原事实')
  if ([state.playerKey, story.persona.name].includes(request.respondentName)
    || state.profiles.some(p => p.name === request.respondentName || p.participantKey === request.respondentName)) fail('询问结算不能代替玩家或可调度角色回答')
}

/** Marks only an actual question in this candidate. Whether it is a question,
 * whether the person is present, and what they know require independent review. */
export function assertChatInquirySettlementActionV1(state: CharacterInteractionRuntimeState, action: ChatNarrativeActionV1, actorKey: string, at: number): void {
  const request = action.situationRequest
  if (request?.purpose !== 'inquiry-result') return
  if (!['speak', 'complete'].includes(action.kind) || action.waitingForPlayer || !action.text.includes(request.evidenceExcerpt)) fail('询问结算必须绑定本次已经问出的原话且不等待玩家决定')
  assertRespondent(state, request, actorKey, at)
}

/** Validate persisted identity without inferring an answer or rewriting history. */
export function assertChatInquirySettlementSourcesV1(state: CharacterInteractionRuntimeState): void {
  const pending = state.chatNarrative?.pendingSituation
  if (pending?.purpose !== 'inquiry-result') return
  const question = state.messages.find(m => m.eventSequence === pending.sourceEventSequence && m.role === 'character' && m.speakerKey === pending.actorKey)
  if (!question || !question.text.includes(pending.evidenceExcerpt)) fail('待询问结果缺少同一已提交问题原文')
  if (state.chatNarrative!.inquiryHistory?.some(r => r.questionSequence === pending.sourceEventSequence)) fail('已回答问题不能保留待结算标记')
  assertRespondent(state, pending, pending.actorKey, pending.sourceEventSequence)
}

/** The current marker has exactly one question and one respondent. Known-at-
 * question evidence is valid only while no later action or knowledge result
 * has changed that projection. No language heuristic grants this authority. */
export function chatInquirySettlementContextV1(state: CharacterInteractionRuntimeState) {
  const story = state.chatNarrative, pending = story?.pendingSituation, scene = state.activeScene
  if (!story || pending?.purpose !== 'inquiry-result' || !scene) return null
  assertChatInquirySettlementSourcesV1(state)
  const question = state.messages.find(m => m.eventSequence === pending.sourceEventSequence && m.role === 'character' && m.speakerKey === pending.actorKey)!
  if (!scene.activeParticipantKeys.includes(pending.actorKey) || question.eventSequence < scene.startedAtSequence
    || question.supersededBySequence != null || !isChatMessageRetrievableV1(state, question)
    || story.triggers.some(t => t.actionSequences.some(at => at > question.eventSequence))
    || story.discoveryHistory?.some(d => d.discoverySequence > question.eventSequence)
    || story.inquiryHistory?.some(i => i.resultSequence > question.eventSequence)
    || state.messages.some(m => m.eventSequence > question.eventSequence && (m.supersededBySequence != null || !isChatMessageRetrievableV1(state, m)))) return null
  const known = new Set(story.situation.facts.filter(f => f.audienceKeys.includes(pending.actorKey)
    && (f.sourceEventSequence === 0 || f.sourceEventSequence < question.eventSequence)).map(f => f.factKey))
  return {schema: 'storyforge.chat-inquiry-evidence', version: 5 as const, actorKey: pending.actorKey, requestSequence: question.eventSequence,
    dialogueMessageIds: state.messages.filter(m => m.eventSequence >= question.eventSequence).map(m => m.messageId),
    questions: [{messageId: question.messageId, questionSequence: question.eventSequence,
      questionEvidenceFactKeys: pending.evidenceFactKeys.filter(key => known.has(key)), respondentEvidenceFactKeys: [pending.respondentFactKey],
      targets: story.permissions.maxDiscoveriesPerSituation ? story.situation.facts.filter(f => !f.audienceKeys.includes(pending.actorKey)
        && f.discovery?.sceneKey === scene.sceneKey && f.discovery.actorKeys.includes(pending.actorKey)
        && f.discovery.prerequisiteFactKeys.every(key => known.has(key)))
        .map(f => ({factKey: f.factKey, requiredEvidenceFactKeys: [...f.discovery!.prerequisiteFactKeys]})) : []}],
  }
}
