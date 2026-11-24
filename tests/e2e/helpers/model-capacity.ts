import type { Page } from '@playwright/test'

export async function mockOllamaCapacity(page: Page, services: Array<{ baseUrl: string; model: string; contextWindow?: number }>) {
  for (const service of services) {
    const endpoint = new URL(service.baseUrl)
    if (!endpoint.hostname.endsWith('.invalid')) throw new Error('Capacity fixtures require an isolated service')
    endpoint.pathname = endpoint.pathname.replace(/\/?v1\/?$/, '') + '/api/ps'
    await page.route(url => {
      const requestUrl = new URL(url)
      return requestUrl.origin === endpoint.origin
        && requestUrl.pathname.replace(/\/$/, '') === endpoint.pathname.replace(/\/$/, '')
    }, async route => {
      const request = route.request()
      const requestHeaders = request.headers()
      const origin = requestHeaders.origin ?? '*'
      const allowPrivateNetwork = requestHeaders['access-control-request-private-network'] === 'true'
        ? { 'Access-Control-Allow-Private-Network': 'true' }
        : {}
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, content-type',
          'Access-Control-Max-Age': '0',
          Vary: 'Origin',
          ...allowPrivateNetwork,
        } })
        return
      }
      if (request.method() === 'GET') {
        await route.fulfill({ headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          Vary: 'Origin',
        }, json: { models: [{ name: service.model, context_length: service.contextWindow ?? 131072 }] } })
        return
      }
      await route.fallback()
    })
  }
}
