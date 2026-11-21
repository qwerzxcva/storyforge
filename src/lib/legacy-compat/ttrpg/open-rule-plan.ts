import { ttrpgOpenEntityIdentityCatalogV1 } from './open-entity-catalog';
import { ttrpgOpenSituationCatalogV1 } from './open-session-situation-catalog';
import { parseTtrpgOpenInteractionBindingV1, assertTtrpgOpenInteractionActionV1 } from './open-interaction';
import { projectTtrpgOpenWorldFactsV1 } from './open-fact-authority';
import { ttrpgOpenSessionFactsV1 } from './open-fact-ledger';
import { parseTtrpgOpenDiscoveryPlanV1, type TtrpgOpenDiscoveryPlanV1 } from './open-knowledge-discovery';
import { parseTtrpgOpenRuleRequestV1, type TtrpgOpenRuleRequestV1 } from './open-rule-request-contract';
export { parseTtrpgOpenRuleRequestV1,type TtrpgOpenRuleRequestV1 } from './open-rule-request-contract'
/** Frozen deterministic rule admission. Model suggestions cannot set difficulty or costs. */
import type { ProductRuntimeState, RulePackV1 } from '../../types/index';
import type { TtrpgRuntimeContentV2 } from './content-version';
import type { TtrpgOpenGenericCheckV1, TtrpgOpenEffectPlanTemplateV1, TtrpgOpenInteractionBindingV1 } from './open-contract';
import { parseTtrpgRuntimeStateV2 } from './open-runtime-contract';
import { parseRulePackV1 } from './rule-pack';
import { projectTtrpgRulePackMechanicalCoreV1, parseTtrpgOpenGenericCheckV1 } from './rule-pack-v2';
import { effectTemplate } from './open-content-templates';
import { hashProductProductionValueV2 } from '../product-production/hash';
import { evaluateTtrpgActionRequirementsV2 } from './action-requirement';
import { consumeTtrpgAbilityV2, ttrpgAbilityStateKeyV2 } from './ability-ledger';
import { type TtrpgPredicateEvaluationContextV1 } from './predicate';
import * as p from './open-contract-parse'

export interface TtrpgOpenRulePlanV1 {
  schema: 'storyforge.ttrpg-open-rule-plan'
  version: 1
  request: TtrpgOpenRuleRequestV1
  epochKey: string
  rulePackContentHash: string
  runtimeSourceHash: string
  authorizationHash: string
  mechanicalStateHash: string
  rulePack: RulePackV1
  genericCheck: TtrpgOpenGenericCheckV1 | null
  effectTemplates: TtrpgOpenEffectPlanTemplateV1[]
  timeCostWorldTurns: number
  affectedActorKeys: string[]
  requiredApprovals: Array<{ actorKey: string; allowedSeatKeys: string[] }>
  skillValues: Record<string, number>
  rollVisibility: 'public' | 'gm-only'
  conditionTiming?: 'actor-action-v1'
  discoveryPlan?: TtrpgOpenDiscoveryPlanV1
  interaction?: TtrpgOpenInteractionBindingV1
  stageTimeLimit?: { openedAtWorldTurn: number; maximumWorldTurns: number }
}
function fail(message: string): never { throw new Error(`[ttrpg-open-rule-plan] ${message}`) }

/** Admission owners contribute; confirmations and display events do not stale a plan. */
export function projectTtrpgOpenMechanicalBasisV1(state: ProductRuntimeState) {
  const runtime = parseTtrpgRuntimeStateV2(state.ttrpg)
  if (!runtime?.openRun) fail('open 团局未启动')
  return { entities: state.entities, conditions: runtime.product.conditions,
    inventory: runtime.product.inventory, abilities: runtime.product.abilityStates, pools: runtime.product.usagePools,
    effectLedger: runtime.product.effectLedger, customizations: runtime.product.characterCustomizations,
    worldTime: runtime.openRun.worldTime, clocks: runtime.openRun.clocks, fronts: runtime.openRun.fronts,
    knowledge: runtime.openRun.knowledge,
    ...(runtime.openRun.factLedger ? { sessionFacts: ttrpgOpenSessionFactsV1(runtime.openRun.factLedger) } : {}),
    situations: runtime.openRun.situations, safetyStatus: runtime.product.safety.status }
}
export async function ttrpgOpenMechanicalStateHashV1(state: ProductRuntimeState): Promise<string> {
  return hashProductProductionValueV2(projectTtrpgOpenMechanicalBasisV1(state))
}

