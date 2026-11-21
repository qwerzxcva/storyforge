import type { AvgVisualDesignKindV1 } from './visual-planning-contract';
export const AVG_VISUAL_TEXT_CAPABILITY_V4 = 'avg.visual.planning.text'
export const AVG_COMPILED_IMAGE_SKILL_V4 = 'avg.compiled-image-request.v1'
export const AVG_VISUAL_PLANNING_ROLES_V1 = [
  { agentId: 'avg-art-director', skillId: 'avg.visual-bible.v1', label: 'AVG 美术方向', subjectKind: null, outputTokens: 16_000 },
  { agentId: 'avg-character-designer', skillId: 'avg.character-assets.v1', label: 'AVG 人物视觉方案', subjectKind: 'character', outputTokens: 12_000 },
  { agentId: 'avg-environment-designer', skillId: 'avg.environment-assets.v1', label: 'AVG 场景视觉方案', subjectKind: 'environment', outputTokens: 12_000 },
  { agentId: 'avg-prop-designer', skillId: 'avg.prop-assets.v1', label: 'AVG 物件视觉方案', subjectKind: 'prop', outputTokens: 12_000 },
] as const

export function avgVisualPlanningRoleV1(kind: AvgVisualDesignKindV1 | null) {
  return AVG_VISUAL_PLANNING_ROLES_V1.find(role => role.subjectKind === kind)!
}
