import type { RulePackV1, TtrpgCampaignContentV1, TtrpgCharacterTemplateV1 } from '../../types/index';
import { isSha256Hash } from '../product-production/hash';
import { parseRulePackV1 } from './rule-pack';
import { parseTtrpgCharacterSheetV2 } from './character-sheet';
import { parseTtrpgMediaManifestV1, parseTtrpgVisualBibleV1 } from './media-contract';

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

function fail(message: string): never {
  throw new Error(`[ttrpg-campaign] ${message}`)
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || expected.some((key, index) => key !== actual[index])) {
    fail(`${label} 字段不精确:${actual.join(',')}`)
  }
}

function text(value: unknown, label: string, maximum = 20_000): string {
  if (typeof value !== 'string') fail(`${label} 必须是字符串`)
  const result = value.trim().normalize('NFC')
  if (!result || result.length > maximum) fail(`${label} 为空或过长`)
  return result
}

function stableKey(value: unknown, label: string): string {
  const result = text(value, label, 200)
  if (!KEY.test(result)) fail(`${label} 不是稳定 key`)
  return result
}

function finite(value: unknown, label: string, minimum = -1_000_000, maximum = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${label} 数值无效`)
  return value
}

function integer(value: unknown, label: string, minimum = 0, maximum = 1_000_000): number {
  const result = finite(value, label, minimum, maximum)
  if (!Number.isInteger(result)) fail(`${label} 必须是整数`)
  return result
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} 必须是 boolean`)
  return value
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) fail(`${label} 枚举无效`)
  return value as T
}

function array(value: unknown, label: string, maximum = 1_000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} 必须是有界数组`)
  return value
}

function keyArray(value: unknown, label: string, maximum = 1_000): string[] {
  const result = array(value, label, maximum).map((item, index) => stableKey(item, `${label}[${index}]`))
  if (new Set(result).size !== result.length) fail(`${label} 不允许重复`)
  return result
}

function textArray(value: unknown, label: string, maximum = 1_000): string[] {
  const result = array(value, label, maximum).map((item, index) => text(item, `${label}[${index}]`, 2_000))
  if (new Set(result).size !== result.length) fail(`${label} 不允许重复`)
  return result
}

function numericRecord(value: unknown, label: string): Record<string, number> {
  const row = object(value, label)
  if (Object.keys(row).length > 256) fail(`${label} 字段过多`)
  return Object.fromEntries(Object.entries(row).map(([field, number]) => [
    stableKey(field, `${label}.key`), finite(number, `${label}.${field}`),
  ]))
}

function nullableKey(value: unknown, label: string): string | null {
  return value == null ? null : stableKey(value, label)
}

function validateKnown(values: string[], known: Set<string>, label: string): void {
  const missing = values.filter(value => !known.has(value))
  if (missing.length) fail(`${label} 引用了未知 key:${missing.join(',')}`)
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} key 重复`)
}