export function ttrpgOpenPredicateContextV1(state: ProductRuntimeState, content: TtrpgRuntimeContentV2): TtrpgPredicateEvaluationContextV1 {
  const runtime = parseTtrpgRuntimeStateV2(state.ttrpg)
  if (!runtime?.openRun) fail('open 团局未启动')
  const product = runtime.product
  const rulePack = projectTtrpgRulePackMechanicalCoreV1(content.rulePack.content)
  const sessionFacts = ttrpgOpenSessionFactsV1(runtime.openRun.factLedger)
  const availableAbilityKeys = (actorKey: string, granted: readonly string[]) => granted.filter(abilityKey => {
    const actor = state.entities[actorKey]
    const action = rulePack.actions.find(action => action.key === abilityKey)
    const ability = product.abilityStates[ttrpgAbilityStateKeyV2(actorKey, abilityKey)]
    if (!actor || !action || !ability) fail('能力谓词缺少冻结定义或当前账本')
    if (ability.actorInstanceId !== actorKey || ability.abilityKey !== abilityKey) fail('能力谓词账本身份不匹配')
    if (action.usage.mode === 'shared-pool') {
      const pool = product.usagePools[action.usage.sharedPoolKey!]
      if (!pool || pool.poolKey !== action.usage.sharedPoolKey) fail('能力谓词共享池身份不匹配')
    }
    if (actor.lifecycleStatus !== 'active' || product.safety.status !== 'active'
      || !evaluateTtrpgActionRequirementsV2({ action, rulePack, actorAttributes: actor.attributes, actorConditions: product.conditions[actorKey] }).met) return false
    try {
      const use = consumeTtrpgAbilityV2({ definition: { abilityKey, actionDefinitionKey: abilityKey, usage: action.usage }, state: ability,
        eventId: 'predicate.preflight', currentRound: runtime.openRun!.worldTime.worldTurn,
        resourceCurrent: action.usage.resourceKey === null ? null : Number(actor.attributes[`resource.${action.usage.resourceKey}`]),
        sharedPool: action.usage.sharedPoolKey === null ? null : product.usagePools[action.usage.sharedPoolKey] ?? null })
      if (action.costResourceKey !== null) {
        const current = actor.attributes[`resource.${action.costResourceKey}`]
        const required = action.costAmount + (action.costResourceKey === action.usage.resourceKey ? Math.max(0, -use.resourceDelta) : 0)
        if (typeof current !== 'number' || !Number.isSafeInteger(current) || current < required) return false
      }
      return true
    } catch (error) {
      if (error instanceof Error && /^\[ttrpg-ability\].*(已禁用|耗尽|资源不足|共享次数池不足|冷却)/u.test(error.message)) return false
      throw error
    }
  })
  return {
    frozenWorldPredicateIndex: content.campaign.frozenWorldPredicateIndex,
    sessionFacts,
    knowledge: runtime.openRun.knowledge,
    worldFacts: projectTtrpgOpenWorldFactsV1({ state, content, sessionFacts }),
    effectLedger: { storyFacts: product.effectLedger.storyFacts, socialBalances: product.effectLedger.socialBalances },
    pressure: {
      clocks: Object.fromEntries(runtime.openRun.clocks.map(clock => [clock.clockKey, { value: clock.value }])),
      fronts: Object.fromEntries(runtime.openRun.fronts.map(front => [front.frontKey, { currentStageKey: front.stageKey,
        escalationStages: content.campaign.fronts.find(definition => definition.frontKey === front.frontKey)?.escalationStages ?? [] }])),
    },
    actors: Object.fromEntries(ttrpgOpenEntityIdentityCatalogV1(content, runtime.openRun.entityOperations ?? []).filter(row => row.kind === 'actor').map(identity => {
      const actor = content.campaign.characterTemplates.find(row => row.characterKey === identity.templateKey)!
      return [identity.entityKey, {
      locationRef: state.entities[identity.entityKey]?.locationKey ?? null,
      itemKeys: Object.values(product.inventory.items).filter(item => item.ownerRef === identity.entityKey && item.quantity > 0 && !item.stateTags.includes('broken'))
        .flatMap(item => [item.itemInstanceId, item.definitionRef]),
      abilityKeys: availableAbilityKeys(identity.entityKey, [...new Set([...actor.actionKeys,
        ...Object.values(product.inventory.items).filter(item => item.ownerRef === identity.entityKey && item.quantity > 0 && !item.stateTags.includes('broken'))
          .flatMap(item => rulePack.items.find(definition => definition.key === item.definitionRef)?.grantedActionKeys ?? [])])]),
      resources: Object.fromEntries(content.rulePack.content.resources.map(resource => [resource.key,
        Number(state.entities[identity.entityKey]?.attributes[`resource.${resource.key}`])])),
    }]
    })),
    situations: { active: runtime.openRun.situations.active, templates: ttrpgOpenSituationCatalogV1(content.campaign, runtime.openRun).templates },
    chaos: runtime.openRun.chaos.value, worldTurn: runtime.openRun.worldTime.worldTurn,
    // Existence and current availability are separate: an exhausted/condition-blocked frozen ability is a valid false predicate.
    knownRefs: [...new Set([...ttrpgOpenSituationCatalogV1(content.campaign, runtime.openRun).templates.map(t => t.templateKey), ...ttrpgOpenEntityIdentityCatalogV1(content, runtime.openRun.entityOperations ?? []).map(binding => binding.entityKey),
      ...rulePack.actions.map(action => action.key), ...rulePack.items.map(item => item.key), ...rulePack.resources.map(resource => resource.key)])],
  }
}

