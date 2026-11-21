
import { avgHash, avgKey, avgNumber, avgRecord } from './protocol-validation';

type Ref = { artifactKey: string; version: number; contentHash: string }
type AdoptedRef = Ref & { authorReceiptHash: string }

/** Portable original locators, not new production or author authority. */
export interface AvgGeneratedSoundSourceV1 {
  schema: 'storyforge.avg.generated-sound-source'; version: 1
  productionKey: string; buildNumber: number; controlEpoch: number; briefHash: string; planHash: string
  requirementKey: string; requestIdentityHash: string
  raw: Ref & { producerReceiptHash: string; responseEvidenceHash: string; requestSnapshotHash: string; rightsHash: string }
  compiled: Ref; review: AdoptedRef; choice: AdoptedRef
}

export function parseAvgGeneratedSoundSourceV1(value: unknown): AvgGeneratedSoundSourceV1 {
  const r = avgRecord(value, ['schema', 'version', 'productionKey', 'buildNumber', 'controlEpoch', 'briefHash', 'planHash',
    'requirementKey', 'requestIdentityHash', 'raw', 'compiled', 'review', 'choice'], 'generated sound source')
  if (r.schema !== 'storyforge.avg.generated-sound-source' || r.version !== 1) throw new Error('[avg-sound] 已采用声音来源版本无效')
  const requirementKey = avgKey(r.requirementKey, 'sound source requirement')
  const reference = (value: unknown, key: string, extra: string[] = []) => {
    const row = avgRecord(value, ['artifactKey', 'version', 'contentHash', ...extra], 'sound source reference')
    if (row.artifactKey !== key) throw new Error('[avg-sound] 沿用必须绑定同一需求的准确原音频、编译、审听与选用')
    return { artifactKey: key, version: avgNumber(row.version, 'sound source version', 1, 1e6), contentHash: avgHash(row.contentHash, 'sound source hash'),
      ...Object.fromEntries(extra.map(k => [k, avgHash(row[k], `sound source ${k}`)])) }
  }
  const raw = reference(r.raw, `avg.sound.raw.${requirementKey}`, ['producerReceiptHash', 'responseEvidenceHash', 'requestSnapshotHash', 'rightsHash']) as AvgGeneratedSoundSourceV1['raw']
  return { schema: r.schema, version: 1, productionKey: avgKey(r.productionKey, 'sound source production'),
    buildNumber: avgNumber(r.buildNumber, 'sound source build', 1, 1e9), controlEpoch: avgNumber(r.controlEpoch, 'sound source epoch', 0, 1e9),
    briefHash: avgHash(r.briefHash, 'sound source brief'), planHash: avgHash(r.planHash, 'sound source plan'), requirementKey,
    requestIdentityHash: avgHash(r.requestIdentityHash, 'sound source identity'), raw,
    compiled: reference(r.compiled, 'avg.media.compiled-sound-requirements'),
    review: reference(r.review, `avg.review.audio.${requirementKey}`, ['authorReceiptHash']) as AdoptedRef,
    choice: reference(r.choice, `avg.sound.choice.${requirementKey}`, ['authorReceiptHash']) as AdoptedRef }
}
