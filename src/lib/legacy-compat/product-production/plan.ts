import { sumProductTaskBudgetReservationsV1 } from './task-budget-totals';
import type { ProductProductionBriefV3, ProductProductionPlanTaskV3, ProductProductionPlanV3, ProductTaskBudgetReservationV1 } from '../../types/index';
import { buildAvgNativeAssemblyPlan } from '../avg/assembly-plan';
import { AVG_VISUAL_REQUIREMENTS_ARTIFACT_V4, buildAvgVisualPlanningPlanV4 } from '../avg/visual-planning-plan';
import { buildAvgVisualPlanningPlanV5 } from '../avg/visual-planning-plan-v5';
import { buildAvgSoundProductionPlan } from '../avg/sound-production-plan';
import { assertAvgAudioProcessingTaskShapeV1 } from '../avg/audio-production-topology';
import { PRODUCTION_PRODUCT_KINDS_V1 } from '../../types/index';
import { parseTextAdventureContentRevisionV1, parseProductProductionBriefV3 } from './contracts';
import { buildTtrpgOpenProductionPlanV3 } from '../ttrpg/open-production-plan';
import { TTRPG_OPEN_PRODUCTION_SKILL_IDS_V1, type TtrpgOpenProductionTaskKeyV2 } from '../ttrpg/open-production-bindings';
import { canonicalProductProductionJsonV2, isSha256Hash } from './hash';

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
const LANES = ['planning', 'content', 'visual', 'audio', 'integration', 'qa'] as const
const EXECUTION_MODES = ['deterministic', 'model', 'media-provider', 'human-import'] as const
const FAILURE_POLICIES = ['fail-build', 'pause', 'fallback', 'skip-optional'] as const

