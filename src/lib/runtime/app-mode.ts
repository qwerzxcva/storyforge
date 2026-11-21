export const ANDROID_APP_PRODUCT_IDS = new Set([
  'world-engine',
  'independent.longform',
  'authoring.nodes',
])

export function isAndroidAppBuild(): boolean {
  return import.meta.env.MODE === 'android'
}

export function isProductAvailableInBuild(productId: string, mode = import.meta.env.MODE): boolean {
  return mode !== 'android' || ANDROID_APP_PRODUCT_IDS.has(productId)
}

export function isWorkAvailableInBuild(work: { kind: string; novelProfile: string | null }, mode = import.meta.env.MODE): boolean {
  return mode !== 'android' || work.kind === 'novel' && work.novelProfile === 'long'
}
