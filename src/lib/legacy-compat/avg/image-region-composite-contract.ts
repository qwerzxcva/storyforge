import { avgEnum, avgHash, avgKey, avgList, avgNumber, avgProtocolBody, avgRecord, avgText } from './protocol-validation';

/** Experimental internal codec, with no product admission or execution authority.
 * Original raw/selected-base ownership and producer proof belong to the caller. */
export const AVG_REGION_COMPOSITE_ALGORITHM_V1 = 'storyforge.avg.region-bilinear-srgb.v1' as const
export const AVG_REGION_COMPOSITE_PIXEL_LIMIT_V1 = 16 * 1024 * 1024
export interface AvgRegionRectV1 { x: number; y: number; width: number; height: number }
export interface AvgImageRegionCompositeRecipeV3 {
  schema: 'storyforge.avg.image-processing-recipe'; version: 3
  algorithm: typeof AVG_REGION_COMPOSITE_ALGORITHM_V1
  width: number; height: number
  baseReference: { assetKey: string; assetVersion: number; contentHash: string }
  regions: Array<{ source: AvgRegionRectV1; target: AvgRegionRectV1; featherPx: number }>
  alphaPolicy: 'preserve-base-alpha'
  declaration: string
}

function parseRect(value: unknown, label: string): AvgRegionRectV1 {
  const r = avgRecord(value, ['x', 'y', 'width', 'height'], label)
  const result = { x: avgNumber(r.x, `${label}.x`, 0, 10000), y: avgNumber(r.y, `${label}.y`, 0, 10000),
    width: avgNumber(r.width, `${label}.width`, 1, 10000), height: avgNumber(r.height, `${label}.height`, 1, 10000) }
  if (result.x + result.width > 10000 || result.y + result.height > 10000) throw new Error('[avg-composite] ROI 超出图像')
  return result
}

export function parseAvgImageRegionCompositeRecipeV3(value: unknown): AvgImageRegionCompositeRecipeV3 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'algorithm', 'width', 'height', 'baseReference', 'regions', 'alphaPolicy', 'declaration'], 'region composite recipe')
  if (r.schema !== 'storyforge.avg.image-processing-recipe' || r.version !== 3) throw new Error('[avg-composite] 未登记的合成配方')
  const base = avgRecord(r.baseReference, ['assetKey', 'assetVersion', 'contentHash'], 'composite.baseReference')
  const width = avgNumber(r.width, 'composite.width', 32, 4096), height = avgNumber(r.height, 'composite.height', 32, 4096)
  if (width * height > AVG_REGION_COMPOSITE_PIXEL_LIMIT_V1) throw new Error('[avg-composite] 画布超过有界像素上限')
  const regions = avgList(r.regions, 'composite.regions', (value, label) => {
    const e = avgRecord(value, ['source', 'target', 'featherPx'], label)
    return { source: parseRect(e.source, `${label}.source`), target: parseRect(e.target, `${label}.target`),
      featherPx: avgNumber(e.featherPx, `${label}.featherPx`, 0, 16) }
  }, 4)
  if (!regions.length) throw new Error('[avg-composite] 至少需要一个明确 ROI')
  return { schema: r.schema, version: 3,
    algorithm: avgEnum(r.algorithm, [AVG_REGION_COMPOSITE_ALGORITHM_V1], 'composite.algorithm'), width, height,
    baseReference: { assetKey: avgKey(base.assetKey, 'composite.baseReference.assetKey'),
      assetVersion: avgNumber(base.assetVersion, 'composite.baseReference.assetVersion', 1, Number.MAX_SAFE_INTEGER),
      contentHash: avgHash(base.contentHash, 'composite.baseReference.contentHash') }, regions,
    alphaPolicy: avgEnum(r.alphaPolicy, ['preserve-base-alpha'], 'composite.alphaPolicy'),
    declaration: avgText(r.declaration, 'composite.declaration', 2000) }
}
