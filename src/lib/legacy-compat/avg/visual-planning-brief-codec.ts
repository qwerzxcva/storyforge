import { avgProtocolBody } from './protocol-validation';
import { parseAvgVisualPlanningBriefV4, type AvgVisualPlanningBriefV4 } from './visual-planning-brief';
import { parseAvgVisualPlanningBriefV5, type AvgVisualPlanningBriefV5 } from './visual-planning-brief-v5';

export type AvgVisualPlanningBrief=AvgVisualPlanningBriefV4|AvgVisualPlanningBriefV5
export function parseAvgVisualPlanningBrief(value:unknown):AvgVisualPlanningBrief {
  const body=avgProtocolBody(value)
  return (body as {version?:unknown}|null)?.version===5?parseAvgVisualPlanningBriefV5(body):parseAvgVisualPlanningBriefV4(body)
}
