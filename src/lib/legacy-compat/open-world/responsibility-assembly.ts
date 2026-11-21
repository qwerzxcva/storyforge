
import { hashProductProductionValueV2, isSha256Hash } from '../product-production/hash';
import { TEXT_OPEN_WORLD_PRODUCTION_TASK_CONTRACTS_V1 } from './production-contract';
import { TEXT_OPEN_WORLD_RESPONSIBILITY_TRACKS_V1, textOpenWorldArtifactResponsibilityV1, type TextOpenWorldResponsibilityTrackV1 } from './responsibility-contract';

export interface TextOpenWorldResponsibilitySnapshotV1 {
  schema: 'storyforge.text-open-world-responsibility-snapshot'
  version: 1
  planHash: string
  sourcePinHash: string
  tracks: Array<{
    responsibilityTrack: TextOpenWorldResponsibilityTrackV1
    state: 'ready'
    inputs: Array<{
      artifactKey: string
      ownerTaskKey: string
      version: number
      contentHash: string
      inputHash: string
    }>
  }>
  snapshotHash: string
}

function fail(message: string): never {
  throw new Error(`[text-open-world-responsibility] ${message}`)
}

const REQUIRED_INPUTS = TEXT_OPEN_WORLD_PRODUCTION_TASK_CONTRACTS_V1
  .find(task => task.taskKey === 'v3.runtime-package')!.inputArtifactKeys

export async function validateTextOpenWorldResponsibilitySnapshotV1(
  value: TextOpenWorldResponsibilitySnapshotV1 | undefined,
  binding: { sourcePinHash: string; generatedMediaArtifactKeys: string[] },
): Promise<void> {
  if (!value || value.schema !== 'storyforge.text-open-world-responsibility-snapshot' || value.version !== 1
    || !isSha256Hash(value.planHash) || !isSha256Hash(value.sourcePinHash)
    || value.sourcePinHash !== binding.sourcePinHash || !Array.isArray(value.tracks)
    || value.tracks.length !== 3) fail('三线完成快照缺失或来源不一致')
  const { snapshotHash, ...body } = value
  if (!isSha256Hash(snapshotHash) || await hashProductProductionValueV2(body) !== snapshotHash) {
    fail('三线完成快照 Hash 不匹配')
  }
  const seen = new Set<string>()
  for (const [index, track] of value.tracks.entries()) {
    if (track.responsibilityTrack !== TEXT_OPEN_WORLD_RESPONSIBILITY_TRACKS_V1[index]
      || track.state !== 'ready' || !Array.isArray(track.inputs) || track.inputs.length === 0) {
      fail('三线完成快照责任集合或状态无效')
    }
    for (const row of track.inputs) {
      const owner = textOpenWorldArtifactResponsibilityV1(row.artifactKey)
      if (owner.responsibilityTrack !== track.responsibilityTrack || owner.ownerTaskKey !== row.ownerTaskKey
        || !Number.isSafeInteger(row.version) || row.version < 1 || !isSha256Hash(row.contentHash)
        || !isSha256Hash(row.inputHash) || seen.has(row.artifactKey)) fail('三线完成快照产物证据无效')
      seen.add(row.artifactKey)
    }
  }
  const required = [...REQUIRED_INPUTS, ...binding.generatedMediaArtifactKeys]
  if (seen.size !== required.length || required.some(key => !seen.has(key))) fail('三线完成快照必需产物不闭合')
}
