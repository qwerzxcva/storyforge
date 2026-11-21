
import { parseAvgGeneratedImageSource, type AvgGeneratedImageSource } from './media-generated-reference-contract';
import { parseAvgMediaReferencesV1, type AvgMediaReferenceV1 } from './media-reference-contract';
import { avgList, avgRecord, avgText, avgUnique } from './protocol-validation';

/** Explicit later-request consent and content selection. Local stage adoption
 * never implies outbound permission. These instructions are not a guarantee
 * that a provider can isolate style, identity or any other visible content. */
export interface AvgMediaReferenceV2 extends Omit<AvgMediaReferenceV1, 'generatedSource'> {
  schema: 'storyforge.avg.media-reference'
  version: 2
  generatedSource?: AvgGeneratedImageSource
  contentPolicy: { permittedFeatures: string[]; excludedFeatures: string[] }
}

/** Scalar input metadata only; never an alternate lookup for a generated source. */
export function avgReferenceMetadataV2(reference: AvgMediaReferenceV2): Omit<AvgMediaReferenceV1, 'generatedSource'> {
  const { schema: _schema, version: _version, contentPolicy: _policy, generatedSource: _source, ...metadata } = reference
  return metadata
}

export function parseAvgMediaReferencesV2(value: unknown): AvgMediaReferenceV2[] {
  const references = avgList(value, 'versioned references', value => {
    const hasSource = !!value && Object.prototype.hasOwnProperty.call(value, 'generatedSource')
    const r = avgRecord(value, ['schema', 'version', 'assetKey', 'assetVersion', 'contentHash', 'mimeType', 'byteSize', 'purpose',
      'allowedChange', 'dataClass', 'license', 'providerInputAllowed', 'derivativeUseAllowed', 'crop', 'mask', 'contentPolicy',
      ...(hasSource ? ['generatedSource'] : [])], 'versioned reference')
    if (r.schema !== 'storyforge.avg.media-reference' || r.version !== 2) throw new Error('[avg-reference] 参考输入版本无效')
    const { schema: _schema, version: _version, contentPolicy: policyValue, generatedSource: _source, ...metadata } = r
    const base = parseAvgMediaReferencesV1([metadata])[0]!
    const policy = avgRecord(policyValue, ['permittedFeatures', 'excludedFeatures'], 'reference content policy')
    const features = (value: unknown, key: string) => avgUnique(avgList(value, key, (v, p) => avgText(v, p, 500), 16), v => v, key)
    const permittedFeatures = features(policy.permittedFeatures, 'permittedFeatures'), excludedFeatures = features(policy.excludedFeatures, 'excludedFeatures')
    if (!permittedFeatures.length || permittedFeatures.some(f => excludedFeatures.includes(f))) throw new Error('[avg-reference] 必须明确允许的参考内容，且不能同时要求排除')
    const generatedSource = hasSource ? parseAvgGeneratedImageSource(r.generatedSource) : undefined
    const generatedContentHash=generatedSource&&'processing'in generatedSource&&generatedSource.processing
      ?generatedSource.processing.contentHash:generatedSource?.raw.contentHash
    if (generatedSource && generatedContentHash !== base.contentHash) {
      throw new Error('[avg-reference] 参考必须绑定准确已采用原图或衍生图字节')
    }
    return { schema: 'storyforge.avg.media-reference' as const, version: 2 as const, ...base, ...(generatedSource ? { generatedSource } : {}),
      contentPolicy: { permittedFeatures, excludedFeatures } }
  }, 4)
  // Reuse the established total-byte, format and duplicate-asset constraints.
  // No generated source is resolved through this scalar-only validation.
  parseAvgMediaReferencesV1(references.map(avgReferenceMetadataV2))
  if (JSON.stringify(references.map(r => r.contentPolicy)).length > 12_000) throw new Error('[avg-reference] 参考内容声明超过本批文本上限')
  return references
}
