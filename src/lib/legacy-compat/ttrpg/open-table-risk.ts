
/** Human-only display of a frozen plan. Never exposes the frozen plan itself. */
import type { ProductRuntimeState, TtrpgEffectPrimitiveV2 } from '../../types/index';
import type { TtrpgOpenOperationV1 } from './open-operation';
import type { TtrpgOpenEffectPrimitiveV1 } from './open-contract';
const operations: Record<string, string> = { 'resource.gain': '增加', 'resource.spend': '消耗', 'resource.set': '设为', damage: '伤害', healing: '治疗', stress: '压力变化', currency: '货币变化', 'condition.apply': '添加状态', 'condition.remove': '移除状态', 'item.grant': '获得物品', 'item.remove': '移除物品', 'item.transfer': '转交物品', 'item.use': '使用物品', 'item.damage': '损坏物品', 'item.repair': '修复物品', 'item.equip': '装备物品', 'ability.unlock': '解锁能力', 'ability.disable': '禁用能力', 'usage.consume': '消耗次数', 'usage.restore': '恢复次数', 'usage.reset': '重置次数', 'cooldown.start': '开始冷却', 'cooldown.clear': '清除冷却' }
export function describeTtrpgOpenHumanEffectV1(input: {
  state: ProductRuntimeState; rules: TtrpgOpenOperationV1['plan']['rulePack']; actorKey: string;
  effect: TtrpgOpenEffectPrimitiveV1 | TtrpgEffectPrimitiveV2; bindings: Record<string, string | null>; name: (ref: string | null) => string | null; host?: boolean
}) {
  const { state, rules, actorKey, effect, bindings, name, host = false } = input
  let reviewable = true
  const hidden = () => { reviewable = false;return '有待主持人审查的后果' }
  const resource = (key: string) => rules.resources.find(r => r.key === key)?.name ?? null
  const condition = (key: string) => rules.conditions.find(c => c.key === key)?.name ?? null
  const describe = () => {
    const ref = effect.targetRef.startsWith('parameter:') ? bindings[effect.targetRef.slice(10)] : effect.targetRef
    if (ref === null) return '此可选参数未绑定，不产生后果'
    const target = ref ? name(ref) : null
    if (!target) return hidden()
    const verb = operations[effect.operation]
    if (effect.family === 'numeric') { const label = resource(effect.valueKey);return label && verb ? `${target}：${label}${verb} ${effect.amount}` : hidden() }
    if (effect.family === 'condition') { const label = condition(effect.conditionKey);return label && verb ? `${target}：${verb}「${label}」${effect.stacks} 层，持续${effect.duration === null ? '至明确解除' : `${effect.duration} 轮`}` : hidden() }
    if (effect.family === 'ability') { const label = rules.actions.find(a => a.key === effect.abilityKey)?.name;return label && verb && (effect.clockRef === null || host) ? `${target}：${label}${verb}${effect.amount === null ? '' : ` ${effect.amount}`}` : hidden() }
    if (effect.family === 'knowledge' && effect.operation === 'knowledge.discover') return `${target}：获得一条线索；内容仅在合法发现后向接收者展示`
    if (effect.family === 'item') {
      const item = effect.itemInstanceRef ? state.ttrpg!.product.inventory.items[effect.itemInstanceRef] : null
      const definition = effect.itemDefinitionRef ?? item?.definitionRef, defined = rules.items.find(i => i.key === definition)
      // The inventory kernel grants identified items; existing unknown items retain their boundary.
      const label = defined ? host || effect.operation === 'item.grant' || item?.ownerRef === actorKey && item.identification === 'identified' ? defined.name : '尚未辨识的物品' : null
      const destination = effect.destinationRef === null ? null : name(effect.destinationRef)
      return label && verb && (effect.destinationRef === null || destination) ? `${target}：${verb}「${label}」×${effect.amount}${destination ? `，接收者：${destination}` : ''}` : hidden()
    }
    if (host && effect.family === 'advancement') return `${target}：${effect.operation}（${effect.advancementKey}）变化 ${effect.amount}`
    if (host && effect.family === 'social') return `${target}：${effect.operation}（${effect.socialKey}）变化 ${effect.amount}`
    if (effect.family === 'story' && effect.operation === 'location.set' && typeof effect.value === 'string') { const destination = name(effect.value);return destination ? `${target}：前往${destination}` : hidden() }
    return hidden()
  }
  const text = describe()
  return { text, reviewable }
}
