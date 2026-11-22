import { describe, expect, it } from 'vitest'
import {
  promptTemplateMatchesWork,
  resolveNovelPromptMode,
} from '../../src/lib/ai/prompt-variable-bindings'
import { LONGFORM_STEPS } from '../../src/components/longform/navigation'
import type { PromptTemplate, Work } from '../../src/lib/types'

function work(overrides: Partial<Work> = {}): Work {
  return {
    id: 1, projectId: 1, worldId: 1,
    code: 'WORK-00000000-0000-4000-8000-000000000001',
    kind: 'novel', novelProfile: 'long', title: 'Profile Prompt',
    description: '', genres: ['other'], status: 'drafting',
    targetWordCount: 100_000, currentWordCount: 0,
    includeCultivationProgressInAI: false,
    activeCharacterDrivenPlanId: null, activeNarrativeModuleId: null,
    postAdoptionPolicy: 'suggest',
    postAdoptionTaskTypes: ['organization', 'memory', 'retrieval', 'consistency'],
    postAdoptionBudget: {
      maxModelCalls: 2, maxInputTokens: 48_000, maxOutputTokens: 16_000,
      maxCostUsd: 0.25, allowUnknownCost: false,
    },
    createdAt: 1, updatedAt: 1,
    ...overrides,
  }
}

describe('长篇 Prompt 与节点模板边界', () => {
  it('长篇仍提供完整的设定、正文和辅助模块', () => {
    const modules = LONGFORM_STEPS.flatMap(step => step.modules.map(([id]) => id))
    for (const id of ['world-overview', 'state-table', 'info', 'outline', 'chapters-list']) expect(modules).toContain(id)
  })

  it('长篇 Work Profile 优先于字数推导，缺少当前分类的 Work 被拒绝', () => {
    expect(resolveNovelPromptMode(work({ novelProfile: 'long', targetWordCount: 10_000 }))).toBe('long')
    expect(() => resolveNovelPromptMode(work({ kind: undefined as never, novelProfile: undefined as never })))
      .toThrow('缺少当前类型或流程配置')
    expect(() => resolveNovelPromptMode(work({ kind: 'comic', novelProfile: null }))).toThrow('非小说')
  })

  it('非小说 Work 无法匹配小说模板', () => {
    const template = {
      name: '短篇模板',
      applicability: { lengthModes: ['short'] },
    } as PromptTemplate
    expect(promptTemplateMatchesWork(template, work({ kind: 'screenplay', novelProfile: null }))).toBe(false)
  })

})
