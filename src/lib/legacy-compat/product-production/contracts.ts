import { parseWorldSourcePurposeProofV1 } from '../../world-engine/source-purpose-contract';
import { parseAvgAssemblyBrief, AVG_ASSEMBLY_GATE_IDS_V1 } from '../avg/assembly-contract';
import { assertAvgVisualProductionPolicyV2 } from '../avg/media-production-policy';
import { parseAvgStoredAssemblyBriefV3 } from '../avg/voice-assembly-storage';
import { assertAvgVoiceProductionPolicyV3 } from '../avg/voice-production-policy';
import { parseAvgSettingsForLegacyProduction } from '../avg/settings-v2';
import { parseAvgVisualPlanningBrief } from '../avg/visual-planning-brief-codec';
import { assertAvgVisualPlanningPolicyV5 } from '../avg/visual-planning-policy-v5';
import { assertAvgVisualPlanningPolicyV4 } from '../avg/visual-planning-policy';
import { parseAvgSoundPlanningBrief } from '../avg/sound-production-brief';
import { assertAvgSoundProductionPolicy } from '../avg/sound-production-policy';
import { parseAvgAudioProductionProcessingPlan } from '../avg/audio-production-contract';
import { assertAvgAudioProcessingBriefV1 } from '../avg/audio-production-brief';
import { chatVisualMediaProfileV1 } from '../character-interaction/visual-intent';
import { parseChatAuthoringSettings } from '../character-interaction/authoring-contract';
import { parseChatRoleProfileSetV1 } from '../character-interaction/role-profile';
import { parseChatSourceUnitSetV1 } from '../character-interaction/source-unit-authorization';
import type { TextAdventureContentRevisionV1, ProductConsultationBudgetV1, ProductProductionBriefV3, ProductProductionBudgetV3, ProductProductionCompletionContractV1, ProductProductionExternalDataPolicyV1, ProductProductionFallbackPolicyV1, ProductProductionMediaProfileV1, ProductProductionScaleV1, ProductEvolutionAffectedLaneV1, ProductEvolutionBaseV1, ProductEvolutionImpactV1, ProductStartingPointV1, ProviderCapabilityRequirementV1 } from '../../types/index';
import { PRODUCT_MEDIA_KINDS, PRODUCTION_PRODUCT_KINDS_V1 } from '../../types/index';
import { isSha256Hash, canonicalProductProductionJsonV2 } from './hash';
import { parseProductRuntimePackageV1, parseProductWorldSourceSelection } from './runtime-package';
import { parseTtrpgProductionBriefV2 } from '../ttrpg/production-brief';
import { parseTtrpgProductionBriefContentShapeV3 } from '../ttrpg/production-brief-v3';
import { parseAiTownProductionBriefV1 } from '../ai-town/contracts';
import { parseTextAdventureProductionBriefV1 } from '../adventure/production-brief';

const STABLE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

function fail(message: string): never {
  throw new Error(`[product-production-contract] ${message}`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
  return value as Record<string, unknown>
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys)
  const actual = Object.keys(value)
  const unknown = actual.filter(key => !expected.has(key))
  const missing = keys.filter(key => !Object.prototype.hasOwnProperty.call(value, key))
  if (unknown.length || missing.length) fail(`${label} 字段不精确 unknown=${unknown.join(',')} missing=${missing.join(',')}`)
}

function text(value: unknown, label: string, maximum = 10_000): string {
  if (typeof value !== 'string') fail(`${label} 必须是字符串`)
  const normalized = value.trim().normalize('NFC')
  if (!normalized || normalized.length > maximum) fail(`${label} 为空或过长`)
  return normalized
}

function stableKey(value: unknown, label: string): string {
  const parsed = text(value, label, 200)
  if (!STABLE_KEY.test(parsed)) fail(`${label} 不是稳定 key`)
  return parsed
}

function finite(value: unknown, label: string, maximum: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum
    || (integer && !Number.isInteger(value))) fail(`${label} 数值无效`)
  return value
}

function positiveId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) fail(`${label} 必须是正整数`)
  return value
}

