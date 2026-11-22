import type { NarrativeCondition, ProductRuntimeState } from '../../types/index';
import { applyNarrativeEffects, evaluateNarrativeCondition } from '../../narrative/blueprint';
import { avgItemActionPathV1, avgItemPathV1, AVG_UNHELD_V1, type AvgInventoryPlanV1 } from './inventory-contract';
import { avgInventoryValuesV1 } from './inventory-state';
import { assertAvgSystemStateV1, previewAvgSystemEffectsV1 } from './system-state';
import { canonicalProductProductionJsonV2 } from '../product-production/hash';
import { avgKey, avgRecord } from './protocol-validation';

function context(state: ProductRuntimeState): Record<string, unknown> {
  return { ...state.narrative!.variables, __visitedNodeKeys: state.narrative!.visitedNodeKeys,
    __selectedChoiceKeys: (state.narrative!.choiceHistory ?? []).map(h => h.choiceKey) }
}
function visible(predicate: NarrativeCondition, state: ProductRuntimeState): boolean { return evaluateNarrativeCondition(predicate, context(state)) }
function inventory(state: ProductRuntimeState): AvgInventoryPlanV1 | null { return state.avgRules?.systemPlan.version === 2 ? state.avgRules.systemPlan.inventory : null }
function availability(state: ProductRuntimeState, action: AvgInventoryPlanV1['actions'][number]): { visible: boolean; enabled: boolean; reason: string } {
  const plan = inventory(state)!, values = avgInventoryValuesV1(state.narrative!.variables), current = values.instances[action.instanceKey]
  const instance = plan.instances.find(i => i.key === action.instanceKey)!, item = plan.items.find(i => i.key === instance.itemKey)!
  const isVisible = !!state.narrative?.currentNodeKey && action.sceneKeys.includes(state.narrative.currentNodeKey)
    && visible(item.visibleWhen, state) && visible(action.visibleWhen, state)
  const owned = action.verb === 'gain' ? current.holder === AVG_UNHELD_V1 && current.quantity === 0 : current.holder === 'player' && current.quantity > 0
  const performed = action.once && values.actions[action.key].performed || action.verb === 'inspect' && current.inspected
  const enabled = isVisible && !state.narrative!.completed && owned && !performed && visible(action.enabledWhen, state)
  return { visible: isVisible, enabled, reason: performed ? '已完成' : !owned ? '当前未持有该物件' : action.unavailableReason }
}
export function applyAvgInventoryActionV1(state: ProductRuntimeState, value: unknown): void {
  const plan = inventory(state)
  if (!plan || !state.narrative) throw new Error('[avg-inventory] 当前来源未启用物件模块')
  const payload = avgRecord(value, ['actionKey','target'], 'inventory command')
  const action = plan.actions.find(a => a.key === avgKey(payload.actionKey, 'item actionKey'))
  if (!action || canonicalProductProductionJsonV2(action.target) !== canonicalProductProductionJsonV2(payload.target)) throw new Error('[avg-inventory] 物件行动/目标与冻结规则不一致')
  const status = availability(state, action)
  if (!status.enabled) throw new Error(`[avg-inventory] 操作不可用：${status.reason}`)
  const before = avgInventoryValuesV1(state.narrative.variables).instances[action.instanceKey]
  let variables = previewAvgSystemEffectsV1(state.avgRules!.systemPlan, state.narrative.variables, action.effects)
  const after = avgInventoryValuesV1(variables).instances[action.instanceKey]
  if (action.verb === 'inspect' && canonicalProductProductionJsonV2(avgInventoryValuesV1(state.narrative.variables).instances) !== canonicalProductProductionJsonV2(avgInventoryValuesV1(variables).instances)) throw new Error('[avg-inventory] 查看不能改变持有物件；请声明独立操作')
  if (action.verb === 'gain' && (after.holder !== 'player' || after.quantity < 1)
    || action.verb === 'transfer' && (after.holder !== action.target!.key || after.quantity !== before.quantity)
    || action.verb === 'change-state' && before.state === after.state
    || action.verb === 'remove' && after.quantity >= before.quantity) throw new Error('[avg-inventory] 操作后果不符合声明的物件语义')
  variables = applyNarrativeEffects([
    { op: 'set', path: avgItemActionPathV1(action.key), value: true },
    ...(action.verb === 'inspect' ? [{ op: 'set' as const, path: avgItemPathV1(action.instanceKey, 'inspected'), value: true }] : []),
  ], variables)
  assertAvgSystemStateV1(state.avgRules!.systemPlan, variables)
  state.narrative.variables = variables
  // No scene entry, beat completion, Cue restart or choice-history fabrication.
}
