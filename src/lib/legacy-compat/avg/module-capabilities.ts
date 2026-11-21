import type { AvgSystemPlan } from './system-contract';
import type { AvgReadingPlanV1 } from './reading-contract';

/** S2 names describe intent; native admission below describes executable code.
 * Adding a name never grants a renderer, state writer, or release capability. */
export const AVG_MODULE_NAMES_V1 = Object.freeze([
  'narrative','inventory','evidence','hotspots','topics','messages','archive','gallery','progress','assist',
] as const)
export type AvgModuleNameV1 = typeof AVG_MODULE_NAMES_V1[number]

export const AVG_NATIVE_CORE_CAPABILITIES_V1 = Object.freeze(['narrative','presentation','avg.rules'] as const)
export interface AvgNativeFeatureInputV1 { systemPlan:AvgSystemPlan; reading?:AvgReadingPlanV1 }

/** Preserve the exact existing Package V2 capability bytes/order. Evidence is
 * the existing inventory protocol, never a second state/action capability. */
export function avgNativeExecutableCapabilitiesV1(input:AvgNativeFeatureInputV1):string[] {
  return [...AVG_NATIVE_CORE_CAPABILITIES_V1,
    ...(input.systemPlan.version===2?['avg.inventory']:[]),
    ...(input.reading?['avg.reading']:[])]
}