function nullableCost(value: unknown, label: string): number | null {
  return value === null ? null : finite(value, label, 1_000_000)
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} 必须是 boolean`)
  return value
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(`${label} 枚举无效`)
  return value as T
}

function stringArray(value: unknown, label: string, maximumItems = 100, stable = false): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) fail(`${label} 必须是有界数组`)
  const result = value.map((item, index) => stable ? stableKey(item, `${label}[${index}]`) : text(item, `${label}[${index}]`, 2000))
  if (new Set(result).size !== result.length) fail(`${label} 不允许重复`)
  return result
}

function parseStartingPoint(value: unknown): ProductStartingPointV1 {
  const row = record(value, 'source.startingPoint')
  exactKeys(row, ['kind', 'title', 'summary', 'sourceRefs', 'protagonistRefs', 'openingConflict'], 'source.startingPoint')
  return {
    kind: enumValue(row.kind, ['mainline', 'branch', 'character', 'history', 'custom'], 'startingPoint.kind'),
    title: text(row.title, 'startingPoint.title', 300),
    summary: text(row.summary, 'startingPoint.summary', 4000),
    sourceRefs: stringArray(row.sourceRefs, 'startingPoint.sourceRefs', 100, true),
    protagonistRefs: stringArray(row.protagonistRefs, 'startingPoint.protagonistRefs', 50, true),
    openingConflict: text(row.openingConflict, 'startingPoint.openingConflict', 4000),
  }
}

function parseScale(value: unknown): ProductProductionScaleV1 {
  const row = record(value, 'scale')
  exactKeys(row, ['scope', 'targetPlayMinutes', 'targetWordCount', 'targetEndingCount'], 'scale')
  return {
    scope: enumValue(row.scope, ['scene', 'short-arc', 'chapter', 'multi-chapter', 'campaign'], 'scale.scope'),
    targetPlayMinutes: finite(row.targetPlayMinutes, 'scale.targetPlayMinutes', 100_000, true),
    targetWordCount: finite(row.targetWordCount, 'scale.targetWordCount', 20_000_000, true),
    targetEndingCount: finite(row.targetEndingCount, 'scale.targetEndingCount', 1000, true),
  }
}

function parseMedia(value: unknown): ProductProductionMediaProfileV1 {
  const row = record(value, 'media')
  exactKeys(row, ['visualLevel', 'audioLevel', 'imageCount', 'musicTrackCount', 'sfxCount', 'voiceLineCount', 'requiredMediaKinds'], 'media')
  const requiredMediaKinds = stringArray(row.requiredMediaKinds, 'media.requiredMediaKinds', PRODUCT_MEDIA_KINDS.length) as ProductProductionMediaProfileV1['requiredMediaKinds']
  if (requiredMediaKinds.some(kind => !PRODUCT_MEDIA_KINDS.includes(kind))) fail('media.requiredMediaKinds 枚举无效')
  return {
    visualLevel: enumValue(row.visualLevel, ['none', 'key-scenes', 'illustrated'], 'media.visualLevel'),
    audioLevel: enumValue(row.audioLevel, ['none', 'music-sfx', 'full'], 'media.audioLevel'),
    imageCount: finite(row.imageCount, 'media.imageCount', 10_000, true),
    musicTrackCount: finite(row.musicTrackCount, 'media.musicTrackCount', 1000, true),
    sfxCount: finite(row.sfxCount, 'media.sfxCount', 10_000, true),
    voiceLineCount: finite(row.voiceLineCount, 'media.voiceLineCount', 1_000_000, true),
    requiredMediaKinds,
  }
}

function parseConsultationBudget(value: unknown, label: string): ProductConsultationBudgetV1 {
  const row = record(value, label)
  exactKeys(row, ['maximumModelCalls', 'maximumInputTokens', 'maximumOutputTokens', 'maximumCostUsd'], label)
  return {
    maximumModelCalls: finite(row.maximumModelCalls, `${label}.maximumModelCalls`, 100_000, true),
    maximumInputTokens: finite(row.maximumInputTokens, `${label}.maximumInputTokens`, 1_000_000_000, true),
    maximumOutputTokens: finite(row.maximumOutputTokens, `${label}.maximumOutputTokens`, 1_000_000_000, true),
    maximumCostUsd: nullableCost(row.maximumCostUsd, `${label}.maximumCostUsd`),
  }
}

function parseProductionBudget(value: unknown): ProductProductionBudgetV3 {
  const row = record(value, 'productionBudget')
  exactKeys(row, [
    'maximumModelCalls', 'maximumInputTokens', 'maximumOutputTokens', 'maximumCostUsd',
    'maximumMediaCalls', 'maximumDurationMs', 'maximumStorageBytes',
  ], 'productionBudget')
  return {
    ...parseConsultationBudget({
      maximumModelCalls: row.maximumModelCalls, maximumInputTokens: row.maximumInputTokens,
      maximumOutputTokens: row.maximumOutputTokens, maximumCostUsd: row.maximumCostUsd,
    }, 'productionBudget.base'),
    maximumMediaCalls: finite(row.maximumMediaCalls, 'productionBudget.maximumMediaCalls', 100_000, true),
    maximumDurationMs: finite(row.maximumDurationMs, 'productionBudget.maximumDurationMs', 31_536_000_000, true),
    maximumStorageBytes: finite(row.maximumStorageBytes, 'productionBudget.maximumStorageBytes', 1_000_000_000_000, true),
  }
}

function parseCapability(value: unknown, index: number): ProviderCapabilityRequirementV1 {
  const row = record(value, `capabilityRequirements[${index}]`)
  exactKeys(row, [
    'requirementKey', 'mediaClass', 'operation', 'adapterFamily', 'minimumCapabilityVersion',
    'allowedDataClasses', 'maximumRequestCost', 'maximumTotalCost', 'rightsPolicyVersion',
    'capabilityHash', 'required',
  ], `capabilityRequirements[${index}]`)
  if (!isSha256Hash(row.capabilityHash)) fail(`capabilityRequirements[${index}].capabilityHash 无效`)
  return {
    requirementKey: stableKey(row.requirementKey, `capabilityRequirements[${index}].requirementKey`),
    mediaClass: enumValue(row.mediaClass, ['text', 'image', 'music', 'sfx', 'voice', 'transcode'], `capabilityRequirements[${index}].mediaClass`),
    operation: stableKey(row.operation, `capabilityRequirements[${index}].operation`),
    adapterFamily: stableKey(row.adapterFamily, `capabilityRequirements[${index}].adapterFamily`),
    minimumCapabilityVersion: text(row.minimumCapabilityVersion, `capabilityRequirements[${index}].minimumCapabilityVersion`, 100),
    allowedDataClasses: stringArray(row.allowedDataClasses, `capabilityRequirements[${index}].allowedDataClasses`, 100, true),
    maximumRequestCost: nullableCost(row.maximumRequestCost, `capabilityRequirements[${index}].maximumRequestCost`),
    maximumTotalCost: nullableCost(row.maximumTotalCost, `capabilityRequirements[${index}].maximumTotalCost`),
    rightsPolicyVersion: stableKey(row.rightsPolicyVersion, `capabilityRequirements[${index}].rightsPolicyVersion`),
    capabilityHash: row.capabilityHash,
    required: boolean(row.required, `capabilityRequirements[${index}].required`),
  }
}

function parseExternalDataPolicy(value: unknown): ProductProductionExternalDataPolicyV1 {
  const row = record(value, 'externalDataPolicy')
  exactKeys(row, ['allowedDataClasses', 'forbiddenDataClasses', 'allowReferenceImages', 'allowVoiceScripts'], 'externalDataPolicy')
  const allowedDataClasses = stringArray(row.allowedDataClasses, 'externalDataPolicy.allowedDataClasses', 100, true)
  const forbiddenDataClasses = stringArray(row.forbiddenDataClasses, 'externalDataPolicy.forbiddenDataClasses', 100, true)
  if (allowedDataClasses.some(item => forbiddenDataClasses.includes(item))) fail('externalDataPolicy 允许与禁止类别冲突')
  return {
    allowedDataClasses, forbiddenDataClasses,
    allowReferenceImages: boolean(row.allowReferenceImages, 'externalDataPolicy.allowReferenceImages'),
    allowVoiceScripts: boolean(row.allowVoiceScripts, 'externalDataPolicy.allowVoiceScripts'),
  }
}

function parseFallbackPolicy(value: unknown): ProductProductionFallbackPolicyV1 {
  const row = record(value, 'fallbackPolicy')
  exactKeys(row, ['allowTextOnly', 'allowExistingProjectMedia', 'allowProceduralAudio', 'onRequiredCapabilityMissing'], 'fallbackPolicy')
  return {
    allowTextOnly: boolean(row.allowTextOnly, 'fallbackPolicy.allowTextOnly'),
    allowExistingProjectMedia: boolean(row.allowExistingProjectMedia, 'fallbackPolicy.allowExistingProjectMedia'),
    allowProceduralAudio: boolean(row.allowProceduralAudio, 'fallbackPolicy.allowProceduralAudio'),
    onRequiredCapabilityMissing: enumValue(row.onRequiredCapabilityMissing, ['pause', 'fail'], 'fallbackPolicy.onRequiredCapabilityMissing'),
  }
}

function parseCompletionContract(value: unknown): ProductProductionCompletionContractV1 {
  const row = record(value, 'completionContract')
  exactKeys(row, ['requiresPlayablePreview', 'requiredGateIds', 'minimumMediaCoverage', 'allowSoftWaivers'], 'completionContract')
  return {
    requiresPlayablePreview: boolean(row.requiresPlayablePreview, 'completionContract.requiresPlayablePreview'),
    requiredGateIds: stringArray(row.requiredGateIds, 'completionContract.requiredGateIds', 100, true),
    minimumMediaCoverage: finite(row.minimumMediaCoverage, 'completionContract.minimumMediaCoverage', 1),
    allowSoftWaivers: boolean(row.allowSoftWaivers, 'completionContract.allowSoftWaivers'),
  }
}

function parseEvolutionBase(value: unknown, label: string): ProductEvolutionBaseV1 {
  const base = record(value, label)
  if (base.kind === 'build') {
    exactKeys(base, ['kind', 'buildNumber', 'manifestHash'], label)
    if (!isSha256Hash(base.manifestHash)) fail(`${label}.manifestHash 无效`)
    return { kind: 'build', buildNumber: positiveId(base.buildNumber, `${label}.buildNumber`), manifestHash: base.manifestHash }
  }
  if (base.kind === 'recovery-build') {
    exactKeys(base, ['kind', 'buildNumber', 'briefHash', 'planHash', 'controlEpoch'], label)
    if (!isSha256Hash(base.briefHash) || !isSha256Hash(base.planHash)) fail(`${label} recovery hash 无效`)
    return {
      kind: 'recovery-build',
      buildNumber: positiveId(base.buildNumber, `${label}.buildNumber`),
      briefHash: base.briefHash,
      planHash: base.planHash,
      controlEpoch: finite(base.controlEpoch, `${label}.controlEpoch`, Number.MAX_SAFE_INTEGER, true),
    }
  }
  exactKeys(base, ['kind', 'productReleaseId', 'contentHash'], label)
  if (base.kind !== 'release' || !isSha256Hash(base.contentHash)) fail(`${label} release 无效`)
  return { kind: 'release', productReleaseId: positiveId(base.productReleaseId, `${label}.productReleaseId`), contentHash: base.contentHash }
}

const EVOLUTION_LANES: readonly ProductEvolutionAffectedLaneV1[] = [
  'content', 'product', 'visual', 'audio', 'runtime', 'world-source', 'production-budget', 'execution-plan',
]

function parseEvolutionImpact(value: unknown): ProductEvolutionImpactV1 {
  const row = record(value, 'evolution')
  exactKeys(row, ['schema', 'version', 'base', 'userGoal', 'affectedLanes'], 'evolution')
  if (row.schema !== 'storyforge.product-evolution-impact' || row.version !== 1) fail('evolution schema/version 无效')
  const affectedLanes = stringArray(row.affectedLanes, 'evolution.affectedLanes', EVOLUTION_LANES.length, true)
    .map((lane, index) => enumValue(lane, EVOLUTION_LANES, `evolution.affectedLanes[${index}]`))
  if (!affectedLanes.length) fail('evolution.affectedLanes 不能为空')
  return {
    schema: 'storyforge.product-evolution-impact', version: 1,
    base: parseEvolutionBase(row.base, 'evolution.base'),
    userGoal: text(row.userGoal, 'evolution.userGoal', 2000), affectedLanes,
  }
}

export function parseProductProductionBriefV3(value: unknown): ProductProductionBriefV3 {
  let candidate = value
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) } catch { fail('brief 不是合法 JSON') }
  }
  const row = record(candidate, 'brief')
  exactKeys(row, [
    'schema', 'version', 'source', 'intent', 'scale', 'media', 'consultationBudget',
    'productionBudget', 'qualityProfile', 'capabilityRequirements', 'externalDataPolicy',
    'fallbackPolicy', 'completionContract', 'unresolvedDecisionKeys',
    ...(Object.prototype.hasOwnProperty.call(row, 'characterChat') ? ['characterChat'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'characterChatProfiles') ? ['characterChatProfiles'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'characterChatSourceUnits') ? ['characterChatSourceUnits'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'avg') ? ['avg'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgRevision') ? ['avgRevision'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgAssembly') ? ['avgAssembly'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgVisualPlanning') ? ['avgVisualPlanning'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgSoundPlanning') ? ['avgSoundPlanning'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgAudioProcessing') ? ['avgAudioProcessing'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'ttrpg') ? ['ttrpg'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'ttrpgOpen') ? ['ttrpgOpen'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'aiTown') ? ['aiTown'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'textAdventure') ? ['textAdventure'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'authorConfirmations') ? ['authorConfirmations'] : []),
    ...(Object.prototype.hasOwnProperty.call(row, 'evolution') ? ['evolution'] : []),
  ], 'brief')
  if (row.schema !== 'storyforge.product-production-brief' || row.version !== 3) fail('brief schema/version 无效')
  const source = record(row.source, 'source')
  const hasSourcePurpose = Object.prototype.hasOwnProperty.call(source, 'sourcePurpose')
  exactKeys(source, ['worldReleaseId', 'worldContentHash', 'selection', 'startingPoint',
    ...(hasSourcePurpose ? ['sourcePurpose'] : [])], 'source')
  if (!isSha256Hash(source.worldContentHash)) fail('source.worldContentHash 无效')
  const selection = parseProductWorldSourceSelection(source.selection)

  const intent = record(row.intent, 'intent')
  exactKeys(intent, [
    'productType', 'playerRole', 'protagonistRefs', 'openingSituation', 'coreExperience',
    'requiredFacts', 'forbiddenChanges', 'contentBoundaries', 'tone',
  ], 'intent')
  const productType = enumValue(intent.productType, PRODUCTION_PRODUCT_KINDS_V1, 'intent.productType')
  const sourcePurpose = hasSourcePurpose ? parseWorldSourcePurposeProofV1(source.sourcePurpose) : undefined
  if (sourcePurpose && (sourcePurpose.purpose !== productType ||
    sourcePurpose.selectedRelease.releaseHash !== source.worldContentHash)) fail('sourcePurpose 与产品或版本不一致')
  if (productType !== selection.productType) fail('intent.productType 与 selection 不一致')
  if (!Array.isArray(row.capabilityRequirements) || row.capabilityRequirements.length > 100) fail('capabilityRequirements 必须是有界数组')
  const capabilityRequirements = row.capabilityRequirements.map(parseCapability)
  if (new Set(capabilityRequirements.map(item => item.requirementKey)).size !== capabilityRequirements.length) fail('capability requirementKey 重复')

  if (row.characterChat && productType !== 'character-interaction') fail('角色聊天设置不能用于其他产品')
  if (row.characterChatProfiles !== undefined && (productType !== 'character-interaction' || !row.characterChat || parseChatAuthoringSettings(row.characterChat).version === 1)) fail('人物整理仅适用于带完整来源的角色聊天')
  if (row.characterChatSourceUnits !== undefined && (productType !== 'character-interaction' || !row.characterChat || parseChatAuthoringSettings(row.characterChat).version !== 3)) fail('逐项事实仅适用于实验角色聊天方案')
  if (row.avg && productType !== 'avg') fail('AVG 设置只能用于 AVG')
  let avgRevision: ProductProductionBriefV3['avgRevision']
  if (row.avgRevision != null) {
    const revision = record(row.avgRevision, 'avgRevision')
    exactKeys(revision, ['version','basePackageHash','runtimePackage'], 'avgRevision')
    if (productType !== 'avg' || revision.version !== 1 || !isSha256Hash(revision.basePackageHash)) fail('AVG 修订身份无效')
    const runtimePackage = parseProductRuntimePackageV1(revision.runtimePackage)
    if (runtimePackage.productType !== 'avg' || runtimePackage.sourceWorld.contentHash !== source.worldContentHash || canonicalProductProductionJsonV2(runtimePackage.sourceWorld.selection)!==canonicalProductProductionJsonV2(selection)) fail('AVG 修订不得替换冻结来源')
    avgRevision = { version: 1, basePackageHash: revision.basePackageHash, runtimePackage }
  }
  const parsed: ProductProductionBriefV3 = {
    ...(avgRevision ? { avgRevision } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgAssembly') ? { avgAssembly: parseAvgAssemblyBrief(row.avgAssembly) } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgVisualPlanning') ? { avgVisualPlanning: parseAvgVisualPlanningBrief(row.avgVisualPlanning) } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgSoundPlanning') ? { avgSoundPlanning: parseAvgSoundPlanningBrief(row.avgSoundPlanning) } : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'avgAudioProcessing') ? { avgAudioProcessing: parseAvgAudioProductionProcessingPlan(row.avgAudioProcessing) } : {}),
    ...(row.avg ? { avg: parseAvgSettingsForLegacyProduction(row.avg) } : {}),
    ...(row.characterChat ? { characterChat: parseChatAuthoringSettings(row.characterChat) } : {}),
    ...(row.characterChatProfiles !== undefined ? {characterChatProfiles: parseChatRoleProfileSetV1(row.characterChatProfiles)} : {}),
    ...(row.characterChatSourceUnits !== undefined ? {characterChatSourceUnits: parseChatSourceUnitSetV1(row.characterChatSourceUnits)} : {}),
    schema: 'storyforge.product-production-brief', version: 3,
    source: {
      worldReleaseId: positiveId(source.worldReleaseId, 'source.worldReleaseId'),
      worldContentHash: source.worldContentHash,
      ...(sourcePurpose ? { sourcePurpose } : {}),
      selection,
      startingPoint: parseStartingPoint(source.startingPoint),
    },
    intent: {
      productType,
      playerRole: text(intent.playerRole, 'intent.playerRole', 1000),
      protagonistRefs: stringArray(intent.protagonistRefs, 'intent.protagonistRefs', 50, true),
      openingSituation: text(intent.openingSituation, 'intent.openingSituation', 5000),
      coreExperience: stringArray(intent.coreExperience, 'intent.coreExperience', 50),
      requiredFacts: stringArray(intent.requiredFacts, 'intent.requiredFacts', 200),
      forbiddenChanges: stringArray(intent.forbiddenChanges, 'intent.forbiddenChanges', 200),
      contentBoundaries: stringArray(intent.contentBoundaries, 'intent.contentBoundaries', 200),
      tone: stringArray(intent.tone, 'intent.tone', 50),
    },
    scale: parseScale(row.scale), media: parseMedia(row.media),
    consultationBudget: parseConsultationBudget(row.consultationBudget, 'consultationBudget'),
    productionBudget: parseProductionBudget(row.productionBudget),
    qualityProfile: enumValue(row.qualityProfile, ['prototype', 'internal', 'commercial-candidate'], 'qualityProfile'),
    capabilityRequirements, externalDataPolicy: parseExternalDataPolicy(row.externalDataPolicy),
    fallbackPolicy: parseFallbackPolicy(row.fallbackPolicy),
    completionContract: parseCompletionContract(row.completionContract),
    unresolvedDecisionKeys: stringArray(row.unresolvedDecisionKeys, 'unresolvedDecisionKeys', 100, true),
    ...(Object.prototype.hasOwnProperty.call(row, 'ttrpg')
      ? { ttrpg: parseTtrpgProductionBriefV2(row.ttrpg) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'ttrpgOpen')
      ? { ttrpgOpen: parseTtrpgProductionBriefContentShapeV3(row.ttrpgOpen) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'aiTown')
      ? { aiTown: parseAiTownProductionBriefV1(row.aiTown) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'textAdventure')
      ? { textAdventure: parseTextAdventureProductionBriefV1(row.textAdventure) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'authorConfirmations')
      ? { authorConfirmations: (() => {
        const confirmations = record(row.authorConfirmations, 'authorConfirmations')
        exactKeys(confirmations, ['ttrpgDefaultRuleMappings'], 'authorConfirmations')
        return {
          ttrpgDefaultRuleMappings: boolean(
            confirmations.ttrpgDefaultRuleMappings,
            'authorConfirmations.ttrpgDefaultRuleMappings',
          ),
        }
      })() }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(row, 'evolution')
      ? { evolution: parseEvolutionImpact(row.evolution) }
      : {}),
  }
  assertAvgAudioProcessingBriefV1(parsed)
  if (parsed.avgSoundPlanning) assertAvgSoundProductionPolicy(parsed)
  if (parsed.avgVisualPlanning) {
    if(parsed.avgVisualPlanning.version===5)assertAvgVisualPlanningPolicyV5(parsed)
    else assertAvgVisualPlanningPolicyV4(parsed)
  }
  if (parsed.avgAssembly?.version === 2) assertAvgVisualProductionPolicyV2(parsed)
  if (parsed.avgAssembly?.version === 3) {
    const { assembly } = parseAvgStoredAssemblyBriefV3(parsed.avgAssembly)
    assertAvgVoiceProductionPolicyV3({ ...parsed, avgAssembly: assembly })
  }
  if (parsed.avgAssembly?.version === 1 && (productType !== 'avg' || parsed.avgRevision || parsed.qualityProfile === 'commercial-candidate'
    || parsed.capabilityRequirements.length || parsed.productionBudget.maximumModelCalls !== 0 || parsed.productionBudget.maximumMediaCalls !== 0
    || parsed.productionBudget.maximumOutputTokens !== 0 || parsed.productionBudget.maximumCostUsd !== 0
    || canonicalProductProductionJsonV2([...parsed.completionContract.requiredGateIds].sort()) !== canonicalProductProductionJsonV2([...AVG_ASSEMBLY_GATE_IDS_V1].sort()))) {
    fail('AVG 作者组装必须使用独立零 Provider 预算、准确技术门与 prototype/internal 质量边界')
  }
  if (productType === 'character-interaction' && (parsed.media.imageCount > 0 || parsed.media.visualLevel !== 'none')) {
    const expected = chatVisualMediaProfileV1(parsed.characterChat, parsed.media.visualLevel)
    const imageRequirements = parsed.capabilityRequirements.filter(item => item.mediaClass === 'image')
    if (parsed.media.imageCount !== expected.imageCount
      || canonicalProductProductionJsonV2([...parsed.media.requiredMediaKinds].sort()) !== canonicalProductProductionJsonV2([...expected.requiredMediaKinds].sort())
      || parsed.media.audioLevel !== 'none' || parsed.media.musicTrackCount + parsed.media.sfxCount + parsed.media.voiceLineCount !== 0
      || imageRequirements.length !== 1 || imageRequirements[0].requirementKey !== 'media.visual' || !imageRequirements[0].required
      || canonicalProductProductionJsonV2(imageRequirements[0].allowedDataClasses) !== '["author-intent"]'
      || !parsed.externalDataPolicy.allowedDataClasses.includes('author-intent')
      || parsed.externalDataPolicy.forbiddenDataClasses.includes('author-intent')) fail('角色聊天图片必须对应明确的画面数量、类型与作者输入授权')
  }
  if (parsed.intent.protagonistRefs.some(ref => !parsed.source.startingPoint.protagonistRefs.includes(ref))) {
    fail('intent.protagonistRefs 必须来自 startingPoint 候选')
  }
  if ((parsed.intent.productType === 'ttrpg') !== (parsed.ttrpg != null || parsed.ttrpgOpen != null)
    || (parsed.ttrpg != null && parsed.ttrpgOpen != null)) {
    fail('ttrpg 产品必须且只能绑定一个 scripted/open 制作契约')
  }
  if (parsed.ttrpgOpen) {
    const open = parsed.ttrpgOpen
    if (open.worldReference.localReleaseRecordId !== parsed.source.worldReleaseId
      || open.worldReference.releaseHash !== parsed.source.worldContentHash
      || open.worldReference.referenceHash !== parsed.source.selection.worldReferenceHash
      || open.sourcePlan.productType !== parsed.intent.productType
      || open.settings.openingSituation !== parsed.intent.openingSituation
      || open.settings.playerRole !== parsed.intent.playerRole
      || parsed.scale.targetEndingCount !== 0) {
      fail('open 跑团方向/来源与共同制作合同不一致，不能伪造结局下限')
    }
  }
  if ((parsed.intent.productType === 'ai-town') !== (parsed.aiTown != null)) {
    fail('ai-town 产品与 AiTownProductionBriefV1 不闭合')
  }
  if (parsed.aiTown) {
    const townSource = parsed.aiTown.sourceSelection
    if (townSource.worldReleaseId !== parsed.source.worldReleaseId
      || townSource.worldContentHash !== parsed.source.worldContentHash
      || townSource.worldReferenceHash !== parsed.source.selection.worldReferenceHash) {
      fail('AI 小镇专属来源与产品冻结来源不一致')
    }
    const selected = new Set(parsed.source.selection.resourceKeys)
    const relationKeys = new Set(townSource.relationSubgraphResourceKeys)
    const explicitKeys = [
      ...townSource.endingResourceKeys, ...townSource.residentResourceKeys,
      ...townSource.locationResourceKeys, ...townSource.ruleAndLoreResourceKeys,
      ...townSource.artifactResourceKeys,
    ]
    if (explicitKeys.some(key => !selected.has(key))) fail('AI 小镇显式来源超出产品冻结选择')
    if ([...selected].some(key => !townSource.dependencyClosureResourceKeys.includes(key))
      || townSource.dependencyClosureResourceKeys.some(key => !selected.has(key) && !relationKeys.has(key))) {
      fail('AI 小镇来源闭包与产品冻结选择/关系子图不一致')
    }
    if (!parsed.aiTown.authorConfirmed && !parsed.unresolvedDecisionKeys.includes('ai-town-author-confirmation')) {
      fail('AI 小镇未确认状态必须登记 unresolved decision')
    }
  }
  if ((parsed.intent.productType === 'text-adventure') !== (parsed.textAdventure != null)) {
    fail('text-adventure 产品与 TextAdventureProductionBriefV1 不闭合')
  }
  if (parsed.textAdventure) {
    if (parsed.scale.targetPlayMinutes > 120 || ['multi-chapter', 'campaign'].includes(parsed.scale.scope)) {
      fail('文字冒险第一阶段只允许 15–120 分钟的有限篇幅')
    }
    if (parsed.textAdventure.narrative.targetEndingCount !== parsed.scale.targetEndingCount) {
      fail('文字冒险结局目标与通用规模不一致')
    }
    const confirmationUnresolved = parsed.unresolvedDecisionKeys.includes('text-adventure-boundary-confirmation')
    if (confirmationUnresolved === Object.values(parsed.textAdventure.confirmations).every(Boolean)) {
      fail('文字冒险边界确认状态与 unresolvedDecisionKeys 不一致')
    }
  }
  if (parsed.ttrpg) {
    if (parsed.ttrpg.campaignDesign.sourceWorldContentHash !== parsed.source.worldContentHash) {
      fail('TTRPG 战役提案来源与冻结 WorldRelease 不一致')
    }
    const proposalDecisionUnresolved = parsed.unresolvedDecisionKeys.includes('ttrpg-campaign-proposal-selection')
    if (proposalDecisionUnresolved === parsed.ttrpg.campaignDesign.selection.confirmed) {
      fail('TTRPG 战役提案确认状态与 unresolvedDecisionKeys 不一致')
    }
    const allowedCharacters = new Set(parsed.source.selection.roleBindings.participants ?? [])
    if (parsed.ttrpg.table.seats.some(seat => seat.sourceCharacterResourceKey != null
      && !allowedCharacters.has(seat.sourceCharacterResourceKey))) {
      fail('TTRPG 席位引用了未进入冻结选择的世界角色')
    }
    if (parsed.authorConfirmations?.ttrpgDefaultRuleMappings !== parsed.ttrpg.confirmations.numericMappings) {
      fail('数值映射确认与 TTRPG Brief 不一致')
    }
  }
  return parsed
}

export function parseTextAdventureContentRevisionV1(value: unknown): TextAdventureContentRevisionV1 {
  const revision = record(value, 'contentRevision')
  exactKeys(revision, ['artifactKey', 'expectedArtifactVersion', 'expectedArtifactHash', 'note', 'authorDraftJson'], 'contentRevision')
  const expectedArtifactHash = text(revision.expectedArtifactHash, 'contentRevision.expectedArtifactHash', 64)
  if (!/^[a-f0-9]{64}$/.test(expectedArtifactHash)) fail('contentRevision.expectedArtifactHash 无效')
  const authorDraftJson = text(revision.authorDraftJson, 'contentRevision.authorDraftJson', 120_000)
  try { record(JSON.parse(authorDraftJson), 'contentRevision.authorDraftJson') } catch { fail('contentRevision.authorDraftJson 必须是 JSON 对象') }
  return {
    artifactKey: enumValue(revision.artifactKey, ['content.product-module', 'content.story-bible', 'content.cast-bible', 'content.adventure-architecture', 'content.narrative-arc-scenes', 'content.narrative-decision-plan', 'content.ending-route-plan', 'content.main-quest-plan', 'content.adventure-side-quests', 'content.adventure-ambient-events', 'content.scene-script.act-1.part-1', 'content.scene-script.act-1.part-2', 'content.scene-script.act-2.part-1', 'content.scene-script.act-2.part-2', 'content.scene-script.act-3.part-1', 'content.scene-script.act-3.part-2', 'content.dialogue-pass.act-1', 'content.dialogue-pass.act-2', 'content.dialogue-pass.act-3', 'content.quest-script.main.act-1.single', 'content.quest-script.main.act-1.multi', 'content.quest-script.main.act-2.single', 'content.quest-script.main.act-2.multi', 'content.quest-script.main.act-3.single', 'content.quest-script.main.act-3.multi', 'content.quest-script.supplemental'], 'contentRevision.artifactKey'),
    expectedArtifactVersion: positiveId(revision.expectedArtifactVersion, 'contentRevision.expectedArtifactVersion'),
    expectedArtifactHash,
    note: text(revision.note, 'contentRevision.note', 2000),
    authorDraftJson,
  }
}
