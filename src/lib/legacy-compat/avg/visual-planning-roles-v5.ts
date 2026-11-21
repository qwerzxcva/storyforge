import { AVG_VISUAL_PLANNING_ROLES_V1 } from './visual-planning-roles';
import type { AvgVisualDesignKindV1 } from './visual-planning-contract';
export const AVG_VISUAL_PLANNING_ROLES_V5=AVG_VISUAL_PLANNING_ROLES_V1.map(role=>({...role,skillId:role.skillId.replace(/\.v1$/,'.v2')}))
export const avgVisualPlanningRoleV5=(kind:AvgVisualDesignKindV1|null)=>AVG_VISUAL_PLANNING_ROLES_V5.find(role=>role.subjectKind===kind)!
