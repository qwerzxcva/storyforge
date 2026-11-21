
import { db } from '../../db/schema';
import { hashProductProductionValueV2 } from '../product-production/hash';
import { verifyProductReleaseManifest } from '../product-production/runtime-package';
import type { ProductRelease } from '../../types/index';

/**
 * Formal runtime release integrity check. The current ProductRelease is self-contained;
 * WorldRelease is lineage evidence and is deliberately not a runtime dependency.
 */
export async function assertProductReleaseUnchanged(productReleaseId: number, reader?: { ttrpgProtocol: 2 }): Promise<ProductRelease> {
  const release = await db.productReleases.get(productReleaseId)
  if (!release) throw new Error('[product-release] ProductRelease 不存在')
  const manifest = await verifyProductReleaseManifest(release.manifestJson, reader)
  if (release.productType !== manifest.productType
    || release.productType !== manifest.runtimePackage.productType) {
    throw new Error('[product-release] 发布根记录与冻结清单的产品身份不一致')
  }
  const contentHash = await hashProductProductionValueV2(manifest)
  if (contentHash !== release.contentHash) throw new Error('[product-release] ProductRelease 已被篡改')
  if (manifest.sourceWorldRelease.contentHash !== manifest.runtimePackage.sourceWorld.contentHash) {
    throw new Error('[product-release] 世界来源谱系证据不一致')
  }
  return release
}
