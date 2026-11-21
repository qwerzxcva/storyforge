import type { ComicPagePlanCandidateV1, ComicReviewIssueCandidateV1, ComicScriptBeatCandidateV1 } from '../../types/index';

export const COMIC_SCRIPT_BEAT_KEYS_V1 = ['stableKey', 'sectionKey', 'chapterNumber', 'order', 'narrativeFunction', 'visualAction', 'dialogueIntent', 'emotion', 'causalFactKeys', 'decisionKeys', 'sourceUnitKeys', 'estimatedPanels'] as const
export const COMIC_PAGE_PLAN_KEYS_V1 = ['stableKey', 'chapterNumber', 'pageNumber', 'order', 'goal', 'beatKeys', 'endReveal', 'pageTurn', 'expectedPanelCount', 'textBudget'] as const
export const COMIC_REVIEW_ISSUE_KEYS_V1 = ['stableKey', 'category', 'severity', 'pageKey', 'panelKey', 'subjectKey', 'assetKey', 'evidence', 'problem', 'suggestion', 'sourceUnitKeys'] as const

const STABLE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/
const FUNCTIONS = ['establish', 'develop', 'reveal', 'reaction', 'turn', 'climax', 'resolution', 'transition']

function exact(value: unknown, keys: readonly string[], label: string): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`[comic-production] ${label} 必须是对象`)
  const actual = Object.keys(value)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) throw new Error(`[comic-production] ${label} 字段不在闭集`)
}

function text(value: unknown, label: string, max = 8_000, required = true): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`[comic-production] ${label} 非法`)
}

function key(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !STABLE.test(value)) throw new Error(`[comic-production] ${label} stableKey 非法`)
}

function keys(value: unknown, label: string, allowEmpty = false): asserts value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.length > 500 || new Set(value).size !== value.length || value.some(item => typeof item !== 'string' || !STABLE.test(item))) throw new Error(`[comic-production] ${label} 引用非法`)
}

export function assertComicScriptBeatCandidateV1(value: unknown): asserts value is ComicScriptBeatCandidateV1 {
  exact(value, COMIC_SCRIPT_BEAT_KEYS_V1, 'script beat')
  key(value.stableKey, 'script beat'); key(value.sectionKey, 'sectionKey')
  if (!Number.isInteger(value.chapterNumber) || value.chapterNumber < 1 || !Number.isInteger(value.order) || value.order < 0 || !Number.isInteger(value.estimatedPanels) || value.estimatedPanels < 1 || value.estimatedPanels > 30 || !FUNCTIONS.includes(value.narrativeFunction)) throw new Error('[comic-production] script beat 数值或叙事功能非法')
  text(value.visualAction, 'visualAction'); text(value.dialogueIntent, 'dialogueIntent', 4_000, false); text(value.emotion, 'emotion', 1_000)
  keys(value.causalFactKeys, 'causalFactKeys'); keys(value.decisionKeys, 'decisionKeys'); keys(value.sourceUnitKeys, 'sourceUnitKeys')
}

export function assertComicPagePlanCandidateV1(value: unknown): asserts value is ComicPagePlanCandidateV1 {
  exact(value, COMIC_PAGE_PLAN_KEYS_V1, 'page plan'); key(value.stableKey, 'page plan')
  if (!Number.isInteger(value.chapterNumber) || value.chapterNumber < 1 || !Number.isInteger(value.pageNumber) || value.pageNumber < 1 || !Number.isInteger(value.order) || value.order < 0 || !Number.isInteger(value.expectedPanelCount) || value.expectedPanelCount < 1 || value.expectedPanelCount > 9 || !Number.isInteger(value.textBudget) || value.textBudget < 0 || value.textBudget > 2_000 || !['none', 'setup', 'reveal-after-turn', 'cliffhanger'].includes(value.pageTurn)) throw new Error('[comic-production] page plan 数值或翻页策略非法')
  text(value.goal, 'page goal'); text(value.endReveal, 'end reveal', 4_000, false); keys(value.beatKeys, 'beatKeys')
}

export function assertComicReviewIssueCandidateV1(value: unknown): asserts value is ComicReviewIssueCandidateV1 {
  exact(value, COMIC_REVIEW_ISSUE_KEYS_V1, 'review issue'); key(value.stableKey, 'review issue'); key(value.pageKey, 'pageKey')
  for (const field of ['panelKey', 'subjectKey', 'assetKey'] as const) if (value[field] != null) key(value[field], field)
  if (!['narrative', 'reading-order', 'lettering', 'continuity', 'rights', 'media-integrity'].includes(value.category) || !['critical', 'major', 'minor'].includes(value.severity)) throw new Error('[comic-production] review issue 分类非法')
  text(value.evidence, 'evidence'); text(value.problem, 'problem'); text(value.suggestion, 'suggestion'); keys(value.sourceUnitKeys, 'sourceUnitKeys', true)
}
