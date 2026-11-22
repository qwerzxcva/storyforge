import type { TextAdventureProductionBriefV1 } from '../../types/index';

const REQUIRED_RESOURCE_ROLES: TextAdventureProductionBriefV1['character']['resourceRoles'] = [
  'health', 'mana', 'stamina', 'experience', 'skill-points', 'currency', 'clock',
]

function fail(message: string): never {
  throw new Error(`[text-adventure-production-brief] ${message}`)
}

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

function text(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail(`${label} 无效`)
  return value.trim().normalize('NFC')
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) fail(`${label} 无效`)
  return Number(value)
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} 必须是 boolean`)
  return value
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(`${label} 枚举无效`)
  return value as T
}

function textArray(value: unknown, label: string, minimum: number, maximum: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${label} 数量无效`)
  const parsed = value.map((item, index) => text(item, `${label}[${index}]`, 120))
  if (new Set(parsed).size !== parsed.length) fail(`${label} 不允许重复`)
  return parsed
}

export function parseTextAdventureProductionBriefV1(value: unknown): TextAdventureProductionBriefV1 {
  const row = record(value, 'textAdventure')
  exactKeys(row, [
    'schema', 'version', 'creationMode', 'sourceTreatment', 'narrative', 'character',
    'experience', 'media', 'confirmations',
  ], 'textAdventure')
  if (row.schema !== 'storyforge.text-adventure-production-brief' || row.version !== 1) {
    fail('schema/version 无效')
  }
  const narrative = record(row.narrative, 'narrative')
  exactKeys(narrative, [
    'structure', 'targetRegionCount', 'targetAreaCount', 'targetLocationCount', 'targetSceneCount',
    'mainQuestCount', 'targetSideQuestCount', 'targetAmbientEventCount', 'targetEndingCount',
    'minimumDistinctRoutes', 'choiceDensity', 'failForward',
  ], 'narrative')
  const parsedNarrative: TextAdventureProductionBriefV1['narrative'] = {
    structure: enumValue(narrative.structure, ['trunk-convergent-storylets'], 'narrative.structure'),
    targetRegionCount: integer(narrative.targetRegionCount, 'narrative.targetRegionCount', 1, 8),
    targetAreaCount: integer(narrative.targetAreaCount, 'narrative.targetAreaCount', 1, 24),
    targetLocationCount: integer(narrative.targetLocationCount, 'narrative.targetLocationCount', 2, 48),
    targetSceneCount: integer(narrative.targetSceneCount, 'narrative.targetSceneCount', 3, 80),
    mainQuestCount: integer(narrative.mainQuestCount, 'narrative.mainQuestCount', 1, 1) as 1,
    targetSideQuestCount: integer(narrative.targetSideQuestCount, 'narrative.targetSideQuestCount', 0, 16),
    targetAmbientEventCount: integer(narrative.targetAmbientEventCount, 'narrative.targetAmbientEventCount', 1, 32),
    targetEndingCount: integer(narrative.targetEndingCount, 'narrative.targetEndingCount', 2, 8),
    minimumDistinctRoutes: integer(narrative.minimumDistinctRoutes, 'narrative.minimumDistinctRoutes', 1, 8),
    choiceDensity: enumValue(narrative.choiceDensity, ['focused', 'balanced', 'dense'], 'narrative.choiceDensity'),
    failForward: boolean(narrative.failForward, 'narrative.failForward'),
  }
  if (parsedNarrative.targetAreaCount < parsedNarrative.targetRegionCount
    || parsedNarrative.targetLocationCount < parsedNarrative.targetAreaCount
    || parsedNarrative.targetSceneCount < parsedNarrative.targetLocationCount) {
    fail('空间数量必须满足大区域 ≤ 区域 ≤ 地点 ≤ 场景')
  }
  if (parsedNarrative.minimumDistinctRoutes > parsedNarrative.targetEndingCount) {
    fail('有效路线数不能超过结局数')
  }

  const character = record(row.character, 'character')
  exactKeys(character, [
    'preset', 'statLabels', 'skillLabels', 'resourceRoles', 'equipmentSlotLabels', 'progressionEnabled',
  ], 'character')
  if (!Array.isArray(character.resourceRoles)) fail('character.resourceRoles 必须是数组')
  const resourceRoles = character.resourceRoles.map((item, index) => enumValue(
    item, REQUIRED_RESOURCE_ROLES, `character.resourceRoles[${index}]`,
  ))
  if (resourceRoles.join(',') !== REQUIRED_RESOURCE_ROLES.join(',')) {
    fail('角色资源必须完整且按权威顺序登记')
  }
  const parsedCharacter: TextAdventureProductionBriefV1['character'] = {
    preset: enumValue(character.preset, ['general-adventure-rpg'], 'character.preset'),
    statLabels: textArray(character.statLabels, 'character.statLabels', 4, 12),
    skillLabels: textArray(character.skillLabels, 'character.skillLabels', 2, 16),
    resourceRoles,
    equipmentSlotLabels: textArray(character.equipmentSlotLabels, 'character.equipmentSlotLabels', 2, 12),
    progressionEnabled: boolean(character.progressionEnabled, 'character.progressionEnabled'),
  }

  const experience = record(row.experience, 'experience')
  exactKeys(experience, [
    'perspective', 'consequenceVisibility', 'contentExpansion', 'emotionalTarget', 'endingCauseRecap',
  ], 'experience')
  const media = record(row.media, 'media')
  exactKeys(media, [
    'mode', 'characterAnchorsRequired', 'reviewBeforePublish', 'runtimeGeneration',
  ], 'media')
  const confirmations = record(row.confirmations, 'confirmations')
  exactKeys(confirmations, [
    'worldCanonBoundary', 'deterministicStateAuthority', 'genericCoreBoundary', 'mediaRights',
  ], 'confirmations')
  return {
    schema: 'storyforge.text-adventure-production-brief',
    version: 1,
    creationMode: enumValue(row.creationMode, ['quick', 'advanced'], 'creationMode'),
    sourceTreatment: enumValue(row.sourceTreatment, ['expand-sparse', 'adapt-rich', 'author-outline'], 'sourceTreatment'),
    narrative: parsedNarrative,
    character: parsedCharacter,
    experience: {
      perspective: enumValue(experience.perspective, ['second-person', 'first-person'], 'experience.perspective'),
      consequenceVisibility: enumValue(experience.consequenceVisibility, ['explicit', 'partial', 'hidden'], 'experience.consequenceVisibility'),
      contentExpansion: enumValue(experience.contentExpansion, ['required', 'preserve-source-depth'], 'experience.contentExpansion'),
      emotionalTarget: text(experience.emotionalTarget, 'experience.emotionalTarget', 1000),
      endingCauseRecap: boolean(experience.endingCauseRecap, 'experience.endingCauseRecap'),
    },
    media: {
      mode: enumValue(media.mode, ['text-only', 'key-illustrations', 'rich-illustrations'], 'media.mode'),
      characterAnchorsRequired: boolean(media.characterAnchorsRequired, 'media.characterAnchorsRequired'),
      reviewBeforePublish: boolean(media.reviewBeforePublish, 'media.reviewBeforePublish'),
      runtimeGeneration: enumValue(media.runtimeGeneration, ['disabled'], 'media.runtimeGeneration'),
    },
    confirmations: {
      worldCanonBoundary: boolean(confirmations.worldCanonBoundary, 'confirmations.worldCanonBoundary'),
      deterministicStateAuthority: boolean(confirmations.deterministicStateAuthority, 'confirmations.deterministicStateAuthority'),
      genericCoreBoundary: boolean(confirmations.genericCoreBoundary, 'confirmations.genericCoreBoundary'),
      mediaRights: boolean(confirmations.mediaRights, 'confirmations.mediaRights'),
    },
  }
}
