
import type { ProductBuildArtifactKindV1, TextOpenWorldProductionArtifactDefinitionV1, TextOpenWorldProductionArtifactKindV1, TextOpenWorldProductionTaskContractV1 } from '../../types/index';
import { TEXT_OPEN_WORLD_PRODUCTION_ARTIFACT_KINDS_V1 } from '../../types/index';

const REQUIRED_STALE_WATCHES = [
  'sourcePinHash', 'briefHash', 'planHash', 'controlEpoch', 'inputArtifactHashes',
] as const

function fail(message: string): never {
  throw new Error(`[text-open-world-production] ${message}`)
}

function modelTask(input: Omit<TextOpenWorldProductionTaskContractV1,
  'lane' | 'executionMode' | 'contextSourceKeys' | 'writeTarget' | 'budgetClass'
  | 'recommendedModelCalls' | 'tokenBudgetWeight' | 'durationBudgetWeight'
  | 'retryPolicy' | 'stalePolicy' | 'failurePolicy' | 'timeoutMs'>
  & {
    lane?: TextOpenWorldProductionTaskContractV1['lane']
    recommendedModelCalls?: number
    tokenBudgetWeight?: number
    durationBudgetWeight?: number
    timeoutMs?: number
  },
): TextOpenWorldProductionTaskContractV1 {
  return {
    ...input,
    lane: input.lane ?? 'content',
    executionMode: 'model',
    contextSourceKeys: ['product-production.brief', 'product-production.artifact-inputs'],
    writeTarget: {
      table: 'productBuildArtifacts', fields: ['payloadJson'],
      adoptionExtension: 'product-production-artifacts',
    },
    budgetClass: 'model',
    recommendedModelCalls: input.recommendedModelCalls ?? 3,
    tokenBudgetWeight: input.tokenBudgetWeight ?? input.recommendedModelCalls ?? 3,
    durationBudgetWeight: input.durationBudgetWeight ?? 2,
    retryPolicy: {
      maxAttempts: 2,
      retryableFailures: ['transport', 'rate-limit', 'protocol', 'schema-repair'],
      nonRetryableFailures: ['authorization', 'insufficient-balance', 'stale', 'unknown-result'],
      repairMode: 'bounded-local-repair',
    },
    stalePolicy: {
      watches: [...REQUIRED_STALE_WATCHES], propagation: 'transitive-downstream',
      onChange: 'pause-for-author', staleCandidatePolicy: 'view-only-rebuild-required',
    },
    failurePolicy: 'pause',
    timeoutMs: input.timeoutMs ?? 300_000,
  }
}

function deterministicTask(input: Omit<TextOpenWorldProductionTaskContractV1,
  'lane' | 'executionMode' | 'skillId' | 'contextSourceKeys' | 'writeTarget'
  | 'budgetClass' | 'recommendedModelCalls' | 'tokenBudgetWeight' | 'durationBudgetWeight'
  | 'retryPolicy' | 'stalePolicy'
  | 'failurePolicy' | 'timeoutMs'>
  & { lane?: TextOpenWorldProductionTaskContractV1['lane']; timeoutMs?: number },
): TextOpenWorldProductionTaskContractV1 {
  return {
    ...input,
    lane: input.lane ?? 'integration',
    executionMode: 'deterministic',
    skillId: null,
    contextSourceKeys: ['product-production.brief', 'product-production.artifact-inputs'],
    writeTarget: {
      table: 'productBuildArtifacts', fields: ['payloadJson', 'qualityJson'],
      adoptionExtension: 'product-production-artifacts',
    },
    budgetClass: 'deterministic',
    recommendedModelCalls: 0,
    tokenBudgetWeight: 0,
    durationBudgetWeight: 1,
    retryPolicy: {
      maxAttempts: 1,
      retryableFailures: [],
      nonRetryableFailures: ['authorization', 'insufficient-balance', 'stale', 'unknown-result'],
      repairMode: 'none',
    },
    stalePolicy: {
      watches: [...REQUIRED_STALE_WATCHES], propagation: 'transitive-downstream',
      onChange: 'pause-for-author', staleCandidatePolicy: 'view-only-rebuild-required',
    },
    failurePolicy: 'fail-build',
    timeoutMs: input.timeoutMs ?? 120_000,
  }
}

