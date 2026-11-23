import type { Page } from '@playwright/test'

export async function mockOllamaCapacity(page: Page, services: Array<{ baseUrl: string; model: string; contextWindow?: number }>) {
  for (const service of services) {
    const endpoint = new URL(service.baseUrl)
    if (!endpoint.hostname.endsWith('.invalid')) throw new Error('Capacity fixtures require an isolated service')
    endpoint.pathname = endpoint.pathname.replace(/\/?v1\/?$/, '') + '/api/ps'
    await page.route(endpoint.href, route => {
      const request = route.request()
      const requestHeaders = request.headers()
      const origin = requestHeaders.origin ?? '*'
      if (request.method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': requestHeaders['access-control-request-method'] ?? 'GET',
          'Access-Control-Allow-Headers': requestHeaders['access-control-request-headers'] ?? 'content-type',
        } })
      }
      if (request.method() === 'GET') {
        return route.fulfill({
          json: { models: [{ name: service.model, context_length: service.contextWindow ?? 131072 }] },
          headers: { 'Access-Control-Allow-Origin': origin },
        })
      }
      return route.fallback()
    })
  }
}