export function parseTtrpgOpenRulePlanV1(value: unknown): TtrpgOpenRulePlanV1 {
  const hasInteraction = value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value,'interaction')
  const hasDiscovery = value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'discoveryPlan')
  const hasStageLimit = value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'stageTimeLimit')
  const hasConditionTiming = value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'conditionTiming')
  const r = p.record(value, ['schema', 'version', 'request', 'epochKey', 'rulePackContentHash', 'runtimeSourceHash',
    'authorizationHash', 'mechanicalStateHash', 'rulePack', 'genericCheck', 'effectTemplates', 'timeCostWorldTurns',
    'affectedActorKeys', 'requiredApprovals', 'skillValues', 'rollVisibility', ...(hasDiscovery ? ['discoveryPlan'] : []), ...(hasStageLimit ? ['stageTimeLimit'] : []),...(hasConditionTiming ? ['conditionTiming'] : []),...(hasInteraction ? ['interaction'] : [])], 'rule plan')
  p.literal(r.schema, 'storyforge.ttrpg-open-rule-plan', 'schema'); p.literal(r.version, 1, 'version')
  const request = parseTtrpgOpenRuleRequestV1(r.request), rulePack = parseRulePackV1(r.rulePack)
  const interaction = hasInteraction ? parseTtrpgOpenInteractionBindingV1(r.interaction) : undefined
  if (Boolean(request.interactionKey) !== Boolean(interaction) || interaction && (interaction.interactionKey !== request.interactionKey || interaction.actionKey !== request.ruleKey || r.timeCostWorldTurns !== interaction.timeCostWorldTurns)) fail('互动计划未绑定原请求/行动/耗时')
  if (interaction) { assertTtrpgOpenInteractionActionV1(interaction,rulePack);if (interaction.kind === 'retreat' && request.controllerMode !== 'human') fail('撤退须由真人发起') }
  const genericCheck = r.genericCheck === null ? null : parseTtrpgOpenGenericCheckV1(r.genericCheck, 'genericCheck', rulePack)
  if ((request.route === 'generic-check') !== (genericCheck !== null)
    || (genericCheck !== null && request.ruleKey !== genericCheck.checkKey)
    || (request.route === 'existing-action' && !rulePack.actions.some(action => action.key === request.ruleKey))) fail('规则路由与冻结定义不一致')
  const affectedActorKeys = p.keys(r.affectedActorKeys, 'affectedActorKeys', 1000, 1)
  const requiredApprovals = p.list(r.requiredApprovals, 'requiredApprovals', value => {
    const a = p.record(value, ['actorKey', 'allowedSeatKeys'], 'required approval')
    return { actorKey: p.key(a.actorKey, 'approval actor'), allowedSeatKeys: p.keys(a.allowedSeatKeys, 'allowedSeatKeys', 1000, 1) }
  }, 1000, 1)
  if (new Set(requiredApprovals.map(approval => approval.actorKey)).size !== requiredApprovals.length) fail('批准要求重复')
  const effectTemplates = p.list(r.effectTemplates, 'effectTemplates', effectTemplate, 7)
  if (interaction && (effectTemplates.map(t => t.planKey).join(',') !== (interaction.effectPlanRef ?? '') || effectTemplates.some(t => t.degree !== 'success'))) fail('互动效果必须精确来自冻结成功模板')
  const discoveryPlan = hasDiscovery ? parseTtrpgOpenDiscoveryPlanV1(r.discoveryPlan) : undefined
  if (Boolean(request.discovery) !== Boolean(discoveryPlan) || (discoveryPlan && (JSON.stringify(request.discovery) !== JSON.stringify(discoveryPlan.request)
    || request.actorKey !== discoveryPlan.actorKey || request.route !== discoveryPlan.route || request.ruleKey !== discoveryPlan.ruleKey
    || discoveryPlan.frozenContent.rulePack.contentHash !== r.rulePackContentHash))) fail('发现计划必须绑定本次真实规则请求')
  const limit = hasStageLimit ? p.record(r.stageTimeLimit, ['openedAtWorldTurn', 'maximumWorldTurns'], 'stage time limit') : undefined
  const stageTimeLimit = limit ? { openedAtWorldTurn: p.integer(limit.openedAtWorldTurn, 'stage opened turn'), maximumWorldTurns: p.integer(limit.maximumWorldTurns, 'stage maximum', 10, 1000) } : undefined
  if (stageTimeLimit && stageTimeLimit.openedAtWorldTurn >= stageTimeLimit.maximumWorldTurns) fail('阶段起点必须早于绝对最大世界轮次')
  return { schema: 'storyforge.ttrpg-open-rule-plan', version: 1,...(interaction ? { interaction } : {}),request, rulePack, genericCheck, effectTemplates,
    epochKey: p.key(r.epochKey, 'epochKey'), rulePackContentHash: p.hash(r.rulePackContentHash, 'rule hash'),
    runtimeSourceHash: p.hash(r.runtimeSourceHash, 'source hash'), authorizationHash: p.hash(r.authorizationHash, 'authorization hash'),
    mechanicalStateHash: p.hash(r.mechanicalStateHash, 'mechanical hash'),
    timeCostWorldTurns: p.integer(r.timeCostWorldTurns, 'time cost', 0, 10), affectedActorKeys, requiredApprovals,
    skillValues: p.numericRecord(r.skillValues, 'skillValues'), rollVisibility: p.oneOf(r.rollVisibility, ['public', 'gm-only'], 'roll visibility'),
    ...(hasConditionTiming ? { conditionTiming: p.oneOf(r.conditionTiming, ['actor-action-v1'], 'condition timing') } : {}),
    ...(discoveryPlan ? { discoveryPlan } : {}), ...(stageTimeLimit ? { stageTimeLimit } : {}) }
}
