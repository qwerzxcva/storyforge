import { createAvgReadingStateV1 } from '../avg/reading-runtime';
import { db } from '../../db/schema';
import { withAdventureNarrativeProjectionV1, withOpenWorldEvolutionProjectionV1, withOpenWorldNarrativeProjectionV1 } from './runtime-product-adapters';
import { EMPTY_PRODUCT_RUNTIME_STATE, type FrozenNarrativeBeat, type FrozenNarrativeChoice, type AnyProductRuntimePackage, type ProductNarrativeRuntimeNodeSnapshot, type ProductNarrativeRuntimeState, type ProductRuntimeState, type ProductRuntimeSession, type WorkspaceScope } from '../../types/index';
import { isTtrpgRuntimeContentV1, isTtrpgRuntimeContentV2 } from '../ttrpg/content-version';
import { createInitialInteractionState } from '../character-interaction/runtime';
import { createInitialAdventureState } from '../adventure/runtime';
import { applyNarrativeEffects, evaluateNarrativeCondition, parseNarrativeCondition, parseNarrativeEffects } from '../../narrative/blueprint';
import { evaluateNarrativeChoices } from '../../product/narrative-content';
import { createInitialAvgPresentationState } from '../avg/runtime';
import { avgExecutableModule, avgRuntimeStage } from '../avg/executable-module';
import { previewAvgSystemEffectsV1 } from '../avg/system-state';
import { createInitialOpenWorldEvolutionState } from '../open-world/evolution-runtime';
import { createInitialOpenWorldState } from '../open-world/runtime';
import { createInitialTextOpenWorldSessionProjectionV1 } from '../open-world/session-projection';
import { createInitialTtrpgOpenProductStateV1, createInitialTtrpgProductStateV1 } from '../ttrpg/runtime';
import { createInitialAiTownStateV1 } from '../ai-town/runtime';
import { verifyProductRuntimeSource } from '../product-production/preview-source';
import { parseRulePackV2, projectTtrpgRulePackMechanicalCoreV1 } from '../ttrpg/rule-pack-v2';
import { resolveScope } from '../../workspace/scope';

interface FrozenNarrativeDefinition {
  version: 2
  moduleKind: AnyProductRuntimePackage['narrative']['moduleKind']
  moduleTitle: string
  entryNodeKey: string
  nodes: ProductNarrativeRuntimeNodeSnapshot[]
  sourceHash: string
  contentHash: string
  beats: FrozenNarrativeBeat[]
  choices: FrozenNarrativeChoice[]
  initialVariables: Record<string, unknown>
}

function productReleaseNarrativeDefinition(
  runtimeSourceHash: string,
  runtimePackage: AnyProductRuntimePackage,
): FrozenNarrativeDefinition {
  return {
    version: 2,
    moduleKind: runtimePackage.narrative.moduleKind,
    moduleTitle: runtimePackage.narrative.moduleTitle,
    entryNodeKey: runtimePackage.narrative.entryNodeKey,
    nodes: structuredClone(runtimePackage.narrative.nodes),
    sourceHash: runtimeSourceHash,
    contentHash: runtimeSourceHash,
    beats: structuredClone(runtimePackage.narrative.beats),
    choices: structuredClone(runtimePackage.narrative.choices),
    initialVariables: structuredClone(runtimePackage.definition.initialVariables),
  }
}