function fail(message: string): never { throw new Error(`[product-production-plan] ${message}`) }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
  return value as Record<string, unknown>
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    fail(`${label} 字段不精确:${actual.join(',')}`)
  }
}
function key(value: unknown, label: string): string {
  if (typeof value !== 'string' || !STABLE_KEY.test(value)) fail(`${label} 不是稳定 key`)
  return value
}
function integer(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > maximum) fail(`${label} 必须是有界非负整数`)
  return Number(value)
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(`${label} 枚举无效`)
  return value as T
}
function keys(value: unknown, label: string, maximum = 1_000): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} 必须是有界数组`)
  const parsed = value.map((item, index) => key(item, `${label}[${index}]`))
  if (new Set(parsed).size !== parsed.length) fail(`${label} 不允许重复`)
  return parsed
}
function nullableCost(value: unknown, label: string): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) fail(`${label} 无效`)
  return value
}

function parseBudget(value: unknown, label: string): ProductTaskBudgetReservationV1 {
  const row = record(value, label)
  exactKeys(row, ['modelCalls', 'inputTokens', 'outputTokens', 'mediaCalls', 'maximumCostUsd', 'durationMs', 'storageBytes'], label)
  return {
    modelCalls: integer(row.modelCalls, `${label}.modelCalls`, 100_000),
    inputTokens: integer(row.inputTokens, `${label}.inputTokens`, 1_000_000_000),
    outputTokens: integer(row.outputTokens, `${label}.outputTokens`, 1_000_000_000),
    mediaCalls: integer(row.mediaCalls, `${label}.mediaCalls`, 100_000),
    maximumCostUsd: nullableCost(row.maximumCostUsd, `${label}.maximumCostUsd`),
    durationMs: integer(row.durationMs, `${label}.durationMs`, 31_536_000_000),
    storageBytes: integer(row.storageBytes, `${label}.storageBytes`, 1_000_000_000_000),
  }
}

function parseTask(value: unknown, index: number): ProductProductionPlanTaskV3 {
  const label = `tasks[${index}]`
  const row = record(value, label)
  exactKeys(row, [
    'taskKey', 'lane', 'kind', 'skillId', 'executionMode', 'dependsOn', 'requiredReceipts',
    'inputArtifactKeys', 'outputArtifactKeys', 'requirementKeys', 'capabilityRequirementKeys',
    'concurrencyGroup', 'subjectLockKeys', 'priority', 'budgetReservation', 'maxAttempts',
    'timeoutMs', 'failurePolicy', 'fallbackTaskKey', 'acceptanceGateIds', 'reuse',
    ...(Object.prototype.hasOwnProperty.call(row, 'authorRevision') ? ['authorRevision'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'contextProfile') ? ['contextProfile'] : []),
  ], label)
  if (!Array.isArray(row.requiredReceipts) || row.requiredReceipts.length > 1_000) fail(`${label}.requiredReceipts 无效`)
  const requiredReceipts = row.requiredReceipts.map((value, receiptIndex) => {
    const receipt = record(value, `${label}.requiredReceipts[${receiptIndex}]`)
    exactKeys(receipt, ['taskKey', 'receiptHash'], `${label}.requiredReceipts[${receiptIndex}]`)
    if (receipt.receiptHash !== null && !isSha256Hash(receipt.receiptHash)) fail(`${label}.receiptHash 无效`)
    return { taskKey: key(receipt.taskKey, `${label}.receipt.taskKey`), receiptHash: receipt.receiptHash as string | null }
  })
  let reuse: ProductProductionPlanTaskV3['reuse'] = null
  if (row.reuse != null) {
    const candidate = record(row.reuse, `${label}.reuse`)
    exactKeys(candidate, [
      'sourceBuildNumber', 'sourceArtifactKey', 'sourceContentHash', 'reuseKey',
      'requiresRevalidation', 'reason',
    ], `${label}.reuse`)
    if (!isSha256Hash(candidate.sourceContentHash) || !isSha256Hash(candidate.reuseKey)
      || typeof candidate.requiresRevalidation !== 'boolean'
      || typeof candidate.reason !== 'string' || !candidate.reason.trim()) {
      fail(`${label}.reuse 无效`)
    }
    reuse = {
      sourceBuildNumber: integer(candidate.sourceBuildNumber, `${label}.reuse.sourceBuildNumber`),
      sourceArtifactKey: key(candidate.sourceArtifactKey, `${label}.reuse.sourceArtifactKey`),
      sourceContentHash: candidate.sourceContentHash,
      reuseKey: candidate.reuseKey,
      requiresRevalidation: candidate.requiresRevalidation,
      reason: candidate.reason.trim(),
    }
  }
  let authorRevision: ProductProductionPlanTaskV3['authorRevision']
  if (Object.prototype.hasOwnProperty.call(row, 'authorRevision')) {
    const revision = record(row.authorRevision, `${label}.authorRevision`)
    const { commandId, sourceBuildNumber, ...content } = revision
    authorRevision = { ...parseTextAdventureContentRevisionV1(content),
      commandId: key(commandId, `${label}.authorRevision.commandId`),
      sourceBuildNumber: integer(sourceBuildNumber, `${label}.authorRevision.sourceBuildNumber`) }
    if (sourceBuildNumber === 0 || row.executionMode !== 'model' || row.reuse != null
      || authorRevision.artifactKey !== row.taskKey || !Array.isArray(row.outputArtifactKeys)
      || row.outputArtifactKeys.length !== 1 || row.outputArtifactKeys[0] !== row.taskKey) fail(`${label}.authorRevision 任务不闭合`)
  }
  return {
    taskKey: key(row.taskKey, `${label}.taskKey`),
    lane: enumValue(row.lane, LANES, `${label}.lane`),
    kind: key(row.kind, `${label}.kind`),
    skillId: row.skillId === null ? null : key(row.skillId, `${label}.skillId`),
    executionMode: enumValue(row.executionMode, EXECUTION_MODES, `${label}.executionMode`),
    dependsOn: keys(row.dependsOn, `${label}.dependsOn`),
    requiredReceipts,
    // A frozen WorldRelease/novel may contain up to 20k source units. P0 owns
    // one exact Artifact and subject lock per unit, plus the closure index.
    inputArtifactKeys: keys(row.inputArtifactKeys, `${label}.inputArtifactKeys`, 20_001),
    outputArtifactKeys: keys(row.outputArtifactKeys, `${label}.outputArtifactKeys`, 20_001),
    requirementKeys: keys(row.requirementKeys, `${label}.requirementKeys`),
    capabilityRequirementKeys: keys(row.capabilityRequirementKeys, `${label}.capabilityRequirementKeys`),
    concurrencyGroup: key(row.concurrencyGroup, `${label}.concurrencyGroup`),
    subjectLockKeys: keys(row.subjectLockKeys, `${label}.subjectLockKeys`, 20_001),
    priority: integer(row.priority, `${label}.priority`, 1_000_000),
    budgetReservation: parseBudget(row.budgetReservation, `${label}.budgetReservation`),
    maxAttempts: integer(row.maxAttempts, `${label}.maxAttempts`, 20),
    timeoutMs: integer(row.timeoutMs, `${label}.timeoutMs`, 86_400_000),
    failurePolicy: enumValue(row.failurePolicy, FAILURE_POLICIES, `${label}.failurePolicy`),
    fallbackTaskKey: row.fallbackTaskKey === null ? null : key(row.fallbackTaskKey, `${label}.fallbackTaskKey`),
    acceptanceGateIds: keys(row.acceptanceGateIds, `${label}.acceptanceGateIds`),
    reuse,
    ...(authorRevision ? { authorRevision } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'contextProfile')
      ? { contextProfile: enumValue(row.contextProfile, ['avg-task-v1', 'avg-visual-planning-v4','avg-visual-planning-v5','avg-sound-planning-v1'] as const, `${label}.contextProfile`) } : {}),
  }
}

export function parseProductProductionPlanV3(
  value: string | unknown,
  briefInput?: ProductProductionBriefV3 | string,
  expectedBriefHash?: string,
): ProductProductionPlanV3 {
  let candidate: unknown = value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) } catch { fail('Plan 不是合法 JSON') }
  }
  const row = record(candidate, 'plan')
  exactKeys(row, [
    'schema', 'version', 'buildNumber', 'productType', 'briefHash', 'controlEpoch',
    'concurrency', 'tasks', 'terminalTaskKey',
  ], 'plan')
  if (row.schema !== 'storyforge.product-production-plan' || row.version !== 3 || !isSha256Hash(row.briefHash)) {
    fail('schema/version/briefHash 无效')
  }
  const productType = enumValue(row.productType, PRODUCTION_PRODUCT_KINDS_V1, 'productType')
  const concurrency = record(row.concurrency, 'concurrency')
  exactKeys(concurrency, [
    'maximumCostBearingTasks', 'maximumTextProviderTasks', 'maximumMediaProviderTasks',
  ], 'concurrency')
  const parsedConcurrency = {
    maximumCostBearingTasks: integer(concurrency.maximumCostBearingTasks, 'concurrency.maximumCostBearingTasks', 3),
    maximumTextProviderTasks: integer(concurrency.maximumTextProviderTasks, 'concurrency.maximumTextProviderTasks', 2),
    maximumMediaProviderTasks: integer(concurrency.maximumMediaProviderTasks, 'concurrency.maximumMediaProviderTasks', 1),
  }
  if (Object.values(parsedConcurrency).some(value => value < 1)) fail('concurrency 必须大于零')
  if (!Array.isArray(row.tasks) || row.tasks.length < 1 || row.tasks.length > 100) fail('tasks 数量无效')
  const tasks = row.tasks.map(parseTask)
  if (tasks.some(task => task.authorRevision) && productType !== 'text-adventure') fail('作者批量修订只用于文字冒险')
  const taskByKey = new Map(tasks.map(task => [task.taskKey, task]))
  if (taskByKey.size !== tasks.length) fail('taskKey 重复')
  const terminalTaskKey = key(row.terminalTaskKey, 'terminalTaskKey')
  if (!taskByKey.has(terminalTaskKey)) fail('terminalTaskKey 不存在')
  const outputOwners = new Map<string, string>()
  for (const task of tasks) {
    if (task.maxAttempts < 1 || task.timeoutMs < 1) fail(`${task.taskKey} attempt/timeout 无效`)
    if (task.dependsOn.some(dep => !taskByKey.has(dep) || dep === task.taskKey)) fail(`${task.taskKey} 依赖无效`)
    const receiptDeps = task.requiredReceipts.map(item => item.taskKey)
    if (receiptDeps.length !== task.dependsOn.length || task.dependsOn.some(dep => !receiptDeps.includes(dep))) {
      fail(`${task.taskKey} requiredReceipts 未闭合 dependsOn`)
    }
    if (task.inputArtifactKeys.some(inputKey => !tasks.some(owner => owner.outputArtifactKeys.includes(inputKey)))) {
      fail(`${task.taskKey} 输入 Artifact 没有 owner`)
    }
    for (const output of task.outputArtifactKeys) {
      if (outputOwners.has(output)) fail(`Artifact ${output} 有多个 owner`)
      outputOwners.set(output, task.taskKey)
    }
    if (task.fallbackTaskKey && (!taskByKey.has(task.fallbackTaskKey) || task.fallbackTaskKey === task.taskKey)) {
      fail(`${task.taskKey} fallback 无效`)
    }
    if (task.failurePolicy === 'fallback' && task.fallbackTaskKey === null) fail(`${task.taskKey} 缺少 fallbackTaskKey`)
    if (task.failurePolicy !== 'fallback' && task.fallbackTaskKey !== null) fail(`${task.taskKey} 非 fallback 任务声明 fallbackTaskKey`)
    if (task.executionMode === 'model' && task.skillId === null) fail(`${task.taskKey} 模型任务缺少 skillId`)
    if (task.executionMode === 'deterministic' && task.skillId !== null) fail(`${task.taskKey} 确定性任务不应绑定 skillId`)
    if (task.contextProfile === 'avg-task-v1' && (productType !== 'avg' || task.executionMode !== 'deterministic'
      || !['avg-assembly-integrate', 'avg-assembly-verify', 'avg-media-image-process', 'avg-media-image-reuse', 'avg-media-voice-reuse', 'avg-audio-process'].includes(task.kind))) {
      fail(`${task.taskKey} 上下文投影只用于准确 AVG 确定性任务`)
    }
    if (task.contextProfile === 'avg-sound-planning-v1' && (productType !== 'avg' || task.executionMode !== 'deterministic'
      || !['avg-sound-requirements-compile', 'avg-sound-library-import', 'avg-sound-requirements-reuse', 'avg-sound-raw-reuse', 'avg-assembly-integrate', 'avg-assembly-verify', 'avg-audio-process'].includes(task.kind))) {
      fail(`${task.taskKey} 声音投影只允许准确声音合同的确定性任务`)
    }
    if (task.kind === 'avg-audio-process') assertAvgAudioProcessingTaskShapeV1(task, tasks, productType)
    if(task.contextProfile==='avg-visual-planning-v5'&&(productType!=='avg'||task.executionMode!=='deterministic'
      ||!['avg-v5-visual-requirements-compile','avg-v5-visual-proposal-reuse','avg-media-image-reuse','avg-media-image-process'].includes(task.kind)))fail(`${task.taskKey} V5 投影只用于准确新需求编译、方案复用、原图复验或加工`)
    if (task.contextProfile === 'avg-visual-planning-v4' && (productType !== 'avg' || task.executionMode !== 'deterministic'
      || !['avg-v4-visual-requirements-compile','avg-v4-visual-proposal-reuse','avg-media-image-reuse','avg-media-image-process'].includes(task.kind))) fail(`${task.taskKey} V4 投影只用于准确需求编译、复验或加工任务`)
    if (task.kind === 'avg-v4-visual-proposal-reuse' && (productType !== 'avg' || task.executionMode !== 'deterministic'
      || task.contextProfile !== 'avg-visual-planning-v4' || task.skillId !== null || task.capabilityRequirementKeys.length !== 0
      || task.budgetReservation.modelCalls !== 0 || task.budgetReservation.mediaCalls !== 0 || task.budgetReservation.maximumCostUsd !== 0
      || task.maxAttempts !== 1 || task.reuse !== null)) fail(`${task.taskKey} 方案复验必须为单次零调用任务，不能借用供应商或通用沿用权限`)
    if(task.kind==='avg-v5-visual-proposal-reuse'&&(productType!=='avg'||task.executionMode!=='deterministic'
      ||task.contextProfile!=='avg-visual-planning-v5'||task.skillId!==null||task.capabilityRequirementKeys.length!==0
      ||task.budgetReservation.modelCalls!==0||task.budgetReservation.mediaCalls!==0||task.budgetReservation.maximumCostUsd!==0
      ||task.maxAttempts!==1||task.reuse!==null||!task.taskKey.startsWith('avg.visual.propose.')||task.outputArtifactKeys.length!==1
      ||!task.outputArtifactKeys[0].startsWith('avg.proposal.')))fail(`${task.taskKey} V5 历史方案复用必须为单次零调用专业任务`)
    if (task.kind === 'avg-media-image-reuse' && task.contextProfile === 'avg-visual-planning-v4') {
      const requirementKey = task.taskKey.startsWith('avg.media.generate.') ? task.taskKey.slice('avg.media.generate.'.length) : ''
      const compiler = tasks.find(owner => owner.outputArtifactKeys.includes(AVG_VISUAL_REQUIREMENTS_ARTIFACT_V4))
      if (!requirementKey || task.skillId !== null || task.capabilityRequirementKeys.length !== 0
        || task.budgetReservation.modelCalls !== 0 || task.budgetReservation.mediaCalls !== 0 || task.budgetReservation.maximumCostUsd !== 0
        || task.maxAttempts !== 1 || task.reuse !== null || task.outputArtifactKeys.length !== 1
        || task.outputArtifactKeys[0] !== `avg.media.raw.${requirementKey}`
        || !task.inputArtifactKeys.includes(AVG_VISUAL_REQUIREMENTS_ARTIFACT_V4)
        || compiler?.kind !== 'avg-v4-visual-requirements-compile' || !task.dependsOn.includes(compiler.taskKey)) {
        fail(`${task.taskKey} 原图复验必须依赖准确需求编译，且为单次零调用任务`)
      }
    }
    if(task.kind==='avg-media-image-process'&&['avg-visual-planning-v4','avg-visual-planning-v5'].includes(task.contextProfile??'')){
      const requirementKey=task.taskKey.startsWith('avg.media.process.')?task.taskKey.slice('avg.media.process.'.length):''
      const compiler=tasks.find(owner=>owner.outputArtifactKeys.includes(AVG_VISUAL_REQUIREMENTS_ARTIFACT_V4))
      const raw=tasks.find(owner=>owner.outputArtifactKeys.includes(`avg.media.raw.${requirementKey}`))
      if(!requirementKey||task.skillId!==null||task.capabilityRequirementKeys.length!==0||task.reuse!==null||task.maxAttempts!==1
        ||task.budgetReservation.modelCalls!==0||task.budgetReservation.mediaCalls!==0||task.budgetReservation.maximumCostUsd!==0
        ||task.outputArtifactKeys.length!==1||task.outputArtifactKeys[0]!==`avg.media.processed.${requirementKey}`
        ||!task.inputArtifactKeys.includes(AVG_VISUAL_REQUIREMENTS_ARTIFACT_V4)||!task.inputArtifactKeys.includes(`avg.media.raw.${requirementKey}`)
        ||compiler?.kind!==(task.contextProfile==='avg-visual-planning-v5'?'avg-v5-visual-requirements-compile':'avg-v4-visual-requirements-compile')||!task.dependsOn.includes(compiler.taskKey)
        ||!raw||!['avg-media-image-generate','avg-media-image-reuse'].includes(raw.kind)||!task.dependsOn.includes(raw.taskKey)){
        fail(`${task.taskKey} 本地加工必须依赖准确需求编译与原图，且为单次零调用任务`)
      }
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>()
  const visit = (taskKey: string) => {
    if (visiting.has(taskKey)) fail(`任务 DAG 有环:${taskKey}`)
    if (visited.has(taskKey)) return
    visiting.add(taskKey)
    for (const dependency of taskByKey.get(taskKey)!.dependsOn) visit(dependency)
    visiting.delete(taskKey); visited.add(taskKey)
  }
  for (const task of tasks) visit(task.taskKey)
  const terminalClosure = new Set<string>()
  const collect = (taskKey: string) => {
    if (terminalClosure.has(taskKey)) return
    terminalClosure.add(taskKey)
    for (const dependency of taskByKey.get(taskKey)!.dependsOn) collect(dependency)
  }
  collect(terminalTaskKey)
  if (terminalClosure.size !== tasks.length) fail('存在未进入 terminal join 的任务')

  const brief = briefInput ? parseProductProductionBriefV3(briefInput) : null
  if (expectedBriefHash != null && (!isSha256Hash(expectedBriefHash) || row.briefHash !== expectedBriefHash)) {
    fail('briefHash 不一致')
  }
  if (brief && brief.intent.productType !== productType) fail('Plan 与 Brief productType 不闭合')
  if (brief && brief.capabilityRequirements.some(requirement => (
    requirement.required && !tasks.some(task => task.capabilityRequirementKeys.includes(requirement.requirementKey))
  ))) fail('必需 capability 未覆盖')
  if (brief) {
    if (brief.ttrpgOpen) {
      const expected = buildTtrpgOpenProductionPlanV3({ brief, briefHash: row.briefHash as string,
        buildNumber: Number(row.buildNumber), controlEpoch: Number(row.controlEpoch) })
      // Reuse is separately authorized against the exact parent proof. It must
      // not change the product's task graph, budgets or execution contracts.
      const previous = buildTtrpgOpenProductionPlanV3({ brief, briefHash: row.briefHash as string,
        buildNumber: Number(row.buildNumber), controlEpoch: Number(row.controlEpoch), profileVersion: 2 })
      const legacyTasks = previous.tasks.map(task => ({ ...task,
        skillId: Object.prototype.hasOwnProperty.call(TTRPG_OPEN_PRODUCTION_SKILL_IDS_V1, task.taskKey)
          ? TTRPG_OPEN_PRODUCTION_SKILL_IDS_V1[task.taskKey as TtrpgOpenProductionTaskKeyV2] : task.skillId,
      }))
      const actualTasks = JSON.stringify(tasks.map(task => ({ ...task, reuse: null })))
      // Compare entire closed generations, without rewriting the parsed Plan.
      // Old queued/unknown Runs cannot acquire a new prompt on application update.
      if (![expected.tasks, previous.tasks, legacyTasks].some(generation => JSON.stringify(generation) === actualTasks) || terminalTaskKey !== expected.terminalTaskKey
        || JSON.stringify(parsedConcurrency) !== JSON.stringify(expected.concurrency)) {
        fail('open 跑团计划必须绑定专属任务、真实依赖与授权预算，不能偷换 scripted DAG')
      }
    }
    const totals = sumProductTaskBudgetReservationsV1(tasks)
    const budget = brief.productionBudget
    // Provider completion usage can include hidden reasoning tokens even when
    // visible JSON is tightly bounded. Text-adventure task ceilings may be
    // overbooked by at most 30%; the scheduler's append-only Build ledger is
    // still the hard authority and refuses each call once real usage plus
    // in-flight reservations would exceed the author-approved total.
    const maximumReservedOutputTokens = productType === 'text-adventure'
      ? Math.floor(budget.maximumOutputTokens * 1.3)
      : budget.maximumOutputTokens
    if (totals.modelCalls > budget.maximumModelCalls || totals.inputTokens > budget.maximumInputTokens
      || totals.outputTokens > maximumReservedOutputTokens || totals.mediaCalls > budget.maximumMediaCalls
      || totals.durationMs > budget.maximumDurationMs || totals.storageBytes > budget.maximumStorageBytes
      || (budget.maximumCostUsd != null
        && (totals.maximumCostUsd == null || totals.maximumCostUsd > budget.maximumCostUsd))) {
      fail('Plan 预算预留超过 Brief 授权')
    }
    const canonicalInputBudget = Math.floor(
      Math.min(budget.maximumInputTokens, 180_000) / (productType === 'character-interaction' && taskByKey.has('media.chat-design') ? 8 : productType === 'character-interaction' && taskByKey.has('media.chat-review') ? 7 : productType === 'character-interaction' && taskByKey.has('content.chat-opening-review') ? 6 : 5),
    )
    const canonicalInputTasks = [
      'content.design', 'content.narrative', 'content.product-module',
      'media.requirements', 'integration.package',
      ...(productType === 'character-interaction' && taskByKey.has('media.chat-review') ? ['media.chat-review'] : []),
      ...(productType === 'character-interaction' && taskByKey.has('media.chat-design') ? ['media.chat-design'] : []),
      ...(productType === 'character-interaction' && taskByKey.has('content.chat-opening-review') ? ['content.chat-opening-review'] : []),
    ]
    const isCanonicalProductionPlan = !['text-adventure', 'text-open-world'].includes(productType)
      && (canonicalInputTasks.some(taskKey => taskByKey.has(taskKey)) || taskByKey.has('qa.release'))
    if (isCanonicalProductionPlan && canonicalInputTasks.some(taskKey => (
      taskByKey.has(taskKey)
        && taskByKey.get(taskKey)!.budgetReservation.inputTokens !== canonicalInputBudget
    ))) {
      fail('Plan 输入预算切片不是当前生产协议')
    }
  }
  const parsed: ProductProductionPlanV3 = {
    schema: 'storyforge.product-production-plan', version: 3,
    buildNumber: integer(row.buildNumber, 'buildNumber'), productType,
    briefHash: row.briefHash, controlEpoch: integer(row.controlEpoch, 'controlEpoch'),
    concurrency: parsedConcurrency, tasks, terminalTaskKey,
  }
  if (brief?.avgSoundPlanning && canonicalProductProductionJsonV2(parsed) !== canonicalProductProductionJsonV2(buildAvgSoundProductionPlan({
    brief, briefHash: parsed.briefHash, buildNumber: parsed.buildNumber, controlEpoch: parsed.controlEpoch,
  }))) fail('AVG 声音 Plan 必须等于准确候选、采用、真实音频与审听的固定拓扑')
  if (brief?.avgVisualPlanning?.version===5 && canonicalProductProductionJsonV2(parsed)!==canonicalProductProductionJsonV2(buildAvgVisualPlanningPlanV5({
    brief:{...brief,avgVisualPlanning:brief.avgVisualPlanning},briefHash:parsed.briefHash,buildNumber:parsed.buildNumber,controlEpoch:parsed.controlEpoch,
  })))fail('AVG V5 专业视觉 Plan 必须等于本次冻结的新岗位与需求消费拓扑')
  if (brief?.avgVisualPlanning?.version===4 && canonicalProductProductionJsonV2(parsed) !== canonicalProductProductionJsonV2(buildAvgVisualPlanningPlanV4({
    brief: { ...brief, avgVisualPlanning: brief.avgVisualPlanning }, briefHash: parsed.briefHash, buildNumber: parsed.buildNumber, controlEpoch: parsed.controlEpoch,
  }))) fail('AVG 专业视觉 Plan 必须等于冻结的候选/作者采用/需求消费拓扑')
  if (brief?.avgAssembly && canonicalProductProductionJsonV2(parsed) !== canonicalProductProductionJsonV2(buildAvgNativeAssemblyPlan({
    brief, briefHash: parsed.briefHash, buildNumber: parsed.buildNumber, controlEpoch: parsed.controlEpoch,
  }))) fail('AVG 组装 Plan 不得替换冻结的作者输入、任务或写域')
  return parsed
}
