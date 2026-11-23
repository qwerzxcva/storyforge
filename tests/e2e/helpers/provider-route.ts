import type { Page, Route } from '@playwright/test'

export function routeProviderFixture(
  page: Page,
  matcher: Parameters<Page['route']>[0],
  handler: (route: Route) => void | Promise<void>,
) {
  return page.route(matcher, async route => {
    const request = route.request()
    const requestHeaders = request.headers()
    const origin = requestHeaders.origin ?? '*'
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': requestHeaders['access-control-request-method'] ?? 'POST',
        'Access-Control-Allow-Headers': requestHeaders['access-control-request-headers'] ?? 'content-type',
        'Access-Control-Max-Age': '0',
      } })
      return
    }
    if (request.method() !== 'POST') throw new Error(`Unexpected provider fixture method: ${request.method()}`)
    const corsRoute = new Proxy(route, {
      get(target, property) {
        if (property === 'fulfill') {
          return (options: Parameters<Route['fulfill']>[0]) => target.fulfill({
            ...options,
            headers: { ...options?.headers, 'Access-Control-Allow-Origin': origin },
          })
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as Route
    await handler(corsRoute)
  })
}
