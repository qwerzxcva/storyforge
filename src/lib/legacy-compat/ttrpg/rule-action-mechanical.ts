/** Shared deterministic mechanical resolution; scheduling and authority stay with the format owner. */
import type { ProductRuntimeState, TtrpgRuntimeRuleActionResultV1 } from '../../types/index';
import { ttrpgAbilityStateKeyV2 } from './ability-ledger';
import { assertTtrpgCheck } from './runtime-state';
import { parseTtrpgAbilityRuntimeStateV2, parseTtrpgUsagePoolStateV2 } from './ability-ledger';
import * as p from './open-contract-parse'
import { stableProductRuntimeJsonV1 as stable } from '../product/runtime-values';

export type TtrpgMechanicalResultV1 = Pick<TtrpgRuntimeRuleActionResultV1, 'outcome' | 'check' | 'resourceChanges' | 'conditionChanges' | 'abilityChange'>

export function parseTtrpgMechanicalResultV1(value: unknown): TtrpgMechanicalResultV1 {
  const row = p.record(value, ['outcome', 'check', 'resourceChanges', 'conditionChanges', 'abilityChange'], 'mechanical result')
  const resourceChanges = p.list(row.resourceChanges, 'resource changes', value => {
    const r = p.record(value, ['entityKey', 'resourceKey', 'before', 'delta', 'after', 'maximum', 'proofHash'], 'resource change')
    const maximum = p.integer(r.maximum, 'resource maximum', 1, 1_000_000_000)
    return { entityKey: p.key(r.entityKey, 'resource entity'), resourceKey: p.key(r.resourceKey, 'resource key'),
      before: p.integer(r.before, 'resource before', 0, maximum), delta: p.integer(r.delta, 'resource delta', -1_000_000_000, 1_000_000_000),
      after: p.integer(r.after, 'resource after', 0, maximum), maximum, proofHash: p.nullable(r.proofHash, p.hash, 'proofHash') }
  }, 1000)
  const conditionChanges = p.list(row.conditionChanges, 'condition changes', value => {
    const r = p.record(value, ['entityKey', 'conditionKey', 'stacks', 'duration'], 'condition change')
    return { entityKey: p.key(r.entityKey, 'condition entity'), conditionKey: p.key(r.conditionKey, 'condition key'),
      stacks: p.integer(r.stacks, 'condition stacks', 0, 1000), duration: p.nullable(r.duration, (v, l) => p.integer(v, l, 0, 1_000_000), 'duration') }
  }, 1000)
  const abilityChange = row.abilityChange === null ? null : (() => {
    const r = p.record(row.abilityChange, ['stateKey', 'before', 'after', 'sharedPoolKey', 'sharedPoolBefore', 'sharedPoolAfter'], 'ability change')
    const before = parseTtrpgAbilityRuntimeStateV2(r.before), after = parseTtrpgAbilityRuntimeStateV2(r.after)
    const stateKey = ttrpgAbilityStateKeyV2(before.actorInstanceId, before.abilityKey)
    if (r.stateKey !== stateKey || after.actorInstanceId !== before.actorInstanceId || after.abilityKey !== before.abilityKey) p.fail('能力结果的复合身份不匹配')
    return { stateKey, before, after, sharedPoolKey: p.nullable(r.sharedPoolKey, p.key, 'shared pool key'),
      sharedPoolBefore: r.sharedPoolBefore === null ? null : parseTtrpgUsagePoolStateV2(r.sharedPoolBefore),
      sharedPoolAfter: r.sharedPoolAfter === null ? null : parseTtrpgUsagePoolStateV2(r.sharedPoolAfter) }
  })()
  return { outcome: p.oneOf(row.outcome, ['automatic', ...p.DEGREES], 'outcome'),
    check: row.check === null ? null : assertTtrpgCheck(row.check), resourceChanges, conditionChanges, abilityChange }
}

/** Mechanical owners alone receive final values; receipt/operation data are audit references. */
export function applyTtrpgMechanicalResultV1(state: ProductRuntimeState, result: TtrpgMechanicalResultV1): void {
  const product = state.ttrpg?.product
  if (!product?.sessionZero.completed) throw new Error('[ttrpg] mechanical state missing')
  for (const change of result.resourceChanges) {
    const entity = state.entities[change.entityKey]
    if (!entity) throw new Error(`正式规则资源目标不存在:${change.entityKey}`)
    if (entity.attributes[`resource.${change.resourceKey}`] !== change.before
      || entity.attributes[`resourceMax.${change.resourceKey}`] !== change.maximum
      || change.after !== Math.max(0, Math.min(change.maximum, change.before + change.delta))) throw new Error(`正式规则资源变化与当前状态不一致:${change.resourceKey}`)
    entity.attributes[`resource.${change.resourceKey}`] = change.after
    if (change.resourceKey === 'vigor') entity.attributes.hp = change.after
  }
  for (const change of result.conditionChanges) {
    if (!state.entities[change.entityKey]) throw new Error(`正式规则状态目标不存在:${change.entityKey}`)
    const without = (product.conditions[change.entityKey] ?? []).filter(condition => condition.conditionKey !== change.conditionKey)
    product.conditions[change.entityKey] = change.stacks > 0 ? [...without, {
      conditionKey: change.conditionKey, stacks: change.stacks, duration: change.duration }] : without
  }
  const change = result.abilityChange
  if (change) {
    if (stable(product.abilityStates[change.stateKey]) !== stable(change.before)) throw new Error('正式规则行动的能力账本基线不一致。')
    product.abilityStates[change.stateKey] = structuredClone(change.after)
    if (change.sharedPoolKey !== null) {
      if (stable(product.usagePools[change.sharedPoolKey]) !== stable(change.sharedPoolBefore) || !change.sharedPoolAfter) throw new Error('正式规则行动的共享次数池基线不一致。')
      product.usagePools[change.sharedPoolKey] = structuredClone(change.sharedPoolAfter)
    }
  }
}
