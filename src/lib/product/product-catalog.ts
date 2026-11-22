/**
 * ARCH-07B · StoryForge product entry catalog.
 *
 * This registry describes release maturity and cross-product ownership only.
 * Product-specific feature acceptance remains in each product contract; a page
 * or route existing in the bundle never upgrades its maturity automatically.
 */
import type { NovelWorkflowProfile, WorkKind } from '../types/world-ownership';
import { isProductAvailableInBuild } from '../runtime/app-mode';

export const PRODUCT_RELEASE_STATUSES_V1 = [
  'experimental',
  'internal',
  'preview',
  'released',
] as const

export type ProductReleaseStatusV1 = typeof PRODUCT_RELEASE_STATUSES_V1[number]
export type ProductCatalogChannelV1 = 'local-development' | 'production' | 'test'

export const PRODUCT_SOURCE_POLICIES_V1 = ['independent-work'] as const

export type ProductSourcePolicyV1 = typeof PRODUCT_SOURCE_POLICIES_V1[number]

export type StoryForgeProductIdV1 = 'independent.longform' | 'authoring.nodes'

export interface ProductCatalogEntryV1 {
  version: 1
  id: StoryForgeProductIdV1
  label: string
  family: 'independent-creation' | 'authoring-view'
  status: ProductReleaseStatusV1
  /** Governing charter phase; this is not a claim that the phase is complete. */
  charterPhase: 'B' | 'C' | 'D' | 'E' | 'F'
  /** The authoritative source families from which this product may be created. */
  sourcePolicy: ProductSourcePolicyV1
  ownsRuntime: boolean
  ownsMedia: boolean
  /** Every non-released surface must state why it is not a production promise. */
  maturityNote: string
}

/**
 * One navigation surface may contain several independent products, but it may
 * never borrow the maturity of one representative product.  The surface
 * registry is therefore derived from explicit product identities and every
 * product is still checked again when the author enters or creates it.
 */
export type ProductSurfaceIdV1 = 'independent-works' | 'node-authoring'

export interface ProductSurfaceEntryV1 {
  version: 1
  id: ProductSurfaceIdV1
  label: string
  productIds: readonly StoryForgeProductIdV1[]
}

function entry(input: Omit<ProductCatalogEntryV1, 'version'>): ProductCatalogEntryV1 {
  return Object.freeze({ version: 1, ...input })
}

function surface(input: Omit<ProductSurfaceEntryV1, 'version'>): ProductSurfaceEntryV1 {
  return Object.freeze({ version: 1, ...input, productIds: Object.freeze([...input.productIds]) })
}

export const PRODUCT_CATALOG_V1: readonly ProductCatalogEntryV1[] = Object.freeze([
entry({ id: 'independent.longform', label: '长篇小说', family: 'independent-creation', status: 'released', charterPhase: 'B', sourcePolicy: 'independent-work', ownsRuntime: false, ownsMedia: false, maturityNote: '工程主链已验收；文学质量继续增量研究。' }),
entry({ id: 'authoring.nodes', label: '节点创作', family: 'authoring-view', status: 'preview', charterPhase: 'B', sourcePolicy: 'independent-work', ownsRuntime: false, ownsMedia: false, maturityNote: '已与分步骤领域后端同源；完整跨模式真实 UI 验收仍持续。' })
])

export const PRODUCT_CATALOG_BY_ID_V1: ReadonlyMap<StoryForgeProductIdV1, ProductCatalogEntryV1> = new Map(
  PRODUCT_CATALOG_V1.map(item => [item.id, item] as const),
)

export const PRODUCT_SURFACES_V1: readonly ProductSurfaceEntryV1[] = Object.freeze([
surface({ id: 'independent-works', label: '长篇小说', productIds: ['independent.longform'] }),
surface({ id: 'node-authoring', label: '节点创作', productIds: ['authoring.nodes'] })
])

export interface ProductEntryDecisionV1 {
  entry: ProductCatalogEntryV1
  channel: ProductCatalogChannelV1
  visible: boolean
  enterable: boolean
  badge: string | null
  blockers: string[]
}