export function parseTtrpgCampaignContentV1(
  value: string | unknown,
  rulePackValue: RulePackV1 | unknown,
): TtrpgCampaignContentV1 {
  const rulePack = parseRulePackV1(rulePackValue)
  let raw: unknown = value
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { fail('不是合法 JSON') }
  }
  const root = object(raw, 'campaign')
  const rootFields = [
    'schema', 'version', 'campaignKey', 'title', 'pitch', 'playerCount', 'estimatedMinutes', 'tags',
    'difficulty', 'contentWarnings', 'sessionZero', 'openingSceneKey', 'characterTemplates', 'scenes',
    'clues', 'quests', 'endings', 'handouts', 'advancementMilestones', 'sourceWorld', 'gmMode',
    'informationPolicy', 'bible', 'clocks', 'fronts', 'secrets', 'designProvenance', 'tabletop',
    'visualBible', 'mediaManifest',
  ]
  exact(root, rootFields, 'campaign')
  if (root.schema !== 'storyforge.ttrpg-campaign' || root.version !== 1) fail('schema/version 无效')
  stableKey(root.campaignKey, 'campaignKey')
  enumValue(root.gmMode, ['human', 'ai', 'hybrid'] as const, 'gmMode')
  text(root.title, 'title', 300)
  text(root.pitch, 'pitch', 10_000)
  const playerCount = object(root.playerCount, 'playerCount')
  exact(playerCount, ['minimum', 'maximum'], 'playerCount')
  const minimumPlayers = integer(playerCount.minimum, 'playerCount.minimum', 1, 20)
  const maximumPlayers = integer(playerCount.maximum, 'playerCount.maximum', 1, 20)
  if (minimumPlayers > maximumPlayers) fail('playerCount 范围无效')
  integer(root.estimatedMinutes, 'estimatedMinutes', 15, 100_000)
  textArray(root.tags, 'tags', 100)
  enumValue(root.difficulty, ['introductory', 'standard', 'challenging'] as const, 'difficulty')
  textArray(root.contentWarnings, 'contentWarnings', 100)

  const sessionZero = object(root.sessionZero, 'sessionZero')
  exact(sessionZero, ['premise', 'consentChecklist', 'lines', 'veils', 'pauseSignal', 'openDoor'], 'sessionZero')
  text(sessionZero.premise, 'sessionZero.premise')
  const consent = textArray(sessionZero.consentChecklist, 'sessionZero.consentChecklist', 100)
  if (!consent.length) fail('sessionZero.consentChecklist 不得为空')
  textArray(sessionZero.lines, 'sessionZero.lines', 100)
  textArray(sessionZero.veils, 'sessionZero.veils', 100)
  text(sessionZero.pauseSignal, 'sessionZero.pauseSignal', 200)
  bool(sessionZero.openDoor, 'sessionZero.openDoor')

  const bible = object(root.bible, 'bible')
  exact(bible, ['premise', 'background', 'coreConflict', 'themes', 'canonInvariants', 'sourceRefs'], 'bible')
  text(bible.premise, 'bible.premise')
  text(bible.background, 'bible.background')
  text(bible.coreConflict, 'bible.coreConflict')
  textArray(bible.themes, 'bible.themes', 100)
  const invariants = textArray(bible.canonInvariants, 'bible.canonInvariants', 200)
  if (!invariants.length) fail('bible.canonInvariants 不得为空')
  const bibleSources = keyArray(bible.sourceRefs, 'bible.sourceRefs', 200)
  if (!bibleSources.length) fail('bible.sourceRefs 不得为空')

  const provenance = object(root.designProvenance, 'designProvenance')
  exact(provenance, ['origin', 'proposalKeys', 'baseProposalKey', 'sectionSources', 'lockedSections', 'candidateHash'], 'designProvenance')
  enumValue(provenance.origin, ['author-guided', 'ai-candidate'] as const, 'designProvenance.origin')
  const proposalKeys = keyArray(provenance.proposalKeys, 'designProvenance.proposalKeys', 3)
  if (proposalKeys.length < 2 || proposalKeys.length > 3) fail('designProvenance 必须绑定 2～3 个提案')
  const baseProposalKey = stableKey(provenance.baseProposalKey, 'designProvenance.baseProposalKey')
  if (!proposalKeys.includes(baseProposalKey)) fail('designProvenance baseProposalKey 无效')
  const sections = ['background', 'coreConflict', 'opening', 'fronts', 'secrets', 'endings'] as const
  const sources = object(provenance.sectionSources, 'designProvenance.sectionSources')
  exact(sources, sections, 'designProvenance.sectionSources')
  for (const section of sections) {
    const proposalKey = stableKey(sources[section], `designProvenance.sectionSources.${section}`)
    if (!proposalKeys.includes(proposalKey)) fail(`designProvenance 分区来源无效:${section}`)
  }
  const locks = textArray(provenance.lockedSections, 'designProvenance.lockedSections', sections.length)
  if (locks.some(lock => !sections.includes(lock as typeof sections[number]))) fail('designProvenance 包含未知锁定分区')
  if (provenance.candidateHash != null && !isSha256Hash(provenance.candidateHash)) fail('designProvenance candidateHash 无效')
  if ((provenance.origin === 'ai-candidate') !== (provenance.candidateHash != null)) fail('designProvenance AI 来源与 candidateHash 不闭合')

  const information = object(root.informationPolicy, 'informationPolicy')
  exact(information, [
    'characterPrivateChannels', 'gmSecrets', 'hiddenNpcState', 'hiddenDice',
    'interPlayerWhispers', 'revealAuditTrail',
  ], 'informationPolicy')
  bool(information.characterPrivateChannels, 'informationPolicy.characterPrivateChannels')
  bool(information.gmSecrets, 'informationPolicy.gmSecrets')
  bool(information.hiddenNpcState, 'informationPolicy.hiddenNpcState')
  enumValue(information.hiddenDice, ['never', 'gm-only', 'allowed'] as const, 'informationPolicy.hiddenDice')
  bool(information.interPlayerWhispers, 'informationPolicy.interPlayerWhispers')
  bool(information.revealAuditTrail, 'informationPolicy.revealAuditTrail')

  const attributeKeys = new Set(rulePack.attributes.map(row => row.key))
  const resourceKeys = new Set(rulePack.resources.map(row => row.key))
  const itemKeys = new Set(rulePack.items.map(row => row.key))
  const actionKeys = new Set(rulePack.actions.map(row => row.key))
  const characterKeys: string[] = []
  const characters = array(root.characterTemplates, 'characterTemplates', 256).map((value, index) => {
    const row = object(value, `characterTemplates[${index}]`)
    const characterFields = [
      'characterKey', 'seatKey', 'name', 'description', 'sourceRefs', 'role', 'controller',
      'attributes', 'attributeMappings', 'skills', 'resources', 'itemKeys', 'actionKeys',
      'portraitAssetKey', 'playerProfile', 'gmProfile', 'characterSheet',
    ]
    exact(row, characterFields, `characterTemplates[${index}]`)
    const characterKey = stableKey(row.characterKey, 'character.characterKey')
    nullableKey(row.seatKey, 'character.seatKey')
    characterKeys.push(characterKey)
    text(row.name, 'character.name', 300)
    text(row.description, 'character.description')
    keyArray(row.sourceRefs, 'character.sourceRefs', 100)
    const role = enumValue(row.role, ['player', 'npc'] as const, 'character.role')
    const controller = enumValue(row.controller, ['human', 'ai', 'open', 'gm'] as const, 'character.controller')
    if (role === 'player' && row.seatKey == null) fail('玩家角色必须绑定 seatKey')
    if (role === 'npc' && row.seatKey != null) fail('NPC 的 seatKey 必须为 null')
    if ((role === 'npc') !== (controller === 'gm')) {
      fail('NPC 必须由 GM 控制；玩家角色不能使用 gm controller')
    }
    const attributes = numericRecord(row.attributes, 'character.attributes')
    validateKnown(Object.keys(attributes), attributeKeys, 'character.attributes')
    if (Object.keys(attributes).length !== attributeKeys.size) fail('character.attributes 必须覆盖全部规则属性')
    const mappings = object(row.attributeMappings, 'character.attributeMappings')
    if (Object.keys(mappings).length !== attributeKeys.size) fail('character.attributeMappings 必须覆盖全部规则属性')
    for (const [attributeKey, mappingValue] of Object.entries(mappings)) {
      validateKnown([attributeKey], attributeKeys, 'character.attributeMappings')
      const mapping = object(mappingValue, `character.attributeMappings.${attributeKey}`)
      exact(mapping, ['value', 'derivationRule', 'sourceRefs', 'authorConfirmed'], `character.attributeMappings.${attributeKey}`)
      if (finite(mapping.value, 'mapping.value') !== attributes[attributeKey]) fail(`属性映射值与 attributes 不一致:${attributeKey}`)
      text(mapping.derivationRule, 'mapping.derivationRule', 2_000)
      keyArray(mapping.sourceRefs, 'mapping.sourceRefs', 100)
      bool(mapping.authorConfirmed, 'mapping.authorConfirmed')
    }
    numericRecord(row.skills, 'character.skills')
    const resources = numericRecord(row.resources, 'character.resources')
    validateKnown(Object.keys(resources), resourceKeys, 'character.resources')
    const characterItemKeys = keyArray(row.itemKeys, 'character.itemKeys', 100)
    const characterActionKeys = keyArray(row.actionKeys, 'character.actionKeys', 100)
    validateKnown(characterItemKeys, itemKeys, 'character.itemKeys')
    validateKnown(characterActionKeys, actionKeys, 'character.actionKeys')
    nullableKey(row.portraitAssetKey, 'character.portraitAssetKey')
    if (role === 'player') {
      if (row.playerProfile == null || row.gmProfile != null) fail('玩家角色必须且只能包含 playerProfile')
      const profile = object(row.playerProfile, 'character.playerProfile')
      exact(profile, ['privateGoal', 'secret', 'portrayal'], 'character.playerProfile')
      text(profile.privateGoal, 'character.playerProfile.privateGoal')
      text(profile.secret, 'character.playerProfile.secret')
      text(profile.portrayal, 'character.playerProfile.portrayal')
    } else {
      if (row.gmProfile == null || row.playerProfile != null) fail('NPC 必须且只能包含 gmProfile')
      const profile = object(row.gmProfile, 'character.gmProfile')
      exact(profile, ['objective', 'leverage', 'secret', 'portrayal', 'escalation'], 'character.gmProfile')
      text(profile.objective, 'character.gmProfile.objective')
      text(profile.leverage, 'character.gmProfile.leverage')
      text(profile.secret, 'character.gmProfile.secret')
      text(profile.portrayal, 'character.gmProfile.portrayal')
      text(profile.escalation, 'character.gmProfile.escalation')
    }
    const parsed = structuredClone(row) as unknown as TtrpgCharacterTemplateV1
    const { characterSheet: _ignored, ...templateWithoutSheet } = parsed
    parsed.characterSheet = parseTtrpgCharacterSheetV2(row.characterSheet, templateWithoutSheet, rulePack)
    return parsed
  })
  unique(characterKeys, 'characterTemplates')
  unique(characters.flatMap(row => typeof row.seatKey === 'string' ? [row.seatKey] : []), 'characterTemplates.seatKey')
  if (!characters.some(row => row.role === 'player')) fail('至少需要一个玩家角色模板')
  const knownCharacters = new Set(characterKeys)

  const clueKeys: string[] = []
  const conclusions = new Set<string>()
  const clues = array(root.clues, 'clues', 1_000).map((value, index) => {
    const row = object(value, `clues[${index}]`)
    exact(row, ['clueKey', 'title', 'description', 'conclusionKey', 'required', 'discoveryPaths', 'visibility', 'sourceRefs'], `clues[${index}]`)
    clueKeys.push(stableKey(row.clueKey, 'clue.clueKey'))
    text(row.title, 'clue.title', 300)
    text(row.description, 'clue.description')
    conclusions.add(stableKey(row.conclusionKey, 'clue.conclusionKey'))
    bool(row.required, 'clue.required')
    const pathKeys = array(row.discoveryPaths, 'clue.discoveryPaths', 20).map((pathValue, pathIndex) => {
      const path = object(pathValue, `clue.discoveryPaths[${pathIndex}]`)
      exact(path, ['pathKey', 'sceneKey', 'actionKey', 'failForward'], `clue.discoveryPaths[${pathIndex}]`)
      stableKey(path.sceneKey, 'clue.path.sceneKey')
      const actionKey = stableKey(path.actionKey, 'clue.path.actionKey')
      validateKnown([actionKey], actionKeys, 'clue.path.actionKey')
      text(path.failForward, 'clue.path.failForward')
      return stableKey(path.pathKey, 'clue.path.pathKey')
    })
    unique(pathKeys, 'clue.discoveryPaths')
    if (row.required === true && pathKeys.length < 2) fail(`必需线索至少要有两条发现路径:${row.clueKey}`)
    enumValue(row.visibility, ['gm-only', 'discoverable', 'public'] as const, 'clue.visibility')
    keyArray(row.sourceRefs, 'clue.sourceRefs', 100)
    return structuredClone(row)
  })
  unique(clueKeys, 'clues')
  const knownClues = new Set(clueKeys)

  const sceneKeys: string[] = []
  const scenes = array(root.scenes, 'scenes', 1_000).map((value, index) => {
    const row = object(value, `scenes[${index}]`)
    const sceneFields = ['sceneKey', 'title', 'description', 'locationKey', 'participantKeys', 'clueKeys', 'actionKeys', 'nextSceneKeys', 'failureForward', 'gmSecret', 'sourceRefs', 'tabletopMapKey']
    exact(row, sceneFields, `scenes[${index}]`)
    const sceneKey = stableKey(row.sceneKey, 'scene.sceneKey')
    sceneKeys.push(sceneKey)
    text(row.title, 'scene.title', 300)
    text(row.description, 'scene.description')
    nullableKey(row.locationKey, 'scene.locationKey')
    const participants = keyArray(row.participantKeys, 'scene.participantKeys', 256)
    validateKnown(participants, knownCharacters, 'scene.participantKeys')
    const sceneClues = keyArray(row.clueKeys, 'scene.clueKeys', 256)
    validateKnown(sceneClues, knownClues, 'scene.clueKeys')
    const sceneActions = keyArray(row.actionKeys, 'scene.actionKeys', 256)
    validateKnown(sceneActions, actionKeys, 'scene.actionKeys')
    keyArray(row.nextSceneKeys, 'scene.nextSceneKeys', 256)
    text(row.failureForward, 'scene.failureForward')
    text(row.gmSecret, 'scene.gmSecret')
    keyArray(row.sourceRefs, 'scene.sourceRefs', 100)
    nullableKey(row.tabletopMapKey, 'scene.tabletopMapKey')
    return structuredClone(row)
  })
  unique(sceneKeys, 'scenes')
  const knownScenes = new Set(sceneKeys)
  const openingSceneKey = stableKey(root.openingSceneKey, 'openingSceneKey')
  validateKnown([openingSceneKey], knownScenes, 'openingSceneKey')
  for (const scene of scenes) validateKnown(scene.nextSceneKeys as string[], knownScenes, `scene ${scene.sceneKey}.nextSceneKeys`)
  for (const clue of clues) {
    for (const path of clue.discoveryPaths as Array<{ sceneKey: string }>) validateKnown([path.sceneKey], knownScenes, `clue ${clue.clueKey}.discoveryPaths`)
  }

  const clockKeys: string[] = []
  array(root.clocks, 'clocks', 256).forEach((value, index) => {
      const row = object(value, `clocks[${index}]`)
      exact(row, ['clockKey', 'title', 'description', 'initialValue', 'maximum', 'advanceTriggers', 'onComplete', 'visibility', 'sourceRefs'], `clocks[${index}]`)
      const clockKey = stableKey(row.clockKey, 'clock.clockKey')
      clockKeys.push(clockKey)
      text(row.title, 'clock.title', 300)
      text(row.description, 'clock.description')
      const maximum = integer(row.maximum, 'clock.maximum', 2, 100)
      integer(row.initialValue, 'clock.initialValue', 0, maximum - 1)
      const triggerKeys = array(row.advanceTriggers, 'clock.advanceTriggers', 100).map((triggerValue, triggerIndex) => {
        const trigger = object(triggerValue, `clock.advanceTriggers[${triggerIndex}]`)
        exact(trigger, ['triggerKey', 'sceneKey', 'actionKey', 'amount', 'reason'], `clock.advanceTriggers[${triggerIndex}]`)
        const sceneKey = nullableKey(trigger.sceneKey, 'clock.trigger.sceneKey')
        const actionKey = nullableKey(trigger.actionKey, 'clock.trigger.actionKey')
        if (sceneKey) validateKnown([sceneKey], knownScenes, 'clock.trigger.sceneKey')
        if (actionKey) validateKnown([actionKey], actionKeys, 'clock.trigger.actionKey')
        if (!sceneKey && !actionKey) fail('clock trigger 至少绑定 sceneKey 或 actionKey')
        integer(trigger.amount, 'clock.trigger.amount', 1, maximum)
        text(trigger.reason, 'clock.trigger.reason')
        return stableKey(trigger.triggerKey, 'clock.trigger.triggerKey')
      })
      if (!triggerKeys.length) fail(`Clock 至少需要一个推进条件:${clockKey}`)
      unique(triggerKeys, `clock ${clockKey}.advanceTriggers`)
      text(row.onComplete, 'clock.onComplete')
      enumValue(row.visibility, ['gm-only', 'party', 'public'] as const, 'clock.visibility')
      const sources = keyArray(row.sourceRefs, 'clock.sourceRefs', 100)
      if (!sources.length) fail(`Clock 缺少来源:${clockKey}`)
  })
  if (!clockKeys.length) fail('clocks 不得为空')
  unique(clockKeys, 'clocks')
  const knownClocks = new Set(clockKeys)

  const frontKeys: string[] = []
  array(root.fronts, 'fronts', 128).forEach((value, index) => {
      const row = object(value, `fronts[${index}]`)
      exact(row, ['frontKey', 'title', 'goal', 'participantKeys', 'clockKeys', 'escalation', 'defeatConditions', 'sourceRefs'], `fronts[${index}]`)
      const frontKey = stableKey(row.frontKey, 'front.frontKey')
      frontKeys.push(frontKey)
      text(row.title, 'front.title', 300)
      text(row.goal, 'front.goal')
      const participants = keyArray(row.participantKeys, 'front.participantKeys', 100)
      validateKnown(participants, knownCharacters, 'front.participantKeys')
      if (!participants.length) fail(`Front 缺少参与者:${frontKey}`)
      const clocks = keyArray(row.clockKeys, 'front.clockKeys', 100)
      validateKnown(clocks, knownClocks, 'front.clockKeys')
      if (!clocks.length) fail(`Front 缺少 Clock:${frontKey}`)
      if (!textArray(row.escalation, 'front.escalation', 100).length) fail(`Front 缺少升级阶梯:${frontKey}`)
      if (!textArray(row.defeatConditions, 'front.defeatConditions', 100).length) fail(`Front 缺少阻止条件:${frontKey}`)
      if (!keyArray(row.sourceRefs, 'front.sourceRefs', 100).length) fail(`Front 缺少来源:${frontKey}`)
  })
  if (!frontKeys.length) fail('fronts 不得为空')
  unique(frontKeys, 'fronts')

  const secretKeys: string[] = []
  array(root.secrets, 'secrets', 512).forEach((value, index) => {
      const row = object(value, `secrets[${index}]`)
      exact(row, ['secretKey', 'title', 'truth', 'holderKeys', 'relatedClueKeys', 'revealRule', 'visibility', 'sourceRefs'], `secrets[${index}]`)
      const secretKey = stableKey(row.secretKey, 'secret.secretKey')
      secretKeys.push(secretKey)
      text(row.title, 'secret.title', 300)
      text(row.truth, 'secret.truth')
      const holders = keyArray(row.holderKeys, 'secret.holderKeys', 100)
      validateKnown(holders, knownCharacters, 'secret.holderKeys')
      const relatedClues = keyArray(row.relatedClueKeys, 'secret.relatedClueKeys', 100)
      validateKnown(relatedClues, knownClues, 'secret.relatedClueKeys')
      if (!relatedClues.length) fail(`Secret 缺少可审计揭示线索:${secretKey}`)
      text(row.revealRule, 'secret.revealRule')
      enumValue(row.visibility, ['gm-only', 'character-private'] as const, 'secret.visibility')
      if (!keyArray(row.sourceRefs, 'secret.sourceRefs', 100).length) fail(`Secret 缺少来源:${secretKey}`)
  })
  if (!secretKeys.length) fail('secrets 不得为空')
  unique(secretKeys, 'secrets')

  if (root.tabletop != null) {
    const tabletop = object(root.tabletop, 'tabletop')
    exact(tabletop, ['maps'], 'tabletop')
    const mapKeys: string[] = []
    const layerKeys: string[] = []
    const areaKeys: string[] = []
    const tokenKeys: string[] = []
    const fogKeys: string[] = []
    const maps = array(tabletop.maps, 'tabletop.maps', 256).map((value, mapIndex) => {
      const map = object(value, `tabletop.maps[${mapIndex}]`)
      exact(map, ['mapKey', 'title', 'width', 'height', 'backgroundAssetKey', 'fallbackDescription', 'grid', 'layers', 'areas', 'tokens', 'fog'], `tabletop.maps[${mapIndex}]`)
      const mapKey = stableKey(map.mapKey, 'tabletop.map.mapKey')
      mapKeys.push(mapKey)
      text(map.title, 'tabletop.map.title', 300)
      integer(map.width, 'tabletop.map.width', 4, 100)
      integer(map.height, 'tabletop.map.height', 4, 100)
      nullableKey(map.backgroundAssetKey, 'tabletop.map.backgroundAssetKey')
      text(map.fallbackDescription, 'tabletop.map.fallbackDescription')
      const grid = object(map.grid, 'tabletop.map.grid')
      exact(grid, ['kind', 'cellSize', 'distancePerCell', 'unit'], 'tabletop.map.grid')
      enumValue(grid.kind, ['square', 'zone'] as const, 'tabletop.map.grid.kind')
      integer(grid.cellSize, 'tabletop.map.grid.cellSize', 1, 20)
      const distancePerCell = finite(grid.distancePerCell, 'tabletop.map.grid.distancePerCell')
      if (distancePerCell <= 0 || distancePerCell > 10_000) fail('tabletop.map.grid.distancePerCell 超出范围')
      text(grid.unit, 'tabletop.map.grid.unit', 40)
      array(map.layers, 'tabletop.map.layers', 64).forEach((layerValue, layerIndex) => {
        const layer = object(layerValue, `tabletop.map.layers[${layerIndex}]`)
        exact(layer, ['layerKey', 'title', 'kind', 'zIndex', 'opacity', 'gmOnly'], `tabletop.map.layers[${layerIndex}]`)
        layerKeys.push(stableKey(layer.layerKey, 'tabletop.layer.layerKey'))
        text(layer.title, 'tabletop.layer.title', 300)
        enumValue(layer.kind, ['terrain', 'objects', 'annotation'] as const, 'tabletop.layer.kind')
        integer(layer.zIndex, 'tabletop.layer.zIndex', -100, 100)
        const opacity = finite(layer.opacity, 'tabletop.layer.opacity')
        if (opacity < 0 || opacity > 1) fail('tabletop.layer.opacity 必须在 0..1')
        bool(layer.gmOnly, 'tabletop.layer.gmOnly')
      })
      array(map.areas, 'tabletop.map.areas', 256).forEach((areaValue, areaIndex) => {
        const area = object(areaValue, `tabletop.map.areas[${areaIndex}]`)
        exact(area, ['areaKey', 'title', 'x', 'y', 'width', 'height', 'gmOnly'], `tabletop.map.areas[${areaIndex}]`)
        areaKeys.push(stableKey(area.areaKey, 'tabletop.area.areaKey'))
        text(area.title, 'tabletop.area.title', 300)
        integer(area.x, 'tabletop.area.x', 0, 99)
        integer(area.y, 'tabletop.area.y', 0, 99)
        const width = integer(area.width, 'tabletop.area.width', 1, 100)
        const height = integer(area.height, 'tabletop.area.height', 1, 100)
        if (Number(area.x) + width > 100 || Number(area.y) + height > 100) fail('tabletop.area 超出地图边界')
        bool(area.gmOnly, 'tabletop.area.gmOnly')
      })
      array(map.tokens, 'tabletop.map.tokens', 256).forEach((tokenValue, tokenIndex) => {
        const token = object(tokenValue, `tabletop.map.tokens[${tokenIndex}]`)
        exact(token, ['tokenKey', 'entityKey', 'x', 'y', 'size', 'controllerKey', 'hidden'], `tabletop.map.tokens[${tokenIndex}]`)
        tokenKeys.push(stableKey(token.tokenKey, 'tabletop.token.tokenKey'))
        const entityKey = stableKey(token.entityKey, 'tabletop.token.entityKey')
        validateKnown([entityKey], knownCharacters, 'tabletop.token.entityKey')
        integer(token.x, 'tabletop.token.x', 0, 100)
        integer(token.y, 'tabletop.token.y', 0, 100)
        integer(token.size, 'tabletop.token.size', 1, 20)
        const controllerKey = nullableKey(token.controllerKey, 'tabletop.token.controllerKey')
        if (controllerKey) validateKnown([controllerKey], knownCharacters, 'tabletop.token.controllerKey')
        bool(token.hidden, 'tabletop.token.hidden')
      })
      array(map.fog, 'tabletop.map.fog', 256).forEach((fogValue, fogIndex) => {
        const fog = object(fogValue, `tabletop.map.fog[${fogIndex}]`)
        exact(fog, ['fogKey', 'title', 'x', 'y', 'width', 'height'], `tabletop.map.fog[${fogIndex}]`)
        fogKeys.push(stableKey(fog.fogKey, 'tabletop.fog.fogKey'))
        text(fog.title, 'tabletop.fog.title', 300)
        integer(fog.x, 'tabletop.fog.x', 0, 99)
        integer(fog.y, 'tabletop.fog.y', 0, 99)
        const width = integer(fog.width, 'tabletop.fog.width', 1, 100)
        const height = integer(fog.height, 'tabletop.fog.height', 1, 100)
        if (Number(fog.x) + width > 100 || Number(fog.y) + height > 100) fail('tabletop.fog 超出地图边界')
      })
      return mapKey
    })
    if (!maps.length) fail('tabletop.maps 不得为空')
    unique(mapKeys, 'tabletop.maps')
    unique(layerKeys, 'tabletop.layers')
    unique(areaKeys, 'tabletop.areas')
    unique(tokenKeys, 'tabletop.tokens')
    unique(fogKeys, 'tabletop.fog')
    const knownMaps = new Set(mapKeys)
    for (const scene of scenes) {
      if (scene.tabletopMapKey != null) validateKnown([String(scene.tabletopMapKey)], knownMaps, `scene ${scene.sceneKey}.tabletopMapKey`)
    }
  } else if (scenes.some(scene => scene.tabletopMapKey != null)) {
    fail('scene.tabletopMapKey 存在时 campaign.tabletop 不得缺失')
  }

  const questKeys = array(root.quests, 'quests', 256).map((value, index) => {
    const row = object(value, `quests[${index}]`)
    exact(row, ['questKey', 'title', 'objective', 'requiredConclusionKeys', 'failureForward'], `quests[${index}]`)
    text(row.title, 'quest.title', 300)
    text(row.objective, 'quest.objective')
    const requiredConclusions = keyArray(row.requiredConclusionKeys, 'quest.requiredConclusionKeys', 100)
    validateKnown(requiredConclusions, conclusions, 'quest.requiredConclusionKeys')
    text(row.failureForward, 'quest.failureForward')
    return stableKey(row.questKey, 'quest.questKey')
  })
  if (!questKeys.length) fail('quests 不得为空')
  unique(questKeys, 'quests')

  const endingKeys = array(root.endings, 'endings', 100).map((value, index) => {
    const row = object(value, `endings[${index}]`)
    exact(row, ['endingKey', 'title', 'requirements', 'epilogue', 'trigger'], `endings[${index}]`)
    text(row.title, 'ending.title', 300)
    textArray(row.requirements, 'ending.requirements', 100)
    text(row.epilogue, 'ending.epilogue')
    const trigger = object(row.trigger, 'ending.trigger')
    exact(trigger, ['sceneKey', 'requiredConclusionKeys', 'forbiddenConclusionKeys'], 'ending.trigger')
    const sceneKey = stableKey(trigger.sceneKey, 'ending.trigger.sceneKey')
    validateKnown([sceneKey], knownScenes, 'ending.trigger.sceneKey')
    const required = keyArray(trigger.requiredConclusionKeys, 'ending.trigger.requiredConclusionKeys', 100)
    const forbidden = keyArray(trigger.forbiddenConclusionKeys, 'ending.trigger.forbiddenConclusionKeys', 100)
    validateKnown(required, conclusions, 'ending.trigger.requiredConclusionKeys')
    validateKnown(forbidden, conclusions, 'ending.trigger.forbiddenConclusionKeys')
    if (required.some(key => forbidden.includes(key))) fail('ending.trigger 同一结论不能同时 required 和 forbidden')
    return stableKey(row.endingKey, 'ending.endingKey')
  })
  if (endingKeys.length < 2) fail('至少需要两个结局')
  unique(endingKeys, 'endings')

  const handoutKeys = array(root.handouts, 'handouts', 512).map((value, index) => {
    const row = object(value, `handouts[${index}]`)
    exact(row, ['handoutKey', 'title', 'body', 'revealClueKey', 'assetKey', 'fallbackText'], `handouts[${index}]`)
    text(row.title, 'handout.title', 300)
    text(row.body, 'handout.body')
    const revealClueKey = nullableKey(row.revealClueKey, 'handout.revealClueKey')
    if (revealClueKey) validateKnown([revealClueKey], knownClues, 'handout.revealClueKey')
    nullableKey(row.assetKey, 'handout.assetKey')
    text(row.fallbackText, 'handout.fallbackText')
    return stableKey(row.handoutKey, 'handout.handoutKey')
  })
  unique(handoutKeys, 'handouts')

  const milestoneKeys = array(root.advancementMilestones, 'advancementMilestones', 256).map((value, index) => {
    const row = object(value, `advancementMilestones[${index}]`)
    exact(row, ['milestoneKey', 'title', 'award'], `advancementMilestones[${index}]`)
    text(row.title, 'milestone.title', 300)
    integer(row.award, 'milestone.award', 0, 1_000)
    return stableKey(row.milestoneKey, 'milestone.milestoneKey')
  })
  unique(milestoneKeys, 'advancementMilestones')

  const sourceWorld = object(root.sourceWorld, 'sourceWorld')
  exact(sourceWorld, ['contentHash', 'bundleHash'], 'sourceWorld')
  if (!isSha256Hash(sourceWorld.contentHash) || !isSha256Hash(sourceWorld.bundleHash)) fail('sourceWorld hash 无效')
  const locationKeys = new Set(scenes.flatMap(scene => scene.locationKey == null ? [] : [String(scene.locationKey)]))
  parseTtrpgVisualBibleV1(root.visualBible, { characterKeys: knownCharacters, locationKeys })
  parseTtrpgMediaManifestV1(root.mediaManifest, {
    targetRefs: new Set([
      ...characterKeys, ...sceneKeys, ...locationKeys, ...handoutKeys,
      ...rulePack.items.map(item => item.key),
      ...(root.tabletop == null ? [] : (root.tabletop as { maps: Array<{ mapKey: string }> }).maps.map(map => map.mapKey)),
    ]),
  })
  return structuredClone(root) as unknown as TtrpgCampaignContentV1
}
