
import { avgHash, avgKey, avgNumber, avgProtocolBody, avgRecord } from './protocol-validation';
import { parseAvgGeneratedSoundSourceV1, type AvgGeneratedSoundSourceV1 } from './stage-sound-source-contract';

/** Actual portable proof emitted by the historical local-audio producer
 * reader. It identifies a completed producer, never a new execution grant. */
export interface AvgRetainedSoundProcessingProofV1 {
  schema: 'storyforge.avg.audio-processing-producer-proof'; version: 1; noProviderRequest: true
  buildNumber: number; briefHash: string; planHash: string; controlEpoch: number
  taskKey: string; artifactKey: string; artifactVersion: number; contentHash: string
  inputHash: string; producerReceiptHash: string; candidateHash: string; proofHash: string
  processingEvidenceHash: string
}
export interface AvgGeneratedSoundSourceV2 extends Omit<AvgGeneratedSoundSourceV1, 'version'> {
  version: 2
  processing: AvgRetainedSoundProcessingProofV1
}
export type AvgGeneratedSoundSource = AvgGeneratedSoundSourceV1 | AvgGeneratedSoundSourceV2

/** Explicit derivative locator. The original sound contract stays strict;
 * both real producers, rights, audition and adoption must be proved on read. */
export function parseAvgGeneratedSoundSourceV2(value: unknown): AvgGeneratedSoundSourceV2 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'productionKey', 'buildNumber', 'controlEpoch',
    'briefHash', 'planHash', 'requirementKey', 'requestIdentityHash', 'raw', 'compiled', 'review', 'choice', 'processing'], 'processed generated sound source')
  if (r.version !== 2) throw new Error('[avg-sound-process] 加工声音沿用来源须为独立版本')
  const base = parseAvgGeneratedSoundSourceV1({ schema: r.schema, version: 1, productionKey: r.productionKey,
    buildNumber: r.buildNumber, controlEpoch: r.controlEpoch, briefHash: r.briefHash, planHash: r.planHash,
    requirementKey: r.requirementKey, requestIdentityHash: r.requestIdentityHash,
    raw: r.raw, compiled: r.compiled, review: r.review, choice: r.choice })
  const p = avgRecord(r.processing, ['schema', 'version', 'noProviderRequest', 'buildNumber', 'briefHash', 'planHash',
    'controlEpoch', 'taskKey', 'artifactKey', 'artifactVersion', 'contentHash', 'inputHash', 'producerReceiptHash',
    'candidateHash', 'proofHash', 'processingEvidenceHash'], 'retained sound processing proof')
  if (p.schema !== 'storyforge.avg.audio-processing-producer-proof' || p.version !== 1 || p.noProviderRequest !== true) {
    throw new Error('[avg-sound-process] 加工声音须保留独立零请求producer证明')
  }
  const processing: AvgRetainedSoundProcessingProofV1 = { schema: p.schema, version: 1, noProviderRequest: true,
    buildNumber: avgNumber(p.buildNumber, 'sound processing build', 1, 1e9),
    briefHash: avgHash(p.briefHash, 'sound processing brief'), planHash: avgHash(p.planHash, 'sound processing plan'),
    controlEpoch: avgNumber(p.controlEpoch, 'sound processing epoch', 0, 1e9),
    taskKey: avgKey(p.taskKey, 'sound processing task'), artifactKey: avgKey(p.artifactKey, 'sound processing artifact'),
    artifactVersion: avgNumber(p.artifactVersion, 'sound processing artifact version', 1, 1e9),
    contentHash: avgHash(p.contentHash, 'sound processing content'), inputHash: avgHash(p.inputHash, 'sound processing input'),
    producerReceiptHash: avgHash(p.producerReceiptHash, 'sound processing producer'),
    candidateHash: avgHash(p.candidateHash, 'sound processing candidate'), proofHash: avgHash(p.proofHash, 'sound processing proof'),
    processingEvidenceHash: avgHash(p.processingEvidenceHash, 'sound processing evidence') }
  if (processing.taskKey !== `avg.sound.process.${base.requirementKey}` || processing.artifactKey !== `avg.sound.processed.${base.requirementKey}`
    || processing.buildNumber !== base.buildNumber || processing.briefHash !== base.briefHash
    || processing.planHash !== base.planHash || processing.controlEpoch !== base.controlEpoch) {
    throw new Error('[avg-sound-process] 加工声音与原件的准确需求、版本或冻结生产图不一致')
  }
  return { ...base, version: 2, processing }
}

export function parseAvgGeneratedSoundSource(value: unknown): AvgGeneratedSoundSource {
  return (avgProtocolBody(value) as { version?: unknown } | null)?.version === 2
    ? parseAvgGeneratedSoundSourceV2(value) : parseAvgGeneratedSoundSourceV1(value)
}
