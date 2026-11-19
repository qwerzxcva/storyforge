import { expect, test } from '@playwright/test'

test('settings headers survive reload and reach model discovery, connection testing and streaming', async ({ page, baseURL }) => {
  const requests: Array<{ path: string; token: string | undefined; stream: boolean }> = []
  await page.addInitScript(() => localStorage.setItem('storyforge_guide_completed', 'headers-fixture'))
  await page.route('**/custom-header-fixture/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const body = request.method() === 'POST' ? request.postDataJSON() : null
    requests.push({ path, token: request.headers()['x-gateway-token'], stream: body?.stream === true })
    if (path.endsWith('/api/v1/models')) {
      await route.fulfill({ json: { models: [{ key: 'headers-fixture', type: 'llm', loaded_instances: [{ config: { context_length: 131072 } }] }] } })
    } else if (path.endsWith('/v1/models')) {
      await route.fulfill({ json: { data: [{ id: 'headers-fixture' }] } })
    } else if (path.endsWith('/chat/completions') && body?.stream) {
      await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"stream accepted"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n' })
    } else if (path.endsWith('/chat/completions')) {
      await route.fulfill({ json: { choices: [{ message: { content: 'connection accepted' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } } })
    } else {
      await route.abort('blockedbyclient')
    }
  })
  await page.goto('./home/settings')
  await page.getByLabel('提供商', { exact: true }).selectOption('custom')
  await page.getByLabel('Base URL', { exact: true }).fill(new URL('custom-header-fixture/v1', baseURL).href)
  await page.getByLabel('手动输入模型名', { exact: true }).fill('headers-fixture')
  await page.getByText('自定义请求头（可选）', { exact: true }).click()
  await page.getByRole('button', { name: '添加请求头', exact: true }).click()
  await page.getByLabel('请求头名称 1', { exact: true }).fill('X-Gateway-Token')
  const value = page.getByLabel('请求头值 1', { exact: true })
  await value.fill('synthetic-browser-header')
  await expect(value).toHaveAttribute('type', 'password')
  await page.reload()
  await expect(page.getByLabel('请求头名称 1', { exact: true })).toHaveValue('X-Gateway-Token')
  await expect(value).toHaveValue('synthetic-browser-header')
  await page.getByRole('button', { name: '刷新模型', exact: true }).click()
  await expect(page.getByLabel('服务返回的模型列表')).toBeVisible()
  await page.getByRole('button', { name: '测试最小连接', exact: true }).click()
  await expect(page.getByText(/最小连接成功；仅证明当前模型/)).toBeVisible()
  expect(requests.some(item => item.path.endsWith('/chat/completions') && !item.stream)).toBe(true)
  const streamed = await page.evaluate(async () => {
    const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>
    const { streamChat } = await load('/storyforge/src/lib/ai/client.ts')
    const { useAIConfigStore } = await load('/storyforge/src/stores/ai-config.ts')
    let text = ''
    for await (const delta of streamChat([{ role: 'user', content: 'fixture request' }], useAIConfigStore.getState().config)) text += delta
    return text
  })
  expect(streamed).toBe('stream accepted')
  expect(requests.some(item => item.path.endsWith('/api/v1/models'))).toBe(true)
  expect(requests.some(item => item.path.endsWith('/v1/models'))).toBe(true)
  expect(requests.filter(item => item.stream)).toHaveLength(1)
  expect(requests.every(item => item.token === 'synthetic-browser-header')).toBe(true)
  await page.getByRole('button', { name: '删除请求头 1', exact: true }).click()
  await expect(value).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('请求头名称 1', { exact: true })).toHaveCount(0)
})