function initialNarrativeState(
  definition: FrozenNarrativeDefinition,
): ProductNarrativeRuntimeState {
  const entry = definition.nodes.find(node => node.key === definition.entryNodeKey)
  if (!entry) throw new Error('[instance] 冻结产品叙事入口不存在')
  const initialVariables = structuredClone(definition.initialVariables)
  if (!evaluateNarrativeCondition(parseNarrativeCondition(entry.conditionJson), initialVariables)) {
    throw new Error('[instance] 冻结产品叙事入口条件在初始状态下不成立')
  }
  const variables = applyNarrativeEffects(parseNarrativeEffects(entry.effectsJson), initialVariables)
  const completed = entry.kind === 'ending'
  const choiceEvaluations = completed
    ? []
    : evaluateNarrativeChoices({
        ...variables,
        __visitedNodeKeys: [entry.key],
        __selectedChoiceKeys: [],
      }, entry.key, definition.choices)
  return {
    schema: 'storyforge.product-narrative-runtime',
    version: 2,
    moduleKind: definition.moduleKind,
    moduleTitle: definition.moduleTitle,
    sourceHash: definition.sourceHash,
    contentHash: definition.contentHash,
    nodes: structuredClone(definition.nodes),
    beats: structuredClone(definition.beats),
    choices: structuredClone(definition.choices),
    currentNodeKey: entry.key,
    visitedNodeKeys: [entry.key],
    availableNodeKeys: [...new Set(choiceEvaluations
      .filter(choice => choice.available)
      .map(choice => choice.targetNodeKey))],
    visibleChoiceKeys: choiceEvaluations.filter(choice => choice.visible).map(choice => choice.choiceKey),
    availableChoiceKeys: choiceEvaluations.filter(choice => choice.available).map(choice => choice.choiceKey),
    choiceHistory: [],
    variables,
    completed,
    endingKey: completed ? entry.key : null,
    completedAtSequence: completed ? 0 : null,
    lastEnteredNodeSequence: null,
  }
}

export function createProductInitialStateV1(input: {
  runtimePackage: AnyProductRuntimePackage
  runtimeSourceHash: string
  ttrpgSessionKey?: string
}): ProductRuntimeState {
  const runtimePackage = input.runtimePackage
  let state = structuredClone(EMPTY_PRODUCT_RUNTIME_STATE)
  const definition = productReleaseNarrativeDefinition(
    input.runtimeSourceHash,
    runtimePackage,
  )
  state.narrative = initialNarrativeState(definition)

  if (runtimePackage.productType === 'character-interaction') {
    state.interaction = createInitialInteractionState({
      playerKey: runtimePackage.interaction!.playerKey,
      profiles: runtimePackage.interaction!.profiles,
      sceneTemplates: runtimePackage.interaction!.sceneTemplates,
      chatSource: runtimePackage.interaction!.chatSource,
      chatNarrative: runtimePackage.interaction!.chatNarrative,
    })
  }
  if (runtimePackage.productType === 'ai-town') {
    state.interaction = createInitialInteractionState({
      playerKey: runtimePackage.interaction!.playerKey,
      profiles: runtimePackage.interaction!.profiles,
      sceneTemplates: runtimePackage.interaction!.sceneTemplates,
    })
    state.town = createInitialAiTownStateV1(
      runtimePackage.town!,
      input.runtimeSourceHash,
    )
  }
  if (runtimePackage.productType === 'text-adventure') {
    state.interaction = createInitialInteractionState({
      playerKey: runtimePackage.interaction!.playerKey,
      profiles: runtimePackage.interaction!.profiles,
      sceneTemplates: runtimePackage.interaction!.sceneTemplates,
    })
    state.adventure = createInitialAdventureState(runtimePackage.adventure!, input.runtimeSourceHash)
    state = withAdventureNarrativeProjectionV1(state)
  }
  if (runtimePackage.productType === 'avg') {
    const module = avgExecutableModule(runtimePackage)
    if (module) {
      state.avgRules = { schema: 'storyforge.avg.rules-state', version: 1, systemPlan: structuredClone(module.systemPlan) }
      if (module.reading) state.avgReading = createAvgReadingStateV1(module)
      const entry = module.systemPlan.scenes.find(scene => scene.key === module.systemPlan.entrySceneKey)!
      previewAvgSystemEffectsV1(module.systemPlan, runtimePackage.definition.initialVariables, entry.onEnter)
    }
    state.presentation = createInitialAvgPresentationState({
      contentHash: input.runtimeSourceHash,
      assets: avgRuntimeStage(runtimePackage)!.assets,
      content: avgRuntimeStage(runtimePackage)!,
      entryNodeKey: runtimePackage.narrative.entryNodeKey,
    })
  }
  if (runtimePackage.productType === 'text-open-world') {
    const hasLegacyRuntime = runtimePackage.interaction != null
      && runtimePackage.adventure != null
      && runtimePackage.openWorldEvolution != null
      && runtimePackage.openWorld != null
    if (runtimePackage.textOpenWorldVNext) {
      state.textOpenWorld = createInitialTextOpenWorldSessionProjectionV1(
        runtimePackage.textOpenWorldVNext,
      )
    }
    if (hasLegacyRuntime) {
      state.interaction = createInitialInteractionState({
        playerKey: runtimePackage.interaction!.playerKey,
        profiles: runtimePackage.interaction!.profiles,
        sceneTemplates: runtimePackage.interaction!.sceneTemplates,
      })
      state.adventure = createInitialAdventureState(runtimePackage.adventure!, input.runtimeSourceHash)
      state.openWorldEvolution = createInitialOpenWorldEvolutionState(
        runtimePackage.openWorldEvolution!,
        input.runtimeSourceHash,
      )
      state.openWorld = createInitialOpenWorldState(runtimePackage.openWorld!, input.runtimeSourceHash)
      state = withAdventureNarrativeProjectionV1(state)
      state = withOpenWorldEvolutionProjectionV1(state)
      state = withOpenWorldNarrativeProjectionV1(state)
    }
  }
  if (runtimePackage.productType === 'ttrpg') {
    if (!runtimePackage.ttrpg) throw new Error('[instance] TTRPG runtime content 缺失')
    if (isTtrpgRuntimeContentV2(runtimePackage.ttrpg)) {
      const rulePack = parseRulePackV2(runtimePackage.ttrpg.rulePack.content)
      state = createInitialTtrpgOpenProductStateV1({
        initialState: state,
        content: runtimePackage.ttrpg,
        mechanicalRulePack: projectTtrpgRulePackMechanicalCoreV1(rulePack),
        sessionKey: input.ttrpgSessionKey ?? `ttrpg.${crypto.randomUUID()}`,
      })
    } else if (isTtrpgRuntimeContentV1(runtimePackage.ttrpg)) {
      state = createInitialTtrpgProductStateV1({
        initialState: state,
        content: runtimePackage.ttrpg,
      })
    }
  }
  return state
}