/**
 * P0-P10 compiler topology. Outputs that must be co-designed share one durable
 * bounded Run; they remain separate immutable Artifacts so later local repair
 * can invalidate only the dependent subgraph. A Run may consume several model
 * calls within its frozen reservation (for example one call per region).
 */
export const TEXT_OPEN_WORLD_PRODUCTION_TASK_CONTRACTS_V1: TextOpenWorldProductionTaskContractV1[] = [
  deterministicTask({
    stage: 'P0', taskKey: 'p0.source-lock', objective: '把已授权世界版本或小说来源冻结为可验证 SourcePin。',
    dependsOn: [], inputArtifactKeys: [],
    outputArtifactKeys: ['text-open-world.source-pin', 'text-open-world.source-pin-unit'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.source-pin.schema', 'tow.source-pin.hash', 'tow.source-pin.authorization'],
    },
  }),
  modelTask({
    stage: 'P1', taskKey: 'p1.source-curation', objective: '渐进读取来源并形成清单、证据账本和显式缺口。',
    skillId: 'text-open-world.production.source-curation.v1', recommendedModelCalls: 6,
    durationBudgetWeight: 8,
    dependsOn: ['p0.source-lock'],
    inputArtifactKeys: ['text-open-world.source-pin', 'text-open-world.source-pin-unit'],
    outputArtifactKeys: [
      'text-open-world.source-manifest', 'text-open-world.source-ledger', 'text-open-world.source-gap-report',
    ],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.source.coverage', 'tow.source.evidence', 'tow.source.unread-explicit'],
    },
  }),
  modelTask({
    stage: 'P2', taskKey: 'p2.experience-design', objective: '把用户会谈与来源约束编译成游戏体验合同和主角身份资产。',
    skillId: 'text-open-world.production.experience-design.v1', recommendedModelCalls: 1, tokenBudgetWeight: 4,
    dependsOn: ['p1.source-curation'],
    inputArtifactKeys: [
      'text-open-world.source-pin', 'text-open-world.source-manifest',
      'text-open-world.source-ledger', 'text-open-world.source-gap-report',
    ],
    outputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.experience-contract',
      'text-open-world.protagonist-asset',
    ],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.experience.user-confirmed', 'tow.experience.boundaries', 'tow.protagonist.identity'],
    },
  }),
  modelTask({
    stage: 'P2', taskKey: 'p2.gameplay-ruleset', objective: '冻结属性、成长、战斗、装备、经济和Effect白名单的玩法骨架。',
    skillId: 'text-open-world.production.gameplay-ruleset.v1', recommendedModelCalls: 1, tokenBudgetWeight: 3,
    dependsOn: ['p1.source-curation', 'p2.experience-design'],
    inputArtifactKeys: [
      'text-open-world.source-ledger', 'text-open-world.game-brief',
      'text-open-world.experience-contract', 'text-open-world.protagonist-asset',
    ],
    outputArtifactKeys: ['text-open-world.gameplay-ruleset-skeleton'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.ruleset.skeleton', 'tow.ruleset.effect-whitelist', 'tow.ruleset.g2-compatible'],
    },
  }),
  modelTask({
    stage: 'P2', taskKey: 'p2.presentation-profile', objective: '冻结UI主题、消费槽、媒资层级和文字降级表现口径。',
    skillId: 'text-open-world.production.presentation-profile.v1', recommendedModelCalls: 1,
    dependsOn: ['p2.experience-design'],
    inputArtifactKeys: ['text-open-world.game-brief', 'text-open-world.experience-contract'],
    outputArtifactKeys: ['text-open-world.presentation-profile'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.presentation.profile', 'tow.presentation.consumer-slots', 'tow.presentation.text-fallback'],
    },
  }),
  modelTask({
    stage: 'P3', taskKey: 'p3.story-architecture', objective: '设计核心冲突、叙事承诺、长程故事弧和多个合规结局。',
    skillId: 'text-open-world.production.story-architecture.v1', recommendedModelCalls: 1, tokenBudgetWeight: 8,
    dependsOn: ['p2.experience-design'],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.experience-contract',
      'text-open-world.protagonist-asset', 'text-open-world.source-ledger',
      'text-open-world.source-gap-report',
    ],
    outputArtifactKeys: [
      'text-open-world.story-arc', 'text-open-world.ending-contracts', 'text-open-world.narrative-promises',
    ],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.story.core-goal', 'tow.story.endings', 'tow.story.promise-callback'],
    },
  }),
  modelTask({
    stage: 'P4', taskKey: 'p4.region-skeleton', objective: '从来源和故事需要建立完整地区、地点需求和初始空间骨架。',
    skillId: 'text-open-world.production.region-skeleton.v1', recommendedModelCalls: 1, tokenBudgetWeight: 6,
    dependsOn: ['p1.source-curation', 'p2.experience-design', 'p3.story-architecture'],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.source-manifest', 'text-open-world.source-ledger',
      'text-open-world.experience-contract', 'text-open-world.story-arc',
    ],
    outputArtifactKeys: ['text-open-world.region-skeleton'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.regions.source-or-story-need', 'tow.regions.connected', 'tow.regions.early-arrival-safe'],
    },
  }),
  modelTask({
    stage: 'P4', taskKey: 'p4.player-build', objective: '把主角身份编译为满足玩法骨架的合法初始成长配置。',
    skillId: 'text-open-world.production.player-build.v1', recommendedModelCalls: 1, tokenBudgetWeight: 3,
    dependsOn: ['p2.experience-design', 'p2.gameplay-ruleset'],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.protagonist-asset', 'text-open-world.experience-contract',
      'text-open-world.gameplay-ruleset-skeleton',
    ],
    outputArtifactKeys: ['text-open-world.player-build'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.player-build.schema', 'tow.player-build.ruleset-compatible'],
    },
  }),
  modelTask({
    stage: 'P5', taskKey: 'p5.mainline', objective: '形成严格顺序、可等待、可恢复且不能被普通状态锁死的主线。',
    skillId: 'text-open-world.production.mainline.v1', recommendedModelCalls: 1, tokenBudgetWeight: 10,
    dependsOn: ['p2.gameplay-ruleset', 'p3.story-architecture', 'p4.region-skeleton', 'p4.player-build'],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.gameplay-ruleset-skeleton',
      'text-open-world.story-arc', 'text-open-world.ending-contracts',
      'text-open-world.narrative-promises', 'text-open-world.region-skeleton',
      'text-open-world.player-build',
    ],
    outputArtifactKeys: ['text-open-world.mainline-thread'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.mainline.strict-order', 'tow.mainline.reachable', 'tow.mainline.protected-wait'],
    },
  }),
  modelTask({
    stage: 'P6', taskKey: 'p6.significant-threads', objective: '生产角色、势力与地区拥有的重要故事线及其局部后果。',
    skillId: 'text-open-world.production.significant-threads.v1', recommendedModelCalls: 1, tokenBudgetWeight: 12,
    dependsOn: ['p1.source-curation', 'p3.story-architecture', 'p4.region-skeleton', 'p5.mainline'],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.source-ledger',
      'text-open-world.story-arc', 'text-open-world.ending-contracts',
      'text-open-world.narrative-promises', 'text-open-world.region-skeleton',
      'text-open-world.mainline-thread',
    ],
    outputArtifactKeys: ['text-open-world.significant-threads'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.significant.owner-coverage', 'tow.significant.mainline-compatible', 'tow.significant.local-consequences'],
    },
  }),
  modelTask({
    stage: 'P7', taskKey: 'p7.region-narrative-packs', objective: '为每个地区补齐矛盾、角色层级、任务母题、传闻和事件供给。',
    skillId: 'text-open-world.production.region-narrative-packs.v1', recommendedModelCalls: 1, tokenBudgetWeight: 16,
    dependsOn: ['p1.source-curation', 'p2.experience-design', 'p4.region-skeleton', 'p5.mainline', 'p6.significant-threads'],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.experience-contract',
      'text-open-world.source-ledger', 'text-open-world.region-skeleton',
      'text-open-world.mainline-thread', 'text-open-world.significant-threads',
    ],
    outputArtifactKeys: ['text-open-world.region-narrative-packs'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.regions.story-coverage', 'tow.regions.distinctiveness', 'tow.regions.content-supply'],
    },
  }),
  modelTask({
    stage: 'P8', taskKey: 'p8.quest-skeletons', objective: '先以体验和玩法需求描述任务，不引用尚未生产的具体目录项。',
    skillId: 'text-open-world.production.quest-skeletons.v1', recommendedModelCalls: 1, tokenBudgetWeight: 8,
    dependsOn: [
      'p2.experience-design', 'p2.gameplay-ruleset', 'p5.mainline',
      'p6.significant-threads', 'p7.region-narrative-packs',
    ],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.experience-contract',
      'text-open-world.gameplay-ruleset-skeleton',
      'text-open-world.mainline-thread', 'text-open-world.significant-threads',
      'text-open-world.region-narrative-packs',
    ],
    outputArtifactKeys: ['text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.quests.story-motivation', 'tow.quests.requirement-complete', 'tow.quests.no-premature-references'],
    },
  }),
  modelTask({
    stage: 'P8', taskKey: 'p8.catalog.progression', objective: '生产成长、属性和技能目录，满足任务需求与等级节奏。',
    skillId: 'text-open-world.production.progression-catalogs.v1', recommendedModelCalls: 1, tokenBudgetWeight: 6,
    dependsOn: ['p2.gameplay-ruleset', 'p4.player-build', 'p8.quest-skeletons'],
    inputArtifactKeys: [
      'text-open-world.gameplay-ruleset-skeleton', 'text-open-world.player-build',
      'text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest',
    ],
    outputArtifactKeys: ['text-open-world.progression-catalogs'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.catalog.progression-schema', 'tow.catalog.progression-curve', 'tow.catalog.skill-sources'],
    },
  }),
  modelTask({
    stage: 'P8', taskKey: 'p8.catalog.encounters', objective: '生产敌人和遭遇目录，满足地区语义、任务需求和成长曲线。',
    // Encounter generation consumes every playable quest requirement and the
    // full regional inventory; size this lane for the accepted Creator scale,
    // not the earlier 6-quest prototype fixture.
    skillId: 'text-open-world.production.encounter-catalog.v1', recommendedModelCalls: 1, tokenBudgetWeight: 9,
    dependsOn: [
      'p2.gameplay-ruleset', 'p4.player-build', 'p7.region-narrative-packs',
      'p8.quest-skeletons', 'p8.catalog.progression',
    ],
    inputArtifactKeys: [
      'text-open-world.gameplay-ruleset-skeleton', 'text-open-world.player-build',
      'text-open-world.region-narrative-packs', 'text-open-world.quest-skeletons',
      'text-open-world.content-requirement-manifest',
      'text-open-world.progression-catalogs',
    ],
    outputArtifactKeys: ['text-open-world.enemy-encounter-catalog'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.catalog.enemy-schema', 'tow.catalog.encounter-coverage', 'tow.catalog.encounter-curve'],
    },
  }),
  modelTask({
    stage: 'P8', taskKey: 'p8.catalog.items-rewards', objective: '生产物品、装备、掉落和奖励目录并闭合任务及成长预算。',
    // The formal Creator inventory carries every quest reward, encounter drop
    // and the complete 8/4/5/2 equipment-consumable-material-key-item floor.
    // Keep its exact structured context above that accepted content ceiling.
    skillId: 'text-open-world.production.item-reward-catalog.v1', recommendedModelCalls: 1, tokenBudgetWeight: 9,
    dependsOn: [
      'p2.gameplay-ruleset', 'p4.player-build', 'p8.quest-skeletons',
      'p8.catalog.progression', 'p8.catalog.encounters',
    ],
    inputArtifactKeys: [
      'text-open-world.gameplay-ruleset-skeleton', 'text-open-world.player-build',
      'text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest',
      'text-open-world.progression-catalogs',
      'text-open-world.enemy-encounter-catalog',
    ],
    outputArtifactKeys: ['text-open-world.item-reward-catalog'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.catalog.item-schema', 'tow.catalog.reward-budget', 'tow.catalog.item-sources'],
    },
  }),
  modelTask({
    stage: 'P8', taskKey: 'p8.catalog.crafting-economy', objective: '生产配方、商店、货币流和价格目录并闭合资源来源与消耗。',
    skillId: 'text-open-world.production.crafting-economy-catalog.v1', recommendedModelCalls: 1, tokenBudgetWeight: 8,
    dependsOn: ['p2.gameplay-ruleset', 'p7.region-narrative-packs', 'p8.quest-skeletons', 'p8.catalog.items-rewards'],
    inputArtifactKeys: [
      'text-open-world.gameplay-ruleset-skeleton', 'text-open-world.region-narrative-packs',
      'text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest',
      'text-open-world.item-reward-catalog',
    ],
    outputArtifactKeys: ['text-open-world.crafting-economy-catalog'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.catalog.crafting-schema', 'tow.catalog.economy-loop', 'tow.catalog.no-risk-arbitrage'],
    },
  }),
  modelTask({
    stage: 'P8', taskKey: 'p8.catalog.npc-runtime', objective: '生产角色层级、日程、服务、关系和死亡替代运行规则。',
    skillId: 'text-open-world.production.npc-runtime-catalog.v1', recommendedModelCalls: 1, tokenBudgetWeight: 8,
    dependsOn: ['p2.gameplay-ruleset', 'p7.region-narrative-packs', 'p8.quest-skeletons', 'p8.catalog.crafting-economy'],
    inputArtifactKeys: [
      'text-open-world.gameplay-ruleset-skeleton', 'text-open-world.region-narrative-packs',
      'text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest',
      'text-open-world.crafting-economy-catalog',
    ],
    outputArtifactKeys: ['text-open-world.npc-runtime-catalog'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.catalog.npc-schema', 'tow.catalog.service-continuity', 'tow.catalog.story-protection'],
    },
  }),
  modelTask({
    stage: 'P8', taskKey: 'p8.catalog.map-interactions', objective: '生产地点交互、道路、旅行、快速旅行和程序地图绑定目录。',
    // This compiler consumes the full regional pack plus every quest/location
    // requirement. Its context grows with the Creator-authored inventory, so
    // the old prototype weight could not carry even the accepted 8/5/16
    // campaign profile without truncating an authoritative dependency.
    skillId: 'text-open-world.production.map-interaction-catalog.v1', recommendedModelCalls: 1, tokenBudgetWeight: 8,
    dependsOn: ['p4.region-skeleton', 'p7.region-narrative-packs', 'p8.quest-skeletons'],
    inputArtifactKeys: [
      'text-open-world.region-skeleton', 'text-open-world.region-narrative-packs',
      'text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest',
    ],
    outputArtifactKeys: ['text-open-world.map-interaction-catalog'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.catalog.map-schema', 'tow.catalog.map-connected', 'tow.catalog.early-arrival-safe'],
    },
  }),
  modelTask({
    stage: 'P8F', taskKey: 'p8f.quest-finalize', objective: '把任务骨架绑定到真实Action、目录、奖励、失败和时间合同。',
    // P8F consumes the complete formal gameplay catalogs. The accepted
    // 8/4/5/2 item floor and three governed enemy families are part of that
    // atomic binding input, so this reservation covers the full Creator scale.
    skillId: 'text-open-world.production.quest-finalize.v1', recommendedModelCalls: 1, tokenBudgetWeight: 19,
    dependsOn: [
      'p5.mainline', 'p6.significant-threads', 'p7.region-narrative-packs', 'p8.quest-skeletons',
      'p8.catalog.progression', 'p8.catalog.encounters', 'p8.catalog.items-rewards',
      'p8.catalog.crafting-economy', 'p8.catalog.npc-runtime', 'p8.catalog.map-interactions',
    ],
    inputArtifactKeys: [
      'text-open-world.mainline-thread', 'text-open-world.significant-threads',
      'text-open-world.region-narrative-packs',
      'text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest',
      'text-open-world.progression-catalogs', 'text-open-world.enemy-encounter-catalog',
      'text-open-world.item-reward-catalog', 'text-open-world.crafting-economy-catalog',
      'text-open-world.npc-runtime-catalog', 'text-open-world.map-interaction-catalog',
    ],
    outputArtifactKeys: ['text-open-world.quest-design-documents', 'text-open-world.director-decks'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.quests.references', 'tow.quests.lifecycle', 'tow.director.deck-budgets'],
    },
  }),
  modelTask({
    stage: 'P9', taskKey: 'p9.scene-scripts', objective: '生产场景、固定选项和系统Action绑定，保持三类交互同一结果源。',
    skillId: 'text-open-world.production.scene-scripts.v1', recommendedModelCalls: 161, tokenBudgetWeight: 26,
    durationBudgetWeight: 48,
    timeoutMs: 3_600_000,
    dependsOn: ['p7.region-narrative-packs', 'p8f.quest-finalize'],
    inputArtifactKeys: [
      'text-open-world.source-ledger', 'text-open-world.experience-contract',
      'text-open-world.story-arc', 'text-open-world.region-narrative-packs',
      'text-open-world.quest-skeletons', 'text-open-world.content-requirement-manifest',
      'text-open-world.npc-runtime-catalog', 'text-open-world.map-interaction-catalog',
      'text-open-world.quest-design-documents', 'text-open-world.director-decks',
    ],
    outputArtifactKeys: [
      'text-open-world.scene-scripts', 'text-open-world.choice-contracts', 'text-open-world.action-bindings',
    ],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.scenes.knowledge-boundary', 'tow.scenes.choice-consequences', 'tow.scenes.single-action-source'],
    },
  }),
  modelTask({
    stage: 'P10', taskKey: 'p10.system-finalize', objective: '汇总系统配置、媒资槽和内容预算，证明体量与玩法闭环。',
    // P10 validates the complete playable closure (all catalogs, finalized
    // quests and scenes), so its exact structured input is comparable to P9,
    // not to a single early-stage design artifact.
    skillId: 'text-open-world.production.system-finalize.v1', recommendedModelCalls: 1, tokenBudgetWeight: 18,
    dependsOn: [
      'p2.experience-design', 'p2.gameplay-ruleset', 'p2.presentation-profile',
      'p4.player-build', 'p7.region-narrative-packs',
      'p8.catalog.progression', 'p8.catalog.encounters', 'p8.catalog.items-rewards',
      'p8.catalog.crafting-economy', 'p8.catalog.npc-runtime', 'p8.catalog.map-interactions',
      'p8f.quest-finalize', 'p9.scene-scripts',
    ],
    inputArtifactKeys: [
      'text-open-world.game-brief', 'text-open-world.experience-contract',
      'text-open-world.gameplay-ruleset-skeleton', 'text-open-world.presentation-profile',
      'text-open-world.player-build', 'text-open-world.region-narrative-packs',
      'text-open-world.progression-catalogs', 'text-open-world.enemy-encounter-catalog',
      'text-open-world.item-reward-catalog', 'text-open-world.crafting-economy-catalog',
      'text-open-world.npc-runtime-catalog', 'text-open-world.map-interaction-catalog',
      'text-open-world.quest-design-documents',
      'text-open-world.director-decks', 'text-open-world.scene-scripts',
      'text-open-world.choice-contracts', 'text-open-world.action-bindings',
    ],
    outputArtifactKeys: [
      'text-open-world.system-configs', 'text-open-world.media-requirements', 'text-open-world.content-budget',
    ],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.system.closed-loop', 'tow.media.required-slots', 'tow.content.inventory-budget'],
    },
  }),
  deterministicTask({
    stage: 'V1', taskKey: 'v1.deterministic-preflight', objective: '执行Schema、引用、预算、可解性和G2运行模块预检。',
    lane: 'qa', dependsOn: ['p10.system-finalize'],
    inputArtifactKeys: [
      'text-open-world.system-configs', 'text-open-world.media-requirements', 'text-open-world.content-budget',
      'text-open-world.quest-design-documents', 'text-open-world.director-decks', 'text-open-world.scene-scripts',
      'text-open-world.choice-contracts', 'text-open-world.action-bindings',
    ],
    outputArtifactKeys: ['text-open-world.deterministic-preflight'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.preflight.schema', 'tow.preflight.references', 'tow.preflight.solvability'],
    },
  }),
  modelTask({
    stage: 'V2', taskKey: 'v2.balance-review', objective: '评审成长、遭遇、奖励、经济、可解性和内容供给平衡。',
    lane: 'qa', skillId: 'text-open-world.production.balance-review.v1', recommendedModelCalls: 1, tokenBudgetWeight: 6,
    dependsOn: [
      'p8.catalog.progression', 'p8.catalog.encounters', 'p8.catalog.items-rewards',
      'p8.catalog.crafting-economy', 'p8f.quest-finalize', 'v1.deterministic-preflight',
    ],
    inputArtifactKeys: [
      'text-open-world.progression-catalogs', 'text-open-world.enemy-encounter-catalog',
      'text-open-world.item-reward-catalog', 'text-open-world.crafting-economy-catalog',
      'text-open-world.quest-design-documents', 'text-open-world.content-budget',
      'text-open-world.deterministic-preflight',
    ],
    outputArtifactKeys: ['text-open-world.balance-review'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.balance.progression', 'tow.balance.encounters', 'tow.balance.economy-solvability'],
    },
  }),
  modelTask({
    stage: 'V2', taskKey: 'v2.semantic-review', objective: '评审叙事、任务体验、内容重复度、时长和世界一致性。',
    lane: 'qa', skillId: 'text-open-world.production.semantic-review.v1', recommendedModelCalls: 1, tokenBudgetWeight: 8,
    dependsOn: ['p3.story-architecture', 'p5.mainline', 'p6.significant-threads', 'p7.region-narrative-packs', 'p9.scene-scripts', 'v1.deterministic-preflight'],
    inputArtifactKeys: [
      'text-open-world.source-ledger', 'text-open-world.experience-contract',
      'text-open-world.story-arc', 'text-open-world.narrative-promises', 'text-open-world.mainline-thread',
      'text-open-world.significant-threads', 'text-open-world.region-narrative-packs',
      'text-open-world.quest-design-documents', 'text-open-world.scene-scripts',
      'text-open-world.choice-contracts', 'text-open-world.action-bindings',
      'text-open-world.content-budget', 'text-open-world.deterministic-preflight',
    ],
    outputArtifactKeys: ['text-open-world.semantic-review'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.semantic.narrative', 'tow.semantic.quest-experience', 'tow.semantic.duration'],
    },
  }),
  deterministicTask({
    stage: 'V3', taskKey: 'v3.runtime-package', objective: '把已验收产物确定性装配为G2可直接运行的文字开放世界包。',
    dependsOn: [
      'p10.system-finalize', 'v1.deterministic-preflight',
      'v2.balance-review', 'v2.semantic-review',
    ],
    inputArtifactKeys: [
      'text-open-world.source-pin', 'text-open-world.source-ledger',
      'text-open-world.game-brief', 'text-open-world.experience-contract',
      'text-open-world.story-arc', 'text-open-world.ending-contracts',
      'text-open-world.mainline-thread', 'text-open-world.significant-threads',
      'text-open-world.quest-skeletons',
      'text-open-world.presentation-profile', 'text-open-world.player-build',
      'text-open-world.region-narrative-packs', 'text-open-world.progression-catalogs',
      'text-open-world.enemy-encounter-catalog', 'text-open-world.item-reward-catalog',
      'text-open-world.crafting-economy-catalog', 'text-open-world.npc-runtime-catalog',
      'text-open-world.map-interaction-catalog',
      'text-open-world.quest-design-documents', 'text-open-world.director-decks',
      'text-open-world.scene-scripts', 'text-open-world.choice-contracts',
      'text-open-world.action-bindings', 'text-open-world.system-configs',
      'text-open-world.media-requirements', 'text-open-world.content-budget',
      'text-open-world.deterministic-preflight', 'text-open-world.balance-review',
      'text-open-world.semantic-review',
    ],
    outputArtifactKeys: ['text-open-world.runtime-package', 'text-open-world.integration-report'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['tow.package.protocol', 'tow.package.g2-compatible', 'tow.package.source-provenance'],
    },
  }),
  deterministicTask({
    stage: 'QA', taskKey: 'qa.release', objective: '汇总硬闸、软警告、媒资覆盖与可发布结论。',
    lane: 'qa', dependsOn: ['v3.runtime-package'],
    inputArtifactKeys: ['text-open-world.runtime-package', 'text-open-world.integration-report'],
    outputArtifactKeys: ['text-open-world.quality-report'],
    completion: {
      requiresAcceptedOutputs: true, terminalEvidence: 'task-receipt',
      requiredGateIds: ['runtime.package.valid', 'runtime.playable', 'rights.complete'],
    },
  }),
]

