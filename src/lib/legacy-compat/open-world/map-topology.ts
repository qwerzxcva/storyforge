import type { TextOpenWorldParsedModulesV1 } from '../../types/index';
import { parseTextOpenWorldModulesV1 } from './modules';

type WorldModule = TextOpenWorldParsedModulesV1['world']
type EdgeDefinition = WorldModule['edges'][number]

export interface TextOpenWorldMapConnectionV1 {
  edgeKey: string
  fromLocationKey: string
  destinationLocationKey: string
  destinationRegionKey: string
  travelMinutes: number
  riskProfile: EdgeDefinition['riskProfile']
  currentlyOpen: boolean
}

export interface TextOpenWorldRouteStepV1 extends TextOpenWorldMapConnectionV1 {
  currentlyOpen: true
}

export interface TextOpenWorldRoutePlanV1 {
  fromLocationKey: string
  destinationLocationKey: string
  locationKeys: string[]
  regionKeys: string[]
  edgeKeys: string[]
  totalTravelMinutes: number
  steps: TextOpenWorldRouteStepV1[]
}

function fail(message: string): never { throw new Error(`[text-open-world-map] ${message}`) }

function destinationFor(edge: EdgeDefinition, fromLocationKey: string): string | null {
  if (edge.fromLocationKey === fromLocationKey) return edge.toLocationKey
  if (edge.bidirectional && edge.toLocationKey === fromLocationKey) return edge.fromLocationKey
  return null
}

function connectionsForLocation(
  modules: TextOpenWorldParsedModulesV1,
  currentLocationKey: string,
  openEdgeKeys: ReadonlySet<string>,
): TextOpenWorldMapConnectionV1[] {
  return modules.world.edges.flatMap(edge => {
    const destinationLocationKey = destinationFor(edge, currentLocationKey)
    if (!destinationLocationKey) return []
    const destination = modules.world.locations.find(location => location.key === destinationLocationKey)!
    return [{
      edgeKey: edge.key,
      fromLocationKey: currentLocationKey,
      destinationLocationKey,
      destinationRegionKey: destination.regionKey,
      travelMinutes: edge.travelMinutes,
      riskProfile: edge.riskProfile,
      currentlyOpen: openEdgeKeys.has(edge.key),
    }]
  }).sort((left, right) => left.travelMinutes - right.travelMinutes
    || left.edgeKey.localeCompare(right.edgeKey)
    || left.destinationLocationKey.localeCompare(right.destinationLocationKey))
}

/** Deterministic shortest-time route; undefined openEdgeKeys means structural planning. */
export function planTextOpenWorldRouteV1(input: {
  runtimePackage: unknown
  fromLocationKey: string
  destinationLocationKey: string
  openEdgeKeys?: readonly string[]
}): TextOpenWorldRoutePlanV1 | null {
  return planTextOpenWorldRouteFromModulesV1({
    ...input,
    modules: parseTextOpenWorldModulesV1(input.runtimePackage),
  })
}

/** Reuse the caller's already validated catalog within one projection. */
export function planTextOpenWorldRouteFromModulesV1(input: {
  modules: TextOpenWorldParsedModulesV1
  fromLocationKey: string
  destinationLocationKey: string
  openEdgeKeys?: readonly string[]
}): TextOpenWorldRoutePlanV1 | null {
  const { modules } = input
  const locationByKey = new Map(modules.world.locations.map(location => [location.key, location]))
  if (!locationByKey.has(input.fromLocationKey)) fail(`出发地点不存在:${input.fromLocationKey}`)
  if (!locationByKey.has(input.destinationLocationKey)) fail(`目标地点不存在:${input.destinationLocationKey}`)
  const allEdgeKeys = new Set(modules.world.edges.map(edge => edge.key))
  const allowedEdgeKeys = input.openEdgeKeys == null ? allEdgeKeys : new Set(input.openEdgeKeys)
  if (input.openEdgeKeys && allowedEdgeKeys.size !== input.openEdgeKeys.length) fail('openEdgeKeys不能重复')
  allowedEdgeKeys.forEach(edgeKey => { if (!allEdgeKeys.has(edgeKey)) fail(`openEdgeKeys包含未知道路:${edgeKey}`) })
  if (input.fromLocationKey === input.destinationLocationKey) {
    return {
      fromLocationKey: input.fromLocationKey,
      destinationLocationKey: input.destinationLocationKey,
      locationKeys: [input.fromLocationKey],
      regionKeys: [locationByKey.get(input.fromLocationKey)!.regionKey],
      edgeKeys: [], totalTravelMinutes: 0, steps: [],
    }
  }

  type Candidate = { locationKey: string; minutes: number; edgeKeys: string[]; locationKeys: string[]; steps: TextOpenWorldRouteStepV1[] }
  const candidates: Candidate[] = [{ locationKey: input.fromLocationKey, minutes: 0, edgeKeys: [], locationKeys: [input.fromLocationKey], steps: [] }]
  const best = new Map<string, { minutes: number; signature: string }>([[input.fromLocationKey, { minutes: 0, signature: '' }]])
  while (candidates.length) {
    candidates.sort((left, right) => left.minutes - right.minutes || left.edgeKeys.join('\u0000').localeCompare(right.edgeKeys.join('\u0000')))
    const current = candidates.shift()!
    const currentSignature = current.edgeKeys.join('\u0000')
    const recorded = best.get(current.locationKey)
    if (!recorded || recorded.minutes !== current.minutes || recorded.signature !== currentSignature) continue
    if (current.locationKey === input.destinationLocationKey) {
      return {
        fromLocationKey: input.fromLocationKey,
        destinationLocationKey: input.destinationLocationKey,
        locationKeys: current.locationKeys,
        regionKeys: current.locationKeys.map(locationKey => locationByKey.get(locationKey)!.regionKey)
          .filter((regionKey, index, values) => index === 0 || regionKey !== values[index - 1]),
        edgeKeys: current.edgeKeys,
        totalTravelMinutes: current.minutes,
        steps: current.steps,
      }
    }
    const connections = connectionsForLocation(modules, current.locationKey, allowedEdgeKeys).filter(connection => connection.currentlyOpen)
    for (const connection of connections) {
      const minutes = current.minutes + connection.travelMinutes
      const edgeKeys = [...current.edgeKeys, connection.edgeKey]
      const signature = edgeKeys.join('\u0000')
      const prior = best.get(connection.destinationLocationKey)
      if (prior && (prior.minutes < minutes || (prior.minutes === minutes && prior.signature.localeCompare(signature) <= 0))) continue
      best.set(connection.destinationLocationKey, { minutes, signature })
      candidates.push({
        locationKey: connection.destinationLocationKey,
        minutes,
        edgeKeys,
        locationKeys: [...current.locationKeys, connection.destinationLocationKey],
        steps: [...current.steps, { ...connection, currentlyOpen: true }],
      })
    }
  }
  return null
}
