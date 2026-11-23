import type { ProductRuntimeSourceManifestV1 } from '../../types/index'
import { canonicalProductProductionJsonV2 } from '../product-production/hash'

function fail(message: string): never {
  throw new Error(`[product-runtime-source-manifest] ${message}`)
}

export function productRuntimeSourceSnapshotV2(manifest: ProductRuntimeSourceManifestV1) {
  return { schema: 'storyforge.product-runtime-source', version: 2, productType: manifest.productType,
    runtimeSourceHash: manifest.packageHash, sourceWorldContentHash: manifest.sourceWorldContentHash,
    sourceManifest: structuredClone(manifest) }
}

/** Compare the whole system-derived receipt, including the empty direct-read set. */
export function assertProductRuntimeSourceSnapshotV2(input: {
  canonSnapshot: unknown
  manifest: ProductRuntimeSourceManifestV1 | null | undefined
}): void {
  let snapshot = input.canonSnapshot
  if (typeof snapshot === 'string') {
    try { snapshot = JSON.parse(snapshot) } catch { fail('会话来源快照不是 JSON') }
  }
  if (input.manifest) {
    if (canonicalProductProductionJsonV2(snapshot) !== canonicalProductProductionJsonV2(productRuntimeSourceSnapshotV2(input.manifest))) {
      fail('会话来源计划、继承证据或实际读取记录不一致')
    }
  } else if (snapshot && typeof snapshot === 'object'
    && 'schema' in snapshot && snapshot.schema === 'storyforge.product-runtime-source'
    && 'version' in snapshot && snapshot.version !== 1) {
    fail('旧来源不能声明增强运行来源快照')
  }
}