export function evaluateProductEntryV1(input: {
  productId: StoryForgeProductIdV1
  channel: ProductCatalogChannelV1
  /** Explicit local opt-in is required for experimental research surfaces. */
  experimentalOptIn?: boolean
}): ProductEntryDecisionV1 {
  const entry = PRODUCT_CATALOG_BY_ID_V1.get(input.productId)
  if (!entry) throw new Error(`[product-catalog] 未登记产品：${input.productId}`)
  if (!isProductAvailableInBuild(entry.id)) {
    return { entry, channel: input.channel, visible: false, enterable: false, badge: null,
      blockers: ['Android 版仅开放长篇创作；世界设定为辅助能力，节点模式复用同一创作链。'] }
  }
  const local = input.channel === 'local-development' || input.channel === 'test'
  const released = entry.status === 'released'
  const experimentalAllowed = local && input.experimentalOptIn === true
  const visible = released
    || (local && (entry.status === 'preview' || entry.status === 'internal'))
    || (entry.status === 'experimental' && experimentalAllowed)
  const blockers = visible ? [] : [
    entry.status === 'experimental'
      ? '实验产品默认隐藏，需要本地显式启用。'
      : '该产品尚未发布，生产环境默认隐藏。',
  ]
  return {
    entry,
    channel: input.channel,
    visible,
    enterable: visible,
    badge: released ? null : entry.status === 'preview' ? '预览' : entry.status === 'internal' ? '内部' : '实验',
    blockers,
  }
}

export function currentProductCatalogChannelV1(): ProductCatalogChannelV1 {
  if (typeof window === 'undefined') return 'test'
  const hostname = window.location.hostname.toLocaleLowerCase('en-US')
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
    ? 'local-development'
    : 'production'
}

export function currentExperimentalProductOptInV1(): boolean {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem('storyforge:experimental-products') === 'enabled' }
  catch { return false }
}

export function evaluateCurrentProductEntryV1(productId: StoryForgeProductIdV1): ProductEntryDecisionV1 {
  return evaluateProductEntryV1({
    productId,
    channel: currentProductCatalogChannelV1(),
    experimentalOptIn: currentExperimentalProductOptInV1(),
  })
}

/** A catalog admission never replaces owner, source, author or budget checks. */
export function assertCurrentProductEntryV1(productId: StoryForgeProductIdV1): ProductEntryDecisionV1 {
  const decision = evaluateCurrentProductEntryV1(productId)
  if (!decision.enterable) throw new Error(`[product-catalog] ${productId}：${decision.blockers.join('；')}`)
  return decision
}

/** Explicit identities only; a stored owner is not a maturity permission. */
export function productCatalogIdForWorkV1(work: {
  kind: WorkKind
  novelProfile: NovelWorkflowProfile | null
}): StoryForgeProductIdV1 {
  if (work.kind === 'novel' && work.novelProfile === 'long') return 'independent.longform'
  throw new Error(`[product-catalog] 当前 fork 不支持作品分类：${work.kind}/${work.novelProfile}`)
}

function validateProductCatalogV1(): void {
  const ids = new Set<string>()
  for (const item of PRODUCT_CATALOG_V1) {
    if (ids.has(item.id)) throw new Error(`[product-catalog] 重复产品 ID：${item.id}`)
    ids.add(item.id)
    if (!item.maturityNote.trim()) throw new Error(`[product-catalog] ${item.id} 缺少成熟度边界说明`)
    if ((item.family === 'independent-creation' || item.family === 'authoring-view')
      && item.sourcePolicy !== 'independent-work') {
      throw new Error(`[product-catalog] 独立创作来源策略无效：${item.id}`)
    }
  }
  const covered = new Set<StoryForgeProductIdV1>()
  for (const surface of PRODUCT_SURFACES_V1) {
    if (surface.productIds.length === 0) throw new Error(`[product-catalog] ${surface.id} 没有登记产品`)
    for (const productId of surface.productIds) {
      if (!PRODUCT_CATALOG_BY_ID_V1.has(productId)) {
        throw new Error(`[product-catalog] ${surface.id} 引用了未登记产品：${productId}`)
      }
      if (covered.has(productId)) throw new Error(`[product-catalog] 产品被多个界面重复拥有：${productId}`)
      covered.add(productId)
    }
  }
  for (const item of PRODUCT_CATALOG_V1) {
    if (!covered.has(item.id)) throw new Error(`[product-catalog] 产品没有界面归属：${item.id}`)
  }
}

validateProductCatalogV1()
