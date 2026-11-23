import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { db, StoryForgeDB, STORYFORGE_STORES, STORYFORGE_STORES_V11, STORYFORGE_SCHEMA_VERSION } from '../../src/lib/db/schema'
import { PROJECT_TABLES } from '../../src/lib/registry/project-tables'
import { openCurrentSchema } from '../../src/lib/db/ensure-schema'
import { createWorkspace } from '../../src/lib/workspace/create-workspace'
import { exportProjectJSON, importProjectJSON } from '../../src/lib/export/json-export'
import { CURRENT_BACKUP_VERSION, inspectProjectBackup, normalizeProjectBackup } from '../../src/lib/export/backup-trust'
import { buildAvgAssemblyPlanV1 } from '../../src/lib/legacy-compat/avg/assembly-plan'
import { parseProductProductionPlanV3 } from '../../src/lib/legacy-compat/product-production/plan'
import { parseProductProductionPortableTaskLedgerV1 } from '../../src/lib/legacy-compat/product-production/task-evidence'

afterEach(() => db.close())

describe('TTRPG/NW integration · preserve independent owners through version collisions', () => {
  it.each(['v11', 'ttrpg-v12', 'world-v12'] as const)('%s upgrades without rewriting any existing records', async profile => {
    const name = `ttrpg-nw-migration-${profile}-${crypto.randomUUID()}`
    const oldStores = { ...STORYFORGE_STORES_V11,
      ...(profile === 'ttrpg-v12' ? { ttrpgNarrativeMemories: STORYFORGE_STORES.ttrpgNarrativeMemories } : {}),
      ...(profile === 'world-v12' ? { worldNarrativeIndexCaches: STORYFORGE_STORES.worldNarrativeIndexCaches } : {}) }
    const old = new Dexie(name), next = new StoryForgeDB(name)
    try {
      old.version(profile === 'v11' ? 11 : 12).stores(oldStores)
      await old.open()
      const rows: Record<string, Record<string, unknown>> = {
        works: { id: 1, projectId: 1, worldId: 1, title: '保持作者原稿', kind: 'ttrpg', original: '{"bytes":true}' },
        worldReleases: { id: 1, projectId: 1, worldId: 1, contentHash: 'frozen', contentJson: '{"world":true}' },
        extensionRecords: { id: 1, projectId: 1, profileId: 1, generation: 1, key: 'original', payload: { text: '不执行插件' } },
      }
      if (profile === 'ttrpg-v12') rows.ttrpgNarrativeMemories = { id: 1, projectId: 1, sessionId: 1, revisionKey: 'original', summary: '原团局记忆' }
      if (profile === 'world-v12') rows.worldNarrativeIndexCaches = { id: 1, projectId: 1, worldId: 1, releaseId: 1, indexJson: '{"original":true}', lastAccessedAt: 1 }
      for (const [table, row] of Object.entries(rows)) await old.table(table).add(structuredClone(row))
      old.close()
      await next.open()
      expect(next.verno).toBe(STORYFORGE_SCHEMA_VERSION)
      for (const [table, row] of Object.entries(rows)) expect(await next.table(table).get(1)).toEqual(row)
      expect(await next.ttrpgNarrativeMemories.count()).toBe(profile === 'ttrpg-v12' ? 1 : 0)
      expect(await next.worldNarrativeIndexCaches.count()).toBe(profile === 'world-v12' ? 1 : 0)
    } finally { old.close(); next.close(); await Dexie.delete(name) }
  })

  it('refuses a future native database version without rewriting its records', async () => {
    db.close(); await db.delete()
    const future = new Dexie(db.name)
    try {
      future.version(STORYFORGE_SCHEMA_VERSION + 1).stores(STORYFORGE_STORES)
      await future.open()
      const row = { id: 1, title: '未来版本保持原样' }
      await future.table('works').add(row)
      future.close()
      await expect(openCurrentSchema()).rejects.toThrow(`只支持当前 schema v${STORYFORGE_SCHEMA_VERSION}`)
      await future.open()
      expect(await future.table('works').get(1)).toEqual(row)
    } finally { db.close(); future.close(); await Dexie.delete(db.name) }
  })

  it.each(['world-v16', 'ttrpg-v16'] as const)('%s restores through the explicit converter and retains its input', async profile => {
    await db.delete(); await db.open()
    const created = await createWorkspace({ name: '旧格式保留', genres: [], status: 'drafting', description: '', targetWordCount: 0 },
      { purpose: 'independent-work', kind: 'novel', novelProfile: 'long' })
    const backup = await exportProjectJSON(created.scope.projectId)
    const legacy = { ...structuredClone(backup), version: 16 } as Record<string, unknown> & { version: number }
    // Both v16 branches predate source receipts. Only the TTRPG branch carries native memories.
    for (const spec of PROJECT_TABLES.filter(spec => spec.exportable && (spec.introducedBackupVersion ?? 1) > 16)) {
      delete legacy[spec.name]
    }
    if (profile === 'world-v16') delete legacy.ttrpgNarrativeMemories
    const original = JSON.stringify(legacy)
    expect(inspectProjectBackup(legacy).valid).toBe(true)
    const normalized = normalizeProjectBackup(legacy)
    expect(normalized.version).toBe(CURRENT_BACKUP_VERSION)
    expect(normalized.ttrpgNarrativeMemories).toEqual([])
    expect(JSON.stringify(legacy)).toBe(original)
    const restored = await importProjectJSON(legacy as never)
    expect((await db.works.where('projectId').equals(restored).toArray()).map(row => row.title)).toEqual(
      (await db.works.where('projectId').equals(created.scope.projectId).toArray()).map(row => row.title))
  })

  it('retains exact compatibility parsing for a frozen product plan and portable task ledger', async () => {
    const hash = 'a'.repeat(64)
    const plan = buildAvgAssemblyPlanV1({ brief: { avgAssembly: {
      schema: 'storyforge.avg.assembly-brief', version: 1, title: 'Legacy assembly',
      sceneKeys: ['scene-1'], mediaAssetKeys: [], basePackageHash: null,
    } }, briefHash: hash, buildNumber: 1, controlEpoch: 1 })
    const parsed = parseProductProductionPlanV3(JSON.stringify(plan), undefined, hash)
    expect(parsed).toEqual(plan)
    expect(() => parseProductProductionPlanV3('{')).toThrow(/Plan 不是合法 JSON/)
    const invalidPlans = [
      ['zero concurrency', (candidate: any) => { candidate.concurrency.maximumCostBearingTasks = 0 }, /concurrency 必须大于零/],
      ['missing terminal', (candidate: any) => { candidate.terminalTaskKey = 'missing' }, /terminalTaskKey 不存在/],
      ['duplicate task key', (candidate: any) => { candidate.tasks[1].taskKey = candidate.tasks[0].taskKey }, /taskKey 重复/],
      ['unknown dependency', (candidate: any) => {
        candidate.tasks[1].dependsOn = ['missing']
        candidate.tasks[1].requiredReceipts = [{ taskKey: 'missing', receiptHash: null }]
      }, /依赖无效/],
      ['self dependency', (candidate: any) => {
        const taskKey = candidate.tasks[0].taskKey
        candidate.tasks[0].dependsOn = [taskKey]
        candidate.tasks[0].requiredReceipts = [{ taskKey, receiptHash: null }]
      }, /依赖无效/],
      ['unpaired receipts', (candidate: any) => { candidate.tasks[1].requiredReceipts = [] }, /requiredReceipts 未闭合/],
      ['unowned input', (candidate: any) => { candidate.tasks[0].inputArtifactKeys = ['unowned'] }, /输入 Artifact 没有 owner/],
      ['duplicate output owner', (candidate: any) => { candidate.tasks[1].outputArtifactKeys = [candidate.tasks[0].outputArtifactKeys[0]] }, /有多个 owner/],
      ['fallback without task', (candidate: any) => { candidate.tasks[0].failurePolicy = 'fallback' }, /缺少 fallbackTaskKey/],
      ['deterministic skill', (candidate: any) => { candidate.tasks[0].skillId = 'skill.unexpected' }, /确定性任务不应绑定 skillId/],
      ['model without skill', (candidate: any) => { candidate.tasks[0].executionMode = 'model' }, /模型任务缺少 skillId/],
      ['unknown context profile', (candidate: any) => { candidate.tasks[0].contextProfile = 'unknown' }, /contextProfile 枚举无效/],
      ['unjoined task', (candidate: any) => { candidate.tasks.push({ ...structuredClone(candidate.tasks[0]), taskKey: 'orphan-task', outputArtifactKeys: [], inputArtifactKeys: [], dependsOn: [], requiredReceipts: [] }) }, /未进入 terminal join/],
    ] as const
    for (const [label, mutate, expected] of invalidPlans) {
      const candidate = structuredClone(plan)
      mutate(candidate)
      expect(() => parseProductProductionPlanV3(candidate), label).toThrow(expected)
    }
    expect(() => parseProductProductionPlanV3(plan, undefined, 'b'.repeat(64))).toThrow(/briefHash 不一致/)

    const tasks = Object.fromEntries(parsed.tasks.map(task => [task.taskKey, {
      runId: 1, attempt: 0, status: 'settled', idempotencyKey: hash, candidateHash: hash,
      terminalReceiptHash: hash, passedGateIds: [], usage: {
        modelCalls: 0, inputTokens: 0, outputTokens: 0, mediaCalls: 0,
        costUsd: 0, durationMs: 0, storageBytes: 0,
      }, errorCode: null,
    }]))
    const budgetLedgerJson = JSON.stringify({ schema: 'storyforge.product-production-budget-ledger', version: 2, tasks })
    const portable = parseProductProductionPortableTaskLedgerV1({ budgetLedgerJson, plan: parsed })
    expect(portable).toHaveLength(parsed.tasks.length)
    expect(portable[0]).not.toHaveProperty('runId')
    expect(() => parseProductProductionPortableTaskLedgerV1({ budgetLedgerJson: '{', plan: parsed }))
      .toThrow(/budget ledger JSON 损坏/)
    const duplicateGate = structuredClone(tasks)
    const firstTask = parsed.tasks[0].taskKey
    duplicateGate[firstTask].passedGateIds = ['gate.1', 'gate.1']
    expect(() => parseProductProductionPortableTaskLedgerV1({
      budgetLedgerJson: JSON.stringify({ schema: 'storyforge.product-production-budget-ledger', version: 2, tasks: duplicateGate }),
      plan: parsed,
    })).toThrow(/terminal ledger task 无效/)
    const missingTask = structuredClone(tasks)
    delete missingTask[parsed.tasks[0].taskKey]
    await expect(Promise.resolve().then(() => parseProductProductionPortableTaskLedgerV1({
      budgetLedgerJson: JSON.stringify({ schema: 'storyforge.product-production-budget-ledger', version: 2, tasks: missingTask }), plan: parsed,
    }))).rejects.toThrow(/未精确覆盖 Plan tasks/)
  })

  it('rejects missing current/core tables and malformed legacy memory instead of silently repairing them', async () => {
    await db.delete(); await db.open()
    const created = await createWorkspace({ name: '严格备份', genres: [], status: 'drafting', description: '', targetWordCount: 0 },
      { purpose: 'independent-work', kind: 'novel', novelProfile: 'long' })
    const backup = await exportProjectJSON(created.scope.projectId)
    const missing = { ...structuredClone(backup) } as Record<string, unknown>
    delete missing.ttrpgNarrativeMemories
    expect(inspectProjectBackup(missing).valid).toBe(false)
    for (const spec of PROJECT_TABLES.filter(spec => spec.exportable && (spec.introducedBackupVersion ?? 1) > 16)) {
      delete missing[spec.name]
    }
    const oldMissingCore = { ...missing, version: 16 }
    delete oldMissingCore.chapters
    expect(inspectProjectBackup(oldMissingCore).valid).toBe(false)
    expect(inspectProjectBackup(oldMissingCore).missingTables).toContain('chapters')
    const malformed = { ...missing, version: 16, ttrpgNarrativeMemories: {} }
    expect(inspectProjectBackup(malformed).valid).toBe(false)
    const before = await db.projects.count()
    await expect(importProjectJSON(malformed as never)).rejects.toThrow('备份预检失败')
    expect(await db.projects.count()).toBe(before)
  })
})
