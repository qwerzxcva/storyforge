
import { avgEnum, avgKey, avgList, avgNumber, avgProtocolBody, avgRecord, avgText, avgUnique } from './protocol-validation';
import type { AvgVisualProductionRequirementV1 } from './media-production-contract';
import { parseAvgForegroundPolicy, assertAvgForegroundRequirementBinding, type AvgForegroundPolicy } from './image-foreground-contract';
import { parseAvgImageRegionCompositeRecipeV3, type AvgImageRegionCompositeRecipeV3 } from './image-region-composite-contract';
export const AVG_IMAGE_PROCESSING_PIXEL_LIMIT_V1 = 16 * 1024 * 1024
/** Local pixels only. No provider edit, inferred mask, face repair or quality score. */
export interface AvgImageProcessingRecipeV1 {
  schema: 'storyforge.avg.image-processing-recipe'; version: 1
  /** Explicit crop in 1/10000 source coordinates, before fit/anchor. */
  crop: { x: number; y: number; width: number; height: number } | null
  width: number; height: number; fit: 'contain' | 'cover'
  anchor: { x: number; y: number }
  /** null preserves a transparent canvas; an explicit color flattens padding. */
  background: { red: number; green: number; blue: number; alpha: number } | null
  declaration: string
}
export interface AvgImageProcessingPlanV1 {
  schema: 'storyforge.avg.image-processing-plan'; version: 1
  entries: Array<{ requirementKey: string; recipe: AvgImageProcessingRecipeV1 }>
}
/** Explicit foreground capability. V1 codecs remain strict and unchanged. */
export interface AvgImageProcessingRecipeV2 extends Omit<AvgImageProcessingRecipeV1, 'version'> {
  version: 2
  foreground: AvgForegroundPolicy
}
export type AvgLegacyImageProcessingRecipe = AvgImageProcessingRecipeV1 | AvgImageProcessingRecipeV2
export type AvgImageProcessingRecipe = AvgLegacyImageProcessingRecipe | AvgImageRegionCompositeRecipeV3
export interface AvgImageProcessingPlanV2 {
  schema: 'storyforge.avg.image-processing-plan'
  version: 2
  entries: Array<{ requirementKey: string; recipe: AvgLegacyImageProcessingRecipe }>
}
export interface AvgImageProcessingPlanV3 {
  schema: 'storyforge.avg.image-processing-plan'; version: 3
  entries: Array<{ requirementKey: string; recipe: AvgImageProcessingRecipe }>
}
export type AvgImageProcessingPlan = AvgImageProcessingPlanV1 | AvgImageProcessingPlanV2 | AvgImageProcessingPlanV3
const rect = (value: unknown, label: string, maximum: number, zeroSize = false) => {
  const r = avgRecord(value, ['x', 'y', 'width', 'height'], label)
  return { x: avgNumber(r.x, `${label}.x`, 0, maximum), y: avgNumber(r.y, `${label}.y`, 0, maximum),
    width: avgNumber(r.width, `${label}.width`, zeroSize ? 0 : 1, maximum), height: avgNumber(r.height, `${label}.height`, zeroSize ? 0 : 1, maximum) }
}
export function parseAvgImageProcessingRecipeV1(value: unknown): AvgImageProcessingRecipeV1 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'crop', 'width', 'height', 'fit', 'anchor', 'background', 'declaration'], 'image processing recipe')
  if (r.schema !== 'storyforge.avg.image-processing-recipe' || r.version !== 1) throw new Error('[avg-process] 未登记的加工配方')
  const crop = r.crop === null ? null : rect(r.crop, 'crop', 10000)
  if (crop && (crop.x + crop.width > 10000 || crop.y + crop.height > 10000)) throw new Error('[avg-process] 裁切超出原图范围')
  const anchor = avgRecord(r.anchor, ['x', 'y'], 'anchor')
  const background = r.background === null ? null : avgRecord(r.background, ['red', 'green', 'blue', 'alpha'], 'background')
  const width = avgNumber(r.width, 'output.width', 32, 4096), height = avgNumber(r.height, 'output.height', 32, 4096)
  if (width * height > AVG_IMAGE_PROCESSING_PIXEL_LIMIT_V1) throw new Error('[avg-process] 加工画布超过像素上限')
  return { schema: r.schema, version: 1, crop, width, height, fit: avgEnum(r.fit, ['contain', 'cover'] as const, 'fit'),
    anchor: { x: avgNumber(anchor.x, 'anchor.x', 0, 10000), y: avgNumber(anchor.y, 'anchor.y', 0, 10000) },
    background: background === null ? null : { red: avgNumber(background.red, 'background.red', 0, 255), green: avgNumber(background.green, 'background.green', 0, 255),
      blue: avgNumber(background.blue, 'background.blue', 0, 255), alpha: avgNumber(background.alpha, 'background.alpha', 0, 255) },
    declaration: avgText(r.declaration, 'processing.declaration', 2000) }
}
export function parseAvgImageProcessingPlanV1(value: unknown): AvgImageProcessingPlanV1 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'entries'], 'image processing plan')
  if (r.schema !== 'storyforge.avg.image-processing-plan' || r.version !== 1) throw new Error('[avg-process] 未登记的加工方案')
  const entries = avgUnique(avgList(r.entries, 'processing.entries', value => {
    const e = avgRecord(value, ['requirementKey', 'recipe'], 'processing entry')
    return { requirementKey: avgKey(e.requirementKey, 'processing.requirementKey'), recipe: parseAvgImageProcessingRecipeV1(e.recipe) }
  }, 8), e => e.requirementKey, 'processing entries')
  if (!entries.length) throw new Error('[avg-process] 加工方案不能是空数组；不加工时省略整个字段')
  return { schema: r.schema, version: 1, entries }
}
export function parseAvgImageProcessingRecipeV2(value: unknown): AvgImageProcessingRecipeV2 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'crop', 'width', 'height', 'fit', 'anchor', 'background', 'declaration', 'foreground'], 'foreground processing recipe')
  if (r.schema !== 'storyforge.avg.image-processing-recipe' || r.version !== 2) throw new Error('[avg-process] 未登记的前景加工配方')
  const { foreground, ...fields } = r
  const base = parseAvgImageProcessingRecipeV1({ ...fields, version: 1 })
  if (base.background !== null) throw new Error('[avg-process] 前景分离配方不能以画布底色覆盖实际 alpha')
  return { ...base, version: 2, foreground: parseAvgForegroundPolicy(foreground) }
}
export function parseAvgImageProcessingRecipe(value: unknown): AvgImageProcessingRecipe {
  const body = avgProtocolBody(value)
  const version = body && typeof body === 'object' && 'version' in body ? body.version : null
  if (version === 1) return parseAvgImageProcessingRecipeV1(body)
  if (version === 2) return parseAvgImageProcessingRecipeV2(body)
  if (version === 3) return parseAvgImageRegionCompositeRecipeV3(body)
  throw new Error('[avg-process] 未登记的加工配方版本')
}
export function parseAvgImageProcessingPlanV2(value: unknown): AvgImageProcessingPlanV2 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'entries'], 'foreground processing plan')
  if (r.schema !== 'storyforge.avg.image-processing-plan' || r.version !== 2) throw new Error('[avg-process] 未登记的前景加工方案')
  const entries = avgUnique(avgList(r.entries, 'processing.entries', value => {
    const e = avgRecord(value, ['requirementKey', 'recipe'], 'processing entry')
    const recipe = parseAvgImageProcessingRecipe(e.recipe)
    if (recipe.version === 3) throw new Error('[avg-process] V2 方案不能解释局部合成配方')
    return { requirementKey: avgKey(e.requirementKey, 'processing.requirementKey'), recipe }
  }, 8), e => e.requirementKey, 'processing entries')
  if (!entries.some(e => e.recipe.version === 2)) throw new Error('[avg-process] 前景加工方案必须包含明确的新版本配方')
  return { schema: r.schema, version: 2, entries }
}
export function parseAvgImageProcessingPlanV3(value: unknown): AvgImageProcessingPlanV3 {
  const r = avgRecord(avgProtocolBody(value), ['schema', 'version', 'entries'], 'region composition plan')
  if (r.schema !== 'storyforge.avg.image-processing-plan' || r.version !== 3) throw new Error('[avg-process] 未登记的局部合成方案')
  const entries = avgUnique(avgList(r.entries, 'processing.entries', value => {
    const e = avgRecord(value, ['requirementKey', 'recipe'], 'processing entry')
    return { requirementKey: avgKey(e.requirementKey, 'processing.requirementKey'), recipe: parseAvgImageProcessingRecipe(e.recipe) }
  }, 8), e => e.requirementKey, 'processing entries')
  if (!entries.some(e => e.recipe.version === 3)) throw new Error('[avg-process] V3 方案必须含明确局部合成配方')
  return { schema: r.schema, version: 3, entries }
}
export function parseAvgImageProcessingPlan(value: unknown): AvgImageProcessingPlan {
  const body = avgProtocolBody(value)
  const version = body && typeof body === 'object' && 'version' in body ? body.version : null
  if (version === 1) return parseAvgImageProcessingPlanV1(body)
  if (version === 2) return parseAvgImageProcessingPlanV2(body)
  if (version === 3) return parseAvgImageProcessingPlanV3(body)
  throw new Error('[avg-process] 未登记的加工方案版本')
}
function assertAvgImageProcessingCanvasRequirements(plan:AvgImageProcessingPlan,requirements:ReadonlyArray<Pick<AvgVisualProductionRequirementV1,'requirementKey'|'width'|'height'|'alpha'>>){
  for(const entry of plan.entries){
    const r=requirements.find(r=>r.requirementKey===entry.requirementKey),p=entry.recipe
    if(!r)throw new Error('[avg-process] 加工缺少准确冻结需求')
    if(p.width<r.width||p.height<r.height||Math.abs((p.width/p.height)/(r.width/r.height)-1)>0.02)throw new Error('[avg-process] 加工画布不满足冻结需求的最小尺寸或画幅，请先修订配方')
    if(r.alpha==='required'&&p.version!==3&&p.background?.alpha===255)throw new Error('[avg-process] 必需透明需求不能使用不透明底色填充')
  }
}
export type AvgImageProcessingRequirement = Pick<AvgVisualProductionRequirementV1,
  'requirementKey'|'width'|'height'|'alpha'|'mediaKind'|'consumer'|'invariants'|'forbiddenDepictions'>

/** Frozen readers validate the declaration; they never add it after a request. */
export function assertAvgImageProcessingRequirements(plan:AvgImageProcessingPlan,requirements:ReadonlyArray<AvgImageProcessingRequirement>){
  assertAvgImageProcessingCanvasRequirements(plan,requirements)
  for(const {requirementKey,recipe} of plan.entries)if(recipe.version===2){
    const requirement=requirements.find(r=>r.requirementKey===requirementKey)!
    assertAvgForegroundRequirementBinding(recipe.foreground,requirement)
  }else if(recipe.version===3){
    const requirement=requirements.find(r=>r.requirementKey===requirementKey)!
    if(requirement.mediaKind!=='character-expression')throw new Error('[avg-process] 局部合成只允许角色表情需求')
  }
}
export function avgProcessedImageArtifactKeyV1(requirementKey: string) { return `avg.media.processed.${avgKey(requirementKey, 'requirementKey')}` }
