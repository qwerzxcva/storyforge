import type { ComicLetteringItemV1, ComicMediaAsset, ComicNormalizedFrameV1, MediaBlobObject, MediaBlobObjectRecordV1 } from '../../types/index';

const STABLE_KEY = /^[a-z0-9][a-z0-9._-]{0,95}$/i
const COLOR = /^(#[0-9a-f]{6}|rgba?\([^)]{1,80}\)|transparent)$/i

function assertText(value: unknown, label: string, max: number, required = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`[comic] ${label} 非法`)
}

export function assertNormalizedFrameV1(frame: ComicNormalizedFrameV1, label: string, minimum = 0.01): void {
  if (!frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)) throw new Error(`[comic] ${label} 必须使用有限数值`)
  if (frame.x < 0 || frame.y < 0 || frame.width < minimum || frame.height < minimum || frame.x + frame.width > 1.000001 || frame.y + frame.height > 1.000001) {
    throw new Error(`[comic] ${label} 越过页面边界或尺寸过小`)
  }
}

export function framesOverlap(left: ComicNormalizedFrameV1, right: ComicNormalizedFrameV1): boolean {
  const overlapWidth = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)
  const overlapHeight = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y)
  return overlapWidth > 0.0001 && overlapHeight > 0.0001
}

export function assertComicLetteringV1(items: ComicLetteringItemV1[]): void {
  if (!Array.isArray(items) || items.length > 80) throw new Error('[comic] 每格排字最多 80 项')
  const ids = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (!item || !STABLE_KEY.test(item.id) || ids.has(item.id)) throw new Error(`[comic] 排字 ${index + 1} id 非法或重复`)
    ids.add(item.id)
    if (!['speech', 'thought', 'caption', 'sfx'].includes(item.kind)) throw new Error('[comic] 排字类型非法')
    assertText(item.text, `排字 ${item.id} 文本`, 2_000, true)
    assertNormalizedFrameV1(item.frame, `排字 ${item.id} frame`, 0.02)
    if (!['horizontal', 'vertical'].includes(item.direction) || !['storyforge-sans', 'storyforge-serif'].includes(item.fontFamily)) throw new Error('[comic] 排字方向或字体非法')
    if (!Number.isFinite(item.fontSize) || item.fontSize < 6 || item.fontSize > 144 || !Number.isFinite(item.strokeWidth) || item.strokeWidth < 0 || item.strokeWidth > 20) throw new Error('[comic] 排字号或描边非法')
    if (![item.textColor, item.fillColor, item.strokeColor].every(color => typeof color === 'string' && COLOR.test(color))) throw new Error('[comic] 排字颜色非法')
    if (item.tail && (!Number.isFinite(item.tail.x) || !Number.isFinite(item.tail.y) || item.tail.x < 0 || item.tail.x > 1 || item.tail.y < 0 || item.tail.y > 1)) throw new Error('[comic] 气泡尾锚点非法')
    if (!Number.isInteger(item.zIndex) || item.zIndex < 0 || item.zIndex > 999) throw new Error('[comic] 排字层级非法')
  }
}

export function assertMediaBlobObjectV1(blob: MediaBlobObjectRecordV1): asserts blob is MediaBlobObject {
  if (!(blob.data instanceof ArrayBuffer)
    || typeof blob.width !== 'number'
    || typeof blob.height !== 'number'
    || !/^[a-f0-9]{64}$/.test(blob.contentHash)
    || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.mimeType)
    || blob.byteSize !== blob.data.byteLength
    || blob.byteSize < 16
    || blob.byteSize > 25 * 1024 * 1024
    || !Number.isInteger(blob.width)
    || !Number.isInteger(blob.height)
    || blob.width < 1
    || blob.height < 1
    || blob.width > 16384
    || blob.height > 16384) throw new Error('[media] Blob 元数据、尺寸或体积非法')
}

export function assertComicMediaAssetV1(asset: ComicMediaAsset): void {
  if (!STABLE_KEY.test(asset.stableKey) || !['panel-render', 'character-sheet', 'location-sheet', 'prop-sheet', 'style-reference'].includes(asset.role)) throw new Error('[media] 漫画 asset stableKey 或 role 非法')
  if (asset.role === 'panel-render' ? (asset.panelId == null || asset.subjectKey != null) : (asset.panelId != null || !asset.subjectKey)) throw new Error('[media] 漫画 asset role/owner 组合非法')
  if (asset.origin === 'generated') {
    if (!asset.requestHash || !asset.promptHash || !asset.providerReceipt) throw new Error('[media] generated asset 缺少请求证据')
  } else if (asset.requestHash != null || asset.promptHash != null || asset.providerReceipt != null) throw new Error('[media] uploaded asset 不能伪造 provider 证据')
  if (!Number.isInteger(asset.candidateIndex) || asset.candidateIndex < 0 || asset.candidateIndex > 99 || !Array.isArray(asset.referenceAssetKeys) || new Set(asset.referenceAssetKeys).size !== asset.referenceAssetKeys.length || asset.referenceAssetKeys.includes(asset.stableKey)) throw new Error('[media] asset 候选序号或参考引用非法')
  if (!asset.rights || asset.rights.version !== 1 || !asset.rights.declaration.trim() || !Number.isInteger(asset.rights.declaredAt)) throw new Error('[media] 媒体 rights 声明不完整')
  if (!asset.quality || !Number.isInteger(asset.quality.width) || !Number.isInteger(asset.quality.height) || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.quality.mimeType)) throw new Error('[media] 媒体质量元数据非法')
}
