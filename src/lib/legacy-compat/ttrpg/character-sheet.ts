import type { RulePackV1, TtrpgCharacterProgressionModelV2, TtrpgCharacterSheetV2, TtrpgCharacterTemplateV1 } from '../../types/index';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
type CharacterSheetTemplateV2 = Omit<TtrpgCharacterTemplateV1, 'characterSheet' | 'controller'> & {
  controller: TtrpgCharacterTemplateV1['controller'] | 'hybrid'
}

function fail(message: string): never { throw new Error(`[ttrpg-character-sheet] ${message}`) }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
  return value as Record<string, unknown>
}
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} 字段不精确:${actual.join(',')}`)
  }
}
function text(value: unknown, label: string, maximum = 20_000): string {
  if (typeof value !== 'string') fail(`${label} 必须是字符串`)
  const normalized = value.trim().normalize('NFC')
  if (!normalized || normalized.length > maximum) fail(`${label} 为空或过长`)
  return normalized
}
function key(value: unknown, label: string): string {
  const result = text(value, label, 200)
  if (!KEY.test(result)) fail(`${label} 不是稳定 key`)
  return result
}
function stringList(value: unknown, label: string, maximum = 100, allowEmpty = true): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} 必须是有界数组`)
  const result = value.map((item, index) => text(item, `${label}[${index}]`, 2_000))
  if (!allowEmpty && result.length === 0) fail(`${label} 不得为空`)
  if (new Set(result).size !== result.length) fail(`${label} 不允许重复`)
  return result
}
function keyList(value: unknown, label: string, maximum = 256): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} 必须是有界数组`)
  const result = value.map((item, index) => key(item, `${label}[${index}]`))
  if (new Set(result).size !== result.length) fail(`${label} 不允许重复`)
  return result
}
function numericRecord(value: unknown, label: string, minimum = 0): Record<string, number> {
  const row = record(value, label)
  if (Object.keys(row).length > 256) fail(`${label} 字段过多`)
  return Object.fromEntries(Object.entries(row).map(([entryKey, raw]) => {
    key(entryKey, `${label}.key`)
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < minimum || raw > 1_000_000) {
      fail(`${label}.${entryKey} 数值无效`)
    }
    return [entryKey, raw]
  }))
}
function sameRecord(left: Record<string, number>, right: Record<string, number>): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
  return keys.every(entryKey => left[entryKey] === right[entryKey])
}
function sameKeys(left: string[], right: string[]): boolean {
  return [...left].sort().join('\u0000') === [...right].sort().join('\u0000')
}

export function parseTtrpgCharacterSheetV2(
  value: unknown,
  template: CharacterSheetTemplateV2,
  rulePack: RulePackV1,
): TtrpgCharacterSheetV2 {
  const root = record(value, 'characterSheet')
  exact(root, ['schema', 'version', 'characterKey', 'identity', 'rules', 'authoring', 'gates'], 'characterSheet')
  if (root.schema !== 'storyforge.ttrpg-character-sheet' || root.version !== 2) fail('schema/version 无效')
  if (key(root.characterKey, 'characterSheet.characterKey') !== template.characterKey) fail('characterKey 与角色模板不一致')

  const identity = record(root.identity, 'characterSheet.identity')
  exact(identity, [
    'name', 'pronouns', 'gender', 'age', 'ancestry', 'occupation', 'appearance', 'origin', 'background',
    'personalityTraits', 'beliefs', 'flaws', 'fears', 'desires', 'boundaries', 'shortTermGoal', 'longTermGoal',
    'publicKnowledge', 'privateKnowledge', 'safetyNotes', 'portrayal', 'voice', 'sampleLines', 'relationships', 'worldBindings',
  ], 'characterSheet.identity')
  const requiredIdentityTexts = [
    'name', 'pronouns', 'gender', 'age', 'ancestry', 'occupation', 'appearance', 'origin', 'background',
    'shortTermGoal', 'longTermGoal', 'portrayal', 'voice',
  ] as const
  for (const field of requiredIdentityTexts) text(identity[field], `characterSheet.identity.${field}`)
  if (text(identity.name, 'characterSheet.identity.name', 300) !== template.name) fail('身份姓名与角色模板不一致')
  for (const field of ['personalityTraits', 'beliefs', 'flaws', 'fears', 'desires', 'boundaries', 'publicKnowledge', 'privateKnowledge', 'safetyNotes', 'sampleLines'] as const) {
    stringList(identity[field], `characterSheet.identity.${field}`, 100, true)
  }
  const publicKnowledge = stringList(identity.publicKnowledge, 'characterSheet.identity.publicKnowledge')
  const privateKnowledge = stringList(identity.privateKnowledge, 'characterSheet.identity.privateKnowledge')
  if (privateKnowledge.some(item => publicKnowledge.includes(item))) fail('同一知识不能同时标为公开和私密')
  if (!Array.isArray(identity.relationships) || identity.relationships.length > 100) fail('relationships 必须是有界数组')
  const relationshipKeys = identity.relationships.map((raw, index) => {
    const row = record(raw, `relationships[${index}]`)
    exact(row, ['targetRef', 'label', 'bond', 'visibility'], `relationships[${index}]`)
    const targetRef = text(row.targetRef, 'relationship.targetRef', 300)
    const label = text(row.label, 'relationship.label', 300)
    text(row.bond, 'relationship.bond', 2_000)
    if (!['public', 'private', 'gm-only'].includes(String(row.visibility))) fail('relationship.visibility 无效')
    return `${targetRef}\u0000${label}`
  })
  if (new Set(relationshipKeys).size !== relationshipKeys.length) fail('relationships 不允许重复')
  if (!Array.isArray(identity.worldBindings) || identity.worldBindings.length > 100) fail('worldBindings 必须是有界数组')
  identity.worldBindings.forEach((raw, index) => {
    const row = record(raw, `worldBindings[${index}]`)
    exact(row, ['kind', 'key', 'label', 'sourceRefs'], `worldBindings[${index}]`)
    if (!['character', 'location', 'faction', 'artifact', 'event', 'lore', 'custom'].includes(String(row.kind))) fail('worldBinding.kind 无效')
    key(row.key, 'worldBinding.key')
    text(row.label, 'worldBinding.label', 500)
    keyList(row.sourceRefs, 'worldBinding.sourceRefs', 100)
  })

  const rules = record(root.rules, 'characterSheet.rules')
  exact(rules, ['progression', 'attributes', 'skills', 'resourceKeys', 'defenseKeys', 'proficiencyKeys', 'abilityKeys', 'itemKeys', 'currency'], 'characterSheet.rules')
  const attributes = numericRecord(rules.attributes, 'characterSheet.rules.attributes', -1_000_000)
  const skills = numericRecord(rules.skills, 'characterSheet.rules.skills')
  if (!sameRecord(attributes, template.attributes)) fail('角色卡属性与角色模板机械权限不一致')
  if (!sameRecord(skills, template.skills)) fail('角色卡技能与角色模板机械权限不一致')
  const resourceKeys = keyList(rules.resourceKeys, 'characterSheet.rules.resourceKeys')
  const defenseKeys = keyList(rules.defenseKeys, 'characterSheet.rules.defenseKeys')
  const proficiencyKeys = keyList(rules.proficiencyKeys, 'characterSheet.rules.proficiencyKeys')
  const abilityKeys = keyList(rules.abilityKeys, 'characterSheet.rules.abilityKeys')
  const itemKeys = keyList(rules.itemKeys, 'characterSheet.rules.itemKeys')
  if (!sameKeys(resourceKeys, Object.keys(template.resources))) fail('角色卡资源与角色模板不一致')
  if (defenseKeys.some(entryKey => !rulePack.derivedStats.some(item => item.key === entryKey))) fail('角色卡引用未知防御/派生值')
  if (!sameKeys(abilityKeys, template.actionKeys)) fail('角色卡能力权限与角色模板不一致')
  if (!sameKeys(itemKeys, template.itemKeys)) fail('角色卡物品权限与角色模板不一致')
  proficiencyKeys.forEach(entryKey => key(entryKey, 'proficiencyKey'))
  const currency = numericRecord(rules.currency, 'characterSheet.rules.currency')
  if (Object.keys(currency).length !== 1 || currency[rulePack.advancement.currencyKey] == null) fail('角色卡成长货币与 RulePack 不一致')
  const progression = record(rules.progression, 'characterSheet.rules.progression')
  exact(progression, ['model', 'level', 'rankKey', 'experience', 'unspentPoints'], 'characterSheet.rules.progression')
  const model = String(progression.model) as TtrpgCharacterProgressionModelV2
  if (!['numeric-level', 'rank', 'point-buy', 'classless'].includes(model)) fail('progression.model 无效')
  if (!Number.isInteger(progression.experience) || Number(progression.experience) < 0
    || !Number.isInteger(progression.unspentPoints) || Number(progression.unspentPoints) < 0) fail('成长点必须是非负整数')
  if (model === 'numeric-level') {
    if (!Number.isInteger(progression.level) || Number(progression.level) < 1 || progression.rankKey !== null) fail('等级制成长字段无效')
  } else if (model === 'rank') {
    const rankOrder = rulePack.advancement.rankOrder?.length ? rulePack.advancement.rankOrder : ['D', 'C', 'B', 'A']
    if (progression.level !== null || !rankOrder.includes(String(progression.rankKey))) fail('阶位制成长字段无效')
  } else if (progression.level !== null || progression.rankKey !== null) fail('无等级成长不能携带 level/rankKey')

  const authoring = record(root.authoring, 'characterSheet.authoring')
  exact(authoring, ['mode', 'rationale', 'sourceRefs', 'license', 'lockedFields'], 'characterSheet.authoring')
  if (!['manual', 'guided', 'ai', 'world-conversion'].includes(String(authoring.mode))) fail('authoring.mode 无效')
  text(authoring.rationale, 'authoring.rationale')
  text(authoring.license, 'authoring.license', 500)
  const sourceRefs = keyList(authoring.sourceRefs, 'authoring.sourceRefs', 100)
  if (template.sourceRefs.some(ref => !sourceRefs.includes(ref))) fail('角色卡缺少模板来源引用')
  stringList(authoring.lockedFields, 'authoring.lockedFields', 100)

  const gates = record(root.gates, 'characterSheet.gates')
  exact(gates, ['characterComplete', 'ruleLegal', 'playableRole', 'secretScope', 'validatedAgainst'], 'characterSheet.gates')
  if (gates.characterComplete !== true || gates.ruleLegal !== true || gates.playableRole !== true || gates.secretScope !== true) {
    fail('角色卡四项发布门未全部通过')
  }
  if (text(gates.validatedAgainst, 'gates.validatedAgainst', 300) !== `${rulePack.ruleSystemId}@${rulePack.ruleSystemVersion}`) {
    fail('角色卡没有绑定当前冻结 RulePack')
  }
  return structuredClone(root) as unknown as TtrpgCharacterSheetV2
}
