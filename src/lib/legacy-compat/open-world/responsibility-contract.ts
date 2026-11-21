
import { TEXT_OPEN_WORLD_PRODUCTION_ARTIFACT_DEFINITIONS_V1, textOpenWorldProductionArtifactKindForKeyV1 } from './production-contract';

/** A derived product semantic, never a replacement for the scheduler lane or
 * a new persisted Plan field. Old Plan/Brief hashes remain unchanged. */
export const TEXT_OPEN_WORLD_RESPONSIBILITY_TRACKS_V1 = [
  'game-content', 'product-system', 'media',
] as const
export type TextOpenWorldResponsibilityTrackV1 =
  typeof TEXT_OPEN_WORLD_RESPONSIBILITY_TRACKS_V1[number]

const TASK_TRACKS: Readonly<Record<string, TextOpenWorldResponsibilityTrackV1>> = {
  'p0.source-lock': 'game-content',
  'p1.source-curation': 'game-content',
  'p2.experience-design': 'game-content',
  'p2.gameplay-ruleset': 'product-system',
  'p2.presentation-profile': 'product-system',
  'p3.story-architecture': 'game-content',
  'p4.region-skeleton': 'game-content',
  'p4.player-build': 'product-system',
  'p5.mainline': 'game-content',
  'p6.significant-threads': 'game-content',
  'p7.region-narrative-packs': 'game-content',
  'p8.quest-skeletons': 'game-content',
  'p8.catalog.progression': 'product-system',
  'p8.catalog.encounters': 'product-system',
  'p8.catalog.items-rewards': 'product-system',
  'p8.catalog.crafting-economy': 'product-system',
  'p8.catalog.npc-runtime': 'product-system',
  'p8.catalog.map-interactions': 'product-system',
  'p8f.quest-finalize': 'game-content',
  'p9.scene-scripts': 'game-content',
  'p10.system-finalize': 'product-system',
  'v1.deterministic-preflight': 'product-system',
  'v2.balance-review': 'product-system',
  'v2.semantic-review': 'game-content',
  'media.visual': 'media',
  'media.audio': 'media',
  'v3.runtime-package': 'product-system',
  'qa.release': 'product-system',
}
const CROSS_TRACK_OUTPUTS: Readonly<Record<string, TextOpenWorldResponsibilityTrackV1>> = {
  'text-open-world.director-decks': 'product-system',
  'text-open-world.action-bindings': 'product-system',
  'text-open-world.media-requirements': 'media',
  'text-open-world.content-budget': 'game-content',
}

function fail(message: string): never {
  throw new Error(`[text-open-world-responsibility] ${message}`)
}

export function textOpenWorldTaskResponsibilityV1(taskKey: string): TextOpenWorldResponsibilityTrackV1 {
  return Object.prototype.hasOwnProperty.call(TASK_TRACKS, taskKey)
    ? TASK_TRACKS[taskKey] : fail(`未登记任务责任:${taskKey}`)
}

export function textOpenWorldArtifactResponsibilityV1(artifactKey: string): {
  responsibilityTrack: TextOpenWorldResponsibilityTrackV1
  ownerTaskKey: string
  productOwner: 'text-open-world'
} {
  const kind = textOpenWorldProductionArtifactKindForKeyV1(artifactKey)
  const ownerTaskKey = kind === 'image' ? 'media.visual' : kind === 'audio' ? 'media.audio'
    : TEXT_OPEN_WORLD_PRODUCTION_ARTIFACT_DEFINITIONS_V1.find(item => item.kind === kind)?.ownerTaskKey
      ?? fail(`未登记产物 owner:${artifactKey}`)
  return {
    responsibilityTrack: CROSS_TRACK_OUTPUTS[artifactKey] ?? textOpenWorldTaskResponsibilityV1(ownerTaskKey),
    ownerTaskKey, productOwner: 'text-open-world',
  }
}