export async function assertInstanceBinding(
  instanceId: number,
  scope: WorkspaceScope,
): Promise<ProductRuntimeSession> {
  const resolved = await resolveScope({ scope })
  const session = await db.productRuntimeSessions.get(instanceId)
  if (!session
    || session.projectId !== resolved.projectId
    || session.worldId !== resolved.worldId
    || session.workId !== resolved.workId) {
    throw new Error('[instance] 实例不属于当前 World/Work')
  }
  const initialState = JSON.parse(session.initialStateJson) as ProductRuntimeState
  const sources = [
    session.productReleaseId != null,
    session.productBuildId != null,
  ].filter(Boolean).length
  if (sources !== 1) {
    throw new Error('[instance] 正式产品实例必须且只能绑定一个 Product Release/Build')
  }
  if (session.productReleaseId != null) {
    const verified = await verifyProductRuntimeSource({
      scope: resolved,
      source: { kind: 'release', productReleaseId: session.productReleaseId },
      ttrpgProtocol: session.kind === 'ttrpg' ? 2 : undefined,
    })
    if (verified.runtimeSourceHash !== session.runtimeSourceHash
      || initialState.narrative?.version !== 2
      || initialState.narrative.contentHash !== verified.runtimeSourceHash) {
      throw new Error('[instance] 产品发布来源越界或 RuntimePackage 已变化')
    }
  }
  if (session.productBuildId != null) {
    const build = await db.productBuilds.get(session.productBuildId)
    if (!build?.previewHash || !session.runtimeSourceHash) {
      throw new Error('[instance] 产品 Build 绑定缺失')
    }
    const verified = await verifyProductRuntimeSource({
      scope: resolved,
      source: {
        kind: 'build',
        productBuildId: build.id!,
        expectedPreviewHash: build.previewHash,
      },
      ttrpgProtocol: session.kind === 'ttrpg' ? 2 : undefined,
    })
    if (verified.runtimeSourceHash !== session.runtimeSourceHash
      || initialState.narrative?.version !== 2
      || initialState.narrative.contentHash !== verified.runtimeSourceHash) {
      throw new Error('[instance] 产品 Build 来源越界或 RuntimePackage 已变化')
    }
  }
  return session
}
