
import { isSha256Hash } from '../product-production/hash';
import type { ChatSourceTextRangeV1 } from '../../types/character-interaction';

export interface ChatSourceFragmentV1 {
  fragmentKey: string
  resourceKey: string
  /** JSON pointer into the full, immutable semantic resource, not its summary. */
  pointer: string
  valueJson: string
  textRange?: ChatSourceTextRangeV1
}

export interface ChatSourceClassificationV1 {
  projectionHash: string
  fragmentKey: string
  purpose: 'identity' | 'motivation' | 'voice' | 'knowledge'
  visibility: 'public' | 'participants' | 'author-only' | 'unclassified' | 'discoverable'
  /** Portable character resource keys or the explicit player viewpoint. */
  audienceKeys: string[]
  /** Explicit S2 authorization, separate from initial knowledge and author-only exclusion. */
  discovery?: {actorKeys: string[]; condition: string; prerequisiteFragmentKeys: string[]}
}

/** Author-owned decision saved in S2, then frozen with the authorized Brief. */
export interface ChatSourceReviewV1 {
  projectionHash: string
  classifications: ChatSourceClassificationV1[]
}

export function parseChatSourceReviewV1(value: unknown): ChatSourceReviewV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('来源确认必须是对象')
  const row = value as Record<string, unknown>
  if (Object.keys(row).sort().join(',') !== 'classifications,projectionHash') fail('来源确认字段无效')
  requireHash(row.projectionHash, '来源确认')
  if (!Array.isArray(row.classifications) || row.classifications.length > 2000) fail('来源分类数量无效')
  const seen = new Set<string>()
  for (const item of row.classifications) {
    if (!item || typeof item !== 'object'
      || Object.keys(item).sort().join(',') !== (Object.prototype.hasOwnProperty.call(item, 'discovery') ? 'audienceKeys,discovery,fragmentKey,projectionHash,purpose,visibility' : 'audienceKeys,fragmentKey,projectionHash,purpose,visibility')
      || item.projectionHash !== row.projectionHash
      || typeof item.fragmentKey !== 'string' || !item.fragmentKey || item.fragmentKey.length > 1000
      || seen.has(item.fragmentKey)
      || !['identity', 'motivation', 'voice', 'knowledge'].includes(item.purpose)
      || !['public', 'participants', 'author-only', 'unclassified', 'discoverable'].includes(item.visibility)
      || !Array.isArray(item.audienceKeys) || item.audienceKeys.length > 9
      || item.audienceKeys.some((key: unknown) => typeof key !== 'string' || !key || key.length > 500)
      || new Set(item.audienceKeys).size !== item.audienceKeys.length
      || (item.visibility === 'participants' ? !item.audienceKeys.length : !!item.audienceKeys.length)) {
      fail('来源分类字段、版本或接收者无效')
    }
    seen.add(item.fragmentKey)
    if (item.visibility === 'discoverable' && !item.discovery) fail('可发现隐情必须明确允许角色与发现条件')
    if (Object.prototype.hasOwnProperty.call(item, 'discovery')) {
      const rule = item.discovery
      if (!['discoverable', 'participants'].includes(item.visibility) || item.purpose !== 'knowledge'
        || !rule || typeof rule !== 'object' || Object.keys(rule).sort().join(',') !== 'actorKeys,condition,prerequisiteFragmentKeys'
        || typeof rule.condition !== 'string' || !rule.condition.trim() || rule.condition.length > 2000
        || !Array.isArray(rule.actorKeys) || !rule.actorKeys.length || rule.actorKeys.length > 8
        || rule.actorKeys.some((key: unknown) => typeof key !== 'string' || !key || key === 'player' || key.length > 500 || item.audienceKeys.includes(key))
        || new Set(rule.actorKeys).size !== rule.actorKeys.length
        || !Array.isArray(rule.prerequisiteFragmentKeys) || !rule.prerequisiteFragmentKeys.length || rule.prerequisiteFragmentKeys.length > 200
        || rule.prerequisiteFragmentKeys.some((key: unknown) => typeof key !== 'string' || !key || key === item.fragmentKey || key.length > 1000)
        || new Set(rule.prerequisiteFragmentKeys).size !== rule.prerequisiteFragmentKeys.length) fail('隐情发现授权字段、用途或范围无效')
    }
  }
  return structuredClone(value) as ChatSourceReviewV1
}

function fail(message: string): never {
  throw new Error(`[chat-source-projection] ${message}`)
}

function requireHash(value: unknown, label: string): asserts value is string {
  if (!isSha256Hash(value)) fail(`${label} 缺少合法 hash`)
}
