import { canonicalStringify } from '../../agent/run/hash';
import { isSha256Hash } from '../product-production/hash';
import { parseChatSourceReviewV1, type ChatSourceReviewV1 } from './source-projection';

export const CHAT_ROLE_TRAIT_LABELS = {
  identity: '身份理解', value: '价值观', goal: '长期期望（不是已完成的行动）',
  concern: '顾虑', boundary: '行为底线', voice: '语言与举止',
} as const
export interface ChatRoleProfileCandidateV1 {
  traits: Array<{kind: keyof typeof CHAT_ROLE_TRAIT_LABELS; text: string; evidence: Array<{fragmentKey: string; quote: string}>}>
}
/** Product-owned interpretation. Original world prose and permissions remain authoritative. */
export interface ChatRoleProfileV1 {
  actorKey: string
  projectionHash: string
  /** Includes every passage read by the generator, not merely the passages it cites. */
  sourceFragments: Array<{fragmentKey: string; sourceHash: string}>
  /** System-captured author decisions, never sent to the role-profile generator. */
  sourceReview: ChatSourceReviewV1
  candidate: ChatRoleProfileCandidateV1
}
export interface ChatRoleProfileSetV1 {
  schema: 'storyforge.chat-role-profiles'
  version: 1
  profiles: ChatRoleProfileV1[]
}
function fail(message: string): never {throw new Error(`角色整理无效：${message}`)}
function record(value: unknown, keys: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.split(',').sort().join(',')) fail('字段不在允许范围')
}
function text(value: unknown, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('文本为空或超过容量')
}

export function parseChatRoleProfileCandidateV1(value: unknown): ChatRoleProfileCandidateV1 {
  record(value, 'traits')
  if (!Array.isArray(value.traits) || !value.traits.length || value.traits.length > 12) fail('每位角色需要1至12项有来源的整理')
  let characters = 0
  const unique = new Set<string>()
  for (const trait of value.traits) {
    record(trait, 'kind,text,evidence')
    if (typeof trait.kind !== 'string' || !Object.prototype.hasOwnProperty.call(CHAT_ROLE_TRAIT_LABELS, trait.kind)) fail('人物整理类别无效')
    text(trait.text, 600); characters += trait.text.length
    const key = `${trait.kind}:${trait.text.trim()}`
    if (unique.has(key)) fail('人物整理重复')
    unique.add(key)
    if (!Array.isArray(trait.evidence) || !trait.evidence.length || trait.evidence.length > 4) fail('每项需要1至4条原文依据')
    const evidenceKeys = new Set<string>()
    for (const evidence of trait.evidence) {
      record(evidence, 'fragmentKey,quote'); text(evidence.fragmentKey, 1000); text(evidence.quote, 800)
      const evidenceKey = canonicalStringify(evidence)
      if (evidenceKeys.has(evidenceKey)) fail('原文依据重复')
      evidenceKeys.add(evidenceKey)
    }
  }
  if (characters > 3000) fail('人物整理正文合计最多3000字符，请压缩后再确认')
  return structuredClone(value) as unknown as ChatRoleProfileCandidateV1
}

export function parseChatRoleProfileSetV1(value: unknown): ChatRoleProfileSetV1 {
  record(value, 'schema,version,profiles')
  if (value.schema !== 'storyforge.chat-role-profiles' || value.version !== 1 || !Array.isArray(value.profiles) || value.profiles.length > 8) fail('人物整理版本或数量无效')
  const actors = new Set<string>()
  for (const profile of value.profiles) {
    record(profile, 'actorKey,projectionHash,sourceFragments,sourceReview,candidate')
    text(profile.actorKey, 500)
    if (actors.has(profile.actorKey) || !isSha256Hash(profile.projectionHash)) fail('角色或来源证据无效')
    actors.add(profile.actorKey)
    if (!Array.isArray(profile.sourceFragments) || !profile.sourceFragments.length || profile.sourceFragments.length > 12) fail('须保留本次全部输入片段')
    const keys = new Set<string>()
    for (const source of profile.sourceFragments) {
      record(source, 'fragmentKey,sourceHash'); text(source.fragmentKey, 1000)
      if (keys.has(source.fragmentKey) || !isSha256Hash(source.sourceHash)) fail('输入片段证据重复或无效')
      keys.add(source.fragmentKey)
    }
    const review = parseChatSourceReviewV1(profile.sourceReview)
    if (review.projectionHash !== profile.projectionHash || review.classifications.length !== keys.size || review.classifications.some(row => !keys.has(row.fragmentKey))) fail('资料确认与输入片段不一致')
    const candidate = parseChatRoleProfileCandidateV1(profile.candidate)
    if (candidate.traits.some(trait => trait.evidence.some(evidence => !keys.has(evidence.fragmentKey)))
      || review.classifications.some(row => row.visibility !== 'public' && !(row.visibility === 'participants' && row.audienceKeys.includes(profile.actorKey as string)))) fail('人物整理包含未获准的引用或知情范围')
  }
  return structuredClone(value) as unknown as ChatRoleProfileSetV1
}
