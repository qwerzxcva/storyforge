// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { fetchOpenAIModels } from '../../src/lib/ai/model-list'

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
async function close(server: Server) {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

describe('custom header redirect boundary', () => {
  it('refuses a real redirect without forwarding custom credentials to its destination', async () => {
    let destinationRequests = 0
    let receivedToken: string | string[] | undefined
    const destination = createServer((_request, response) => {
      destinationRequests++
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ data: [] }))
    })
    const destinationUrl = await listen(destination)
    const origin = createServer((request, response) => {
      receivedToken = request.headers['x-gateway-token']
      response.writeHead(307, { Location: `${destinationUrl}/v1/models` })
      response.end()
    })
    try {
      const originUrl = await listen(origin)
      await expect(fetchOpenAIModels({
        baseUrl: `${originUrl}/v1`,
        customHeaders: [{ name: 'X-Gateway-Token', value: 'synthetic-redirect-secret' }],
      })).rejects.toThrow('无法连接模型服务')
      expect(receivedToken).toBe('synthetic-redirect-secret')
      expect(destinationRequests).toBe(0)
    } finally {
      await close(origin)
      await close(destination)
    }
  })
})
