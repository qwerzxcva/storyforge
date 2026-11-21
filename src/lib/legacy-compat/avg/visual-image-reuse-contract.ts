
import { avgHash, avgKey, avgProtocolBody, avgRecord, avgList, avgUnique } from './protocol-validation';
import { parseAvgVisualArtifactRefV4, type AvgVisualArtifactRefV4 } from './visual-planning-reuse-contract';
import { parseAvgVisualRawProducerProofV4, parseAvgVisualRawProducerProofV5, type AvgGeneratedReferenceSourceV2, type AvgGeneratedReferenceSourceV5 } from './media-generated-reference-contract';

/** Original unselected pixels, without an old author choice or host-local
 * locator. This descriptor grants neither current adoption nor outbound use. */
export interface AvgVisualRawReuseSourceV4 {
  schema:'storyforge.avg.visual-raw-reuse-source'; version:1
  productionKey:string; requirementKey:string
  raw:AvgGeneratedReferenceSourceV2['raw']
  compilation:AvgVisualArtifactRefV4
  sourceWorldContentHash:string
  requirementHash:string; semanticRequirementHash:string
}

/** V5 keeps the original raw2 producer and compilation proof. It is a source
 * selection only; a later Build must produce its own zero-call reuse receipt,
 * review and author choice. */
export interface AvgVisualRawReuseSourceV5 {
  schema:'storyforge.avg.visual-raw-reuse-source'; version:2
  productionKey:string; requirementKey:string
  raw:AvgGeneratedReferenceSourceV5['raw']
  compilation:AvgVisualArtifactRefV4
  sourceWorldContentHash:string
  requirementHash:string; semanticRequirementHash:string
}

export function parseAvgVisualRawReuseSourceV4(value:unknown):AvgVisualRawReuseSourceV4 {
  const r=avgRecord(avgProtocolBody(value),['schema','version','productionKey','requirementKey','raw','compilation',
    'sourceWorldContentHash','requirementHash','semanticRequirementHash'],'visual raw reuse source')
  if(r.schema!=='storyforge.avg.visual-raw-reuse-source'||r.version!==1)throw new Error('[avg-visual-raw-reuse] 原图来源版本无效')
  const requirementKey=avgKey(r.requirementKey,'raw reuse requirementKey'),compilation=parseAvgVisualArtifactRefV4(r.compilation)
  if(compilation.artifactKey!=='avg.media.compiled-visual-requirements')throw new Error('[avg-visual-raw-reuse] 原图必须绑定原始需求编译')
  return {schema:r.schema,version:1,productionKey:avgKey(r.productionKey,'raw reuse productionKey'),requirementKey,
    raw:parseAvgVisualRawProducerProofV4(r.raw,requirementKey),compilation,
    sourceWorldContentHash:avgHash(r.sourceWorldContentHash,'raw reuse world hash'),
    requirementHash:avgHash(r.requirementHash,'raw reuse requirement hash'),semanticRequirementHash:avgHash(r.semanticRequirementHash,'raw reuse semantic hash')}
}

export function parseAvgVisualRawReuseSourceV5(value:unknown):AvgVisualRawReuseSourceV5 {
  const r=avgRecord(avgProtocolBody(value),['schema','version','productionKey','requirementKey','raw','compilation',
    'sourceWorldContentHash','requirementHash','semanticRequirementHash'],'V5 visual raw reuse source')
  if(r.schema!=='storyforge.avg.visual-raw-reuse-source'||r.version!==2)throw new Error('[avg-visual-raw-reuse] V5 原图来源版本无效')
  const requirementKey=avgKey(r.requirementKey,'V5 raw reuse requirementKey'),compilation=parseAvgVisualArtifactRefV4(r.compilation)
  if(compilation.artifactKey!=='avg.media.compiled-visual-requirements')throw new Error('[avg-visual-raw-reuse] V5 原图必须绑定原始需求编译')
  return {schema:r.schema,version:2,productionKey:avgKey(r.productionKey,'V5 raw reuse productionKey'),requirementKey,
    raw:parseAvgVisualRawProducerProofV5(r.raw,requirementKey),compilation,
    sourceWorldContentHash:avgHash(r.sourceWorldContentHash,'V5 raw reuse world hash'),
    requirementHash:avgHash(r.requirementHash,'V5 raw reuse requirement hash'),semanticRequirementHash:avgHash(r.semanticRequirementHash,'V5 raw reuse semantic hash')}
}

export function parseAvgVisualRawReuseSourcesV4(value:unknown,requirementKeys:readonly string[]){
  const sources=avgUnique(avgList(value,'raw reuse',parseAvgVisualRawReuseSourceV4,8),s=>s.requirementKey,'raw reuse requirement')
  if(!sources.length||sources.some(s=>!requirementKeys.includes(s.requirementKey)))throw new Error('[avg-visual-raw-reuse] 原图沿用为空或超出准确批次')
  return sources
}

export function parseAvgVisualRawReuseSourcesV5(value:unknown,requirementKeys:readonly string[]){
  const sources=avgUnique(avgList(value,'V5 raw reuse',parseAvgVisualRawReuseSourceV5,8),s=>s.requirementKey,'V5 raw reuse requirement')
  if(!sources.length||sources.some(s=>!requirementKeys.includes(s.requirementKey)))throw new Error('[avg-visual-raw-reuse] V5 原图沿用为空或超出准确批次')
  return sources
}
