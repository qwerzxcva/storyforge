import type { Page } from '@playwright/test'

export async function mockOllamaCapacity(page: Page, services: Array<{ baseUrl: string; model: string; contextWindow?: number }>) {
  for (const service of services) {
    const endpoint = new URL(service.baseUrl)
    if (!endpoint.hostname.endsWith('.invalid')) throw new Error('Capacity fixtures require an isolated service')
    endpoint.pathname = endpoint.pathname.replace(/\/?v1\/?$/, '') + '/api/ps'
    await page.route(endpoint.href, route => route.request().method() === 'GET'
      ? route.fulfill({ json: { models: [{ name: service.model, context_length: service.contextWindow ?? 131072 }] } })
      : route.fallback())
  }
}
