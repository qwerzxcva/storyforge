
import { avgBoolean, avgEnum, avgHash, avgKey, avgList, avgNumber, avgRecord, avgText, avgUnique } from './protocol-validation';
import { parseAvgGeneratedReferenceSourceV1, type AvgGeneratedReferenceSourceV1 } from './media-generated-reference-contract';

/** AVG-only extension. V1 callers and the other products' request bytes stay unchanged. */
export const AVG_IMAGE_REFERENCE_CAPABILITY_V1 = {
  schema: 'storyforge.avg.image-reference-capability', version: 1,
  adapterId: 'agnes.image-2.1-flash.v1', model: 'agnes-image-2.1-flash',
  endpoint: '/v1/images/generations', responseMode: 'synchronous',
  referenceEncoding: 'data-uri', maximumReferences: 4, maximumReferenceBytes: 8 * 1024 * 1024,
  maximumTotalReferenceBytes: 24 * 1024 * 1024,
  purposes: ['identity', 'pose', 'composition', 'style', 'detail'],
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp'], tiers: ['1K', '2K'],
  nativeCrop: false, nativeMask: false, guaranteedAlpha: false, operationLookup: false,
  source: 'https://agnes-ai.com/en/docs/agnes-image-21-flash',
} as const

/** A distinct, explicitly frozen model capability. Limits are StoryForge's
 * bounded input policy; public pricing is not an account billing receipt. */
export const AVG_IMAGE_REFERENCE_CAPABILITY_V2 = {
  ...AVG_IMAGE_REFERENCE_CAPABILITY_V1,version:2,adapterId:'agnes.image-2.5-flash.v1',model:'agnes-image-2.5-flash',
  source:'https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash',
} as const
export type AvgImageAdapterIdV4=typeof AVG_IMAGE_REFERENCE_CAPABILITY_V1.adapterId|typeof AVG_IMAGE_REFERENCE_CAPABILITY_V2.adapterId
export function avgImageReferenceCapabilityV2(adapterId:string){
  if(adapterId===AVG_IMAGE_REFERENCE_CAPABILITY_V1.adapterId)return AVG_IMAGE_REFERENCE_CAPABILITY_V1
  if(adapterId===AVG_IMAGE_REFERENCE_CAPABILITY_V2.adapterId)return AVG_IMAGE_REFERENCE_CAPABILITY_V2
  throw new Error('[avg-media] 未登记的准确图片模型能力')
}

export interface AvgMediaReferenceV1 {
  assetKey: string
  assetVersion: number
  contentHash: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  byteSize: number
  purpose: typeof AVG_IMAGE_REFERENCE_CAPABILITY_V1.purposes[number]
  allowedChange: string
  dataClass: string
  license: string
  providerInputAllowed: true
  derivativeUseAllowed: true
  /** Unsupported operations must be explicit; never silently discard a mask/crop. */
  crop: null
  mask: null
  generatedSource?: AvgGeneratedReferenceSourceV1
}

export function parseAvgMediaReferencesV1(value: unknown): AvgMediaReferenceV1[] {
  const capability = AVG_IMAGE_REFERENCE_CAPABILITY_V1
  const references = avgUnique(avgList(value, 'references', value => {
    const hasGeneratedSource = !!value && Object.prototype.hasOwnProperty.call(value, 'generatedSource')
    const r = avgRecord(value, ['assetKey', 'assetVersion', 'contentHash', 'mimeType', 'byteSize', 'purpose',
      'allowedChange', 'dataClass', 'license', 'providerInputAllowed', 'derivativeUseAllowed', 'crop', 'mask',
      ...(hasGeneratedSource ? ['generatedSource'] : [])], 'reference')
    if (!avgBoolean(r.providerInputAllowed, 'providerInputAllowed') || !avgBoolean(r.derivativeUseAllowed, 'derivativeUseAllowed')) {
      throw new Error('[avg-media] 参考缺少向 provider 发送及衍生使用的授权')
    }
    if (r.crop !== null || r.mask !== null) throw new Error('[avg-media] 当前能力不支持原生 crop/mask；请先生成有 lineage 的加工候选')
    const generatedSource = hasGeneratedSource ? parseAvgGeneratedReferenceSourceV1(r.generatedSource) : null
    if (generatedSource && generatedSource.raw.contentHash !== r.contentHash) throw new Error('[avg-media] 生成参考必须使用原图准确字节')
    return {
      assetKey: avgKey(r.assetKey, 'reference.assetKey'), assetVersion: avgNumber(r.assetVersion, 'reference.assetVersion', 1, 1_000_000),
      contentHash: avgHash(r.contentHash, 'reference.contentHash'), mimeType: avgEnum(r.mimeType, capability.mimeTypes, 'reference.mimeType'),
      byteSize: avgNumber(r.byteSize, 'reference.byteSize', 24, capability.maximumReferenceBytes),
      purpose: avgEnum(r.purpose, capability.purposes, 'reference.purpose'), allowedChange: avgText(r.allowedChange, 'reference.allowedChange', 2000),
      dataClass: avgKey(r.dataClass, 'reference.dataClass'), license: avgText(r.license, 'reference.license', 2000),
      providerInputAllowed: true as const, derivativeUseAllowed: true as const, crop: null, mask: null,
      ...(generatedSource ? { generatedSource } : {}),
    }
  }, capability.maximumReferences), r => r.assetKey, 'references')
  if (references.reduce((sum, r) => sum + r.byteSize, 0) > capability.maximumTotalReferenceBytes) throw new Error('[avg-media] 参考总字节超过本批上限')
  return references
}