export const TEXT_OPEN_WORLD_PRODUCTION_ARTIFACT_DEFINITIONS_V1: TextOpenWorldProductionArtifactDefinitionV1[] =
  TEXT_OPEN_WORLD_PRODUCTION_TASK_CONTRACTS_V1.flatMap(task => task.outputArtifactKeys.map(artifactKey => ({
    artifactKey,
    kind: artifactKey,
    schema: `storyforge.${artifactKey.replace(/\./g, '-')}` as `storyforge.${string}`,
    version: 1 as const,
    ownerTaskKey: task.taskKey,
  })))

export function textOpenWorldProductionArtifactKindForKeyV1(
  artifactKey: string,
): ProductBuildArtifactKindV1 {
  if ((TEXT_OPEN_WORLD_PRODUCTION_ARTIFACT_KINDS_V1 as readonly string[]).includes(artifactKey)) {
    return artifactKey as TextOpenWorldProductionArtifactKindV1
  }
  if (/^text-open-world\.source-pin-unit\.\d{5}$/.test(artifactKey)) {
    return 'text-open-world.source-pin-unit'
  }
  if (/^text-open-world\.media\.visual\.\d{3}$/.test(artifactKey)) return 'image'
  if (/^text-open-world\.media\.audio\.\d{3}$/.test(artifactKey)) return 'audio'
  fail(`Artifact key 没有 kind 映射:${artifactKey}`)
}
