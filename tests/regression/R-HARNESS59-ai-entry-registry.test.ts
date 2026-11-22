import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FORMAL_AI_ENTRY_REGISTRY_V1,
  assertFormalAIEntryCallV1,
  parseFormalAIEntryRegistryV1,
  freezeFormalAIEntryBindingV1,
  assertFormalAIEntrySnapshotIntegrityV1,
  executeFrozenFormalImagePreviewV1,
} from '../../src/lib/agent/formal-ai-entry'
import { getAgentSkillV1 } from '../../src/lib/agent/skill-registry'

interface Entry {
  entryId: string
  skillId: string
  entryKind: 'formal' | 'auxiliary' | 'evaluation' | 'experimental'
  adoptAllowed: boolean
  adoptionTargets?: string[]
  allowedCallers: string[]
}

const registry = JSON.parse(readFileSync('src/lib/agent/ai-entry-registry.json', 'utf8')) as {
  version: number
  entries: Entry[]
}

describe('R-HARNESS59 / WEH-0H · 正式 AI 入口机器绑定', () => {
  it('临时地图图片入口绑定冻结 caller，拒绝采纳、错误入口和取消，不改旧文本绑定', async () => {
    const entry = await freezeFormalAIEntryBindingV1('world.map.paint-preview')
    const skill = getAgentSkillV1('world-origin.map-config')
    const caller = 'src/lib/world-map/atlas/paint-preview.ts'
    const meta = { category: 'geography.world-map-paint' }
    let calls = 0
    const invoke = async () => { calls++; return 'image-bytes' }
    expect(await assertFormalAIEntrySnapshotIntegrityV1(entry)).toMatchObject({ outputModality: 'image', executionBoundary: 'authoring-draft', adoptAllowed: false })
    await expect(executeFrozenFormalImagePreviewV1('world.map.paint-preview', entry, skill, 'other.ts', invoke, meta)).rejects.toThrow(/caller/)
    await expect(executeFrozenFormalImagePreviewV1('world.map.paint-preview', entry, skill, caller, invoke, { category: 'other' })).rejects.toThrow()
    const controller = new AbortController(); controller.abort()
    await expect(executeFrozenFormalImagePreviewV1('world.map.paint-preview', entry, skill, caller, invoke, meta, controller.signal)).rejects.toThrow()
    expect(calls).toBe(0)
    expect(await executeFrozenFormalImagePreviewV1('world.map.paint-preview', entry, skill, caller, invoke, meta)).toBe('image-bytes')
    expect(calls).toBe(1)
    for (const patch of [{ adoptAllowed: true }, { executionBoundary: 'durable-run' }, { entryKind: 'formal' }]) {
      const value = structuredClone(registry)
      Object.assign(value.entries.find(row => row.entryId === 'world.map.paint-preview')!, patch)
      expect(() => parseFormalAIEntryRegistryV1(value)).toThrow()
    }
  })
  it('AST 守卫证明实际 member/alias/wrapper 调用均携带登记 entryId', () => {
    const output = execFileSync(process.execPath, ['scripts/check-ai-entry-registry.mjs'], { encoding: 'utf8' })
    // H17 compression and generation share a governed dispatch site.
    // SFQA-022/044 added the two governed import candidate entries and the
    // auxiliary private reference analysis entry; every registry row still has
    // one real AST binding, so the counts move with them.
    expect(output).toContain('42 bindings / 48 calls')
    expect(output).toContain('formal 20, auxiliary 16, evaluation 5, experimental 1')
  })

  it('唯一注册表严格解析且每项连接 Skill、执行器、候选和调用方', () => {
    expect(registry.version).toBe(2)
    expect(FORMAL_AI_ENTRY_REGISTRY_V1.entries).toHaveLength(42)
    for (const retiredId of ['world.setting.lookup.qa', 'world.setting.lookup.extract']) {
      expect(FORMAL_AI_ENTRY_REGISTRY_V1.entries.some(entry => entry.entryId === retiredId)).toBe(false)
    }
    for (const entry of FORMAL_AI_ENTRY_REGISTRY_V1.entries) {
      expect(entry.skillId).not.toBe('')
      expect(entry.runContractBuilderId).not.toBe('')
      expect(entry.candidateKind).not.toBe('')
      expect(entry.allowedCallers.length).toBeGreaterThan(0)
    }
  })

  it('文档导入分块解析的两个正式入口只产出候选，私域参考入口与普通导入分开登记', () => {
    for (const entryId of ['import.document-chunk.parse', 'import.reference-chunk.parse.private']) {
      expect(FORMAL_AI_ENTRY_REGISTRY_V1.entries.find(entry => entry.entryId === entryId)).toMatchObject({
        skillId: 'inspiration.document-import-parse', categories: ['import.parse-chunk'],
        runContractBuilderId: 'document-import-chunk-durable', executionBoundary: 'durable-run',
        entryKind: 'formal', candidateKind: 'document-import-chunk-candidate', adoptAllowed: false,
        adoptionTargets: [], allowedCallers: ['src/lib/import/document-parse-durable.ts'],
      })
    }
    expect(() => assertFormalAIEntryCallV1({ formalEntryId: 'import.document-chunk.parse', category: 'chapter.content' })).toThrow(/不允许 category/)
  })

  it('辅助、评测和实验入口由机器权限证明不可采纳', () => {
    const nonFormal = registry.entries.filter(entry => entry.entryKind !== 'formal')
    expect(nonFormal.length).toBeGreaterThan(0)
    expect(nonFormal.every(entry => entry.adoptAllowed === false)).toBe(true)
    expect(nonFormal.every(entry => (entry.adoptionTargets?.length ?? 0) === 0)).toBe(true)
  })

  it('unknown entry 和错配 category 在发起 provider 请求前 fail closed', () => {
    expect(() => assertFormalAIEntryCallV1({
      formalEntryId: 'unknown.entry',
      category: 'chapter.content',
    })).toThrow(/未登记正式 AI 入口/)
    expect(() => assertFormalAIEntryCallV1({
      formalEntryId: 'prose.chapter.generate',
      category: 'chapter.continue',
    })).toThrow(/不允许 category/)
  })

  it('离线评测只作有限登记，不获得正式执行或采纳权限，旧注册表保持兼容', () => {
    const full = JSON.parse(JSON.stringify(registry))
    expect(() => parseFormalAIEntryRegistryV1(full)).not.toThrow()
    const entryId = full.offlineEvaluations[0].entryId
    expect(FORMAL_AI_ENTRY_REGISTRY_V1.entries.some(entry => entry.entryId === entryId)).toBe(false)
    expect(() => assertFormalAIEntryCallV1({ formalEntryId: entryId, category: 'chapter.content' })).toThrow(/未登记正式/)
    delete full.offlineEvaluations
    expect(parseFormalAIEntryRegistryV1(full).entries).toEqual(FORMAL_AI_ENTRY_REGISTRY_V1.entries)
    for (const patch of [{ adoptAllowed: true }, { adoptionTargets: ['chapters'] }, { boundary: 'durable-run' },
      { caller: 'src/lib/agent/formal-ai-entry.ts' }, { transport: 'openai' }, { contract: '../escape.mjs' }]) {
      const invalid = JSON.parse(JSON.stringify(registry))
      Object.assign(invalid.offlineEvaluations[0], patch)
      expect(() => parseFormalAIEntryRegistryV1(invalid)).toThrow(/离线评测/)
    }
    const duplicate = JSON.parse(JSON.stringify(registry))
    duplicate.offlineEvaluations.push(duplicate.offlineEvaluations[0])
    expect(() => parseFormalAIEntryRegistryV1(duplicate)).toThrow(/重复/)
  })

  it('删除 Skill 绑定、非法开放辅助采纳和未知 schema 字段均被拒绝', () => {
    const base = JSON.parse(JSON.stringify(registry)) as typeof registry
    const unknownSkill = JSON.parse(JSON.stringify(base)) as typeof registry
    unknownSkill.entries[0].skillId = 'missing.skill'
    expect(() => parseFormalAIEntryRegistryV1(unknownSkill)).toThrow(/未知 Skill/)

    const auxiliaryWrite = JSON.parse(JSON.stringify(base)) as typeof registry
    const auxiliary = auxiliaryWrite.entries.find(entry => entry.entryKind === 'auxiliary')!
    auxiliary.adoptAllowed = true
    auxiliary.adoptionTargets = ['chapters']
    expect(() => parseFormalAIEntryRegistryV1(auxiliaryWrite)).toThrow(/不得开放采纳/)

    const unknownField = JSON.parse(JSON.stringify(base)) as typeof registry & { surprise?: boolean }
    unknownField.surprise = true
    expect(() => parseFormalAIEntryRegistryV1(unknownField)).toThrow(/未知或缺失字段/)
  })

  it('正式写入口的 adoptionTargets 与 Skill 写集合机验一致', () => {
    const writable = FORMAL_AI_ENTRY_REGISTRY_V1.entries.filter(entry => entry.adoptAllowed)
    expect(writable.map(entry => entry.entryId)).toEqual(expect.arrayContaining([
      'prose.chapter.generate',
      'outline.volume.generate',
      'outline.detail.scene',
    ]))
    expect(writable.every(entry => entry.adoptionTargets.length > 0)).toBe(true)
  })
})
