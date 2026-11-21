export const ANDROID_APP_PRODUCT_IDS = new Set([
  'world-engine',
  'independent.longform',
  'authoring.nodes',
])

export function isAndroidAppBuild(): boolean {
  return import.meta.env.MODE === 'android'
}

export function isProductAvailableInBuild(productId: string, _mode = import.meta.env.MODE): boolean {
  return ANDROID_APP_PRODUCT_IDS.has(productId)
}

export function isWorkAvailableInBuild(work: { kind: string; novelProfile: string | null }, _mode = import.meta.env.MODE): boolean {
  return work.kind === 'novel' && work.novelProfile === 'long'
}
