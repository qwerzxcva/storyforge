import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '../../src/lib/types'

const CUSTOM_HEADERS = [{ name: 'X-Gateway-Token', value: 'synthetic-gateway-secret' }]
function config(): AIConfig {
  return {
    provider: 'custom', apiKey: 'synthetic-api-key', model: 'test-model',
    baseUrl: 'https://gateway.invalid/v1', temperature: 0.7, maxTokens: 32,
    customHeaders: CUSTOM_HEADERS.map(header => ({ ...header })),
  }
}
async function freshStore() {
  vi.resetModules()
  return (await import('../../src/stores/ai-config')).useAIConfigStore
}
function mockCompletion() {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'GET') return Response.json({ data: [], models: [] })
    const body = JSON.parse(String(init?.body))
    if (body.stream) return new Response(
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
      + 'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
    return Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] })
  })
  vi.stubGlobal('fetch', fetchImpl)
  return fetchImpl
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('custom model request headers', () => {
  it('sends headers when refreshing models and overrides Authorization case-insensitively', async () => {
    const { fetchOpenAIModels } = await import('../../src/lib/ai/model-list')
    const fetchImpl = mockCompletion()
    const options = { ...config(), customHeaders: [
      ...CUSTOM_HEADERS, { name: 'authorization', value: 'Token synthetic-alternative' },
    ], fetchImpl }
    await fetchOpenAIModels(options)
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers)
    expect(headers.get('X-Gateway-Token')).toBe('synthetic-gateway-secret')
    expect(headers.get('Authorization')).toBe('Token synthetic-alternative')
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe('error')
  })

  it('uses the same headers for connection tests, metadata, chat and streaming', async () => {
    const store = await freshStore()
    store.getState().setConfig(config())
    const fetchImpl = mockCompletion()
    expect((await store.getState().testConnection()).ok).toBe(true)
    const { chat, streamChat, chatWithImagesV1 } = await import('../../src/lib/ai/client')
    expect(await chat([{ role: 'user', content: 'hello' }], store.getState().config)).toBe('ok')
    let text = ''
    for await (const part of streamChat([{ role: 'user', content: 'hello' }], store.getState().config)) text += part
    expect(text).toBe('ok')
    expect(await chatWithImagesV1([{ role: 'user', content: 'describe' }], [
      { label: 'test', dataUrl: 'data:image/png;base64,dGVzdA==', detail: 'low' },
    ], store.getState().config)).toBe('ok')
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(4)
    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).get('X-Gateway-Token')).toBe('synthetic-gateway-secret')
      expect(init?.redirect).toBe('error')
    }
  })

  it('keeps header credentials session-only by default and restores them on reload', async () => {
    const store = await freshStore()
    store.getState().setConfig(config())
    expect(localStorage.getItem('storyforge-ai-config')).not.toContain('synthetic-gateway-secret')
    expect((await freshStore()).getState().config.customHeaders).toEqual(CUSTOM_HEADERS)
  })

  it('remembers headers only when requested and removes the persistent copy when disabled', async () => {
    const store = await freshStore()
    store.getState().setConfig(config())
    store.getState().setRememberApiKey(true)
    expect(localStorage.getItem('storyforge-ai-config')).toContain('synthetic-gateway-secret')
    sessionStorage.clear()
    const reloaded = await freshStore()
    expect(reloaded.getState().config.customHeaders).toEqual(CUSTOM_HEADERS)
    reloaded.getState().setRememberApiKey(false)
    expect(localStorage.getItem('storyforge-ai-config')).not.toContain('synthetic-gateway-secret')
    expect((await freshStore()).getState().config.customHeaders).toEqual(CUSTOM_HEADERS)
  })

  it('restores preset-specific session headers and supplies them to task routes', async () => {
    const store = await freshStore()
    store.getState().setConfig(config())
    const id = store.getState().saveAsPreset('Gateway')
    expect(localStorage.getItem('storyforge-ai-presets')).not.toContain('synthetic-gateway-secret')
    store.getState().setConfig({ customHeaders: [{ name: 'X-Other', value: 'other-secret' }] })
    store.getState().applyPreset(id)
    expect(store.getState().config.customHeaders).toEqual(CUSTOM_HEADERS)
    const reloaded = await freshStore()
    reloaded.getState().setConfig({ customHeaders: [] })
    reloaded.getState().setTaskRoute('creation', id)
    const { resolveRequestConfig } = await import('../../src/lib/ai/client')
    expect(resolveRequestConfig(reloaded.getState().config, { category: 'chapter.content' }).config.customHeaders).toEqual(CUSTOM_HEADERS)
    reloaded.getState().deletePreset(id)
    expect(sessionStorage.getItem('storyforge-ai-preset-headers-session')).toBeNull()
  })

  it('removes persistent preset headers when remember is disabled, without losing session headers', async () => {
    const store = await freshStore()
    store.getState().setRememberApiKey(true)
    store.getState().setConfig(config())
    const id = store.getState().saveAsPreset('Remembered gateway')
    expect(localStorage.getItem('storyforge-ai-presets')).toContain('synthetic-gateway-secret')
    store.getState().setRememberApiKey(false)
    expect(localStorage.getItem('storyforge-ai-presets')).not.toContain('synthetic-gateway-secret')
    const reloaded = await freshStore()
    reloaded.getState().setConfig({ customHeaders: [] })
    reloaded.getState().applyPreset(id)
    expect(reloaded.getState().config.customHeaders).toEqual(CUSTOM_HEADERS)
  })

  it('does not restore a session header after its owner or save reference is changed', async () => {
    const store = await freshStore()
    store.getState().setConfig(config())
    const saved = JSON.parse(localStorage.getItem('storyforge-ai-config')!)
    localStorage.setItem('storyforge-ai-config', JSON.stringify({ ...saved, _sessionCredentialId: 'unpaired' }))
    expect((await freshStore()).getState().config.customHeaders ?? []).toEqual([])
    localStorage.setItem('storyforge-ai-config', JSON.stringify({ ...saved, baseUrl: 'https://other.invalid/v1' }))
    expect((await freshStore()).getState().config.customHeaders ?? []).toEqual([])
  })

  it('ignores empty rows and rejects malformed headers before fetching', async () => {
    const { fetchOpenAIModels } = await import('../../src/lib/ai/model-list')
    const fetchImpl = mockCompletion()
    await fetchOpenAIModels({ baseUrl: config().baseUrl, customHeaders: [{ name: '', value: '' }], fetchImpl })
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
    fetchImpl.mockClear()
    for (const header of [{ name: '', value: 'orphan' }, { name: 'Bad Name', value: 'value' }, { name: 'X-Token', value: 'one\r\ntwo' }]) {
      await expect(fetchOpenAIModels({ baseUrl: config().baseUrl, customHeaders: [header], fetchImpl })).rejects.toThrow('自定义请求头')
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('clears headers across providers and different credential authorities', async () => {
    const store = await freshStore()
    store.getState().setConfig(config())
    store.getState().switchProvider('openai')
    expect(store.getState().config.customHeaders ?? []).toEqual([])
    store.getState().setConfig(config())
    store.getState().setConfig({ baseUrl: 'https://other.invalid/v1' })
    expect(store.getState().config.customHeaders ?? []).toEqual([])
  })

  it('does not send custom headers for a built-in provider even on a directly supplied config', async () => {
    const { chat } = await import('../../src/lib/ai/client')
    const fetchImpl = mockCompletion()
    await chat([{ role: 'user', content: 'hello' }], { ...config(), provider: 'openai' })
    expect(new Headers(fetchImpl.mock.calls.at(-1)?.[1]?.headers).get('X-Gateway-Token')).toBeNull()
  })

  it('treats header changes as a different model-capacity identity without exposing their values', async () => {
    const { getModelCapacityV1 } = await import('../../src/lib/ai/model-capacity')
    const original = getModelCapacityV1(config())
    const changed = getModelCapacityV1({ ...config(), customHeaders: [{ name: 'X-Gateway-Token', value: 'changed-secret' }] })
    expect(changed.bindingHash).not.toBe(original.bindingHash)
    expect(JSON.stringify(changed)).not.toContain('changed-secret')
  })

  it('redacts arbitrary header values echoed by a failed provider', async () => {
    const store = await freshStore()
    store.getState().setConfig(config())
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway rejected synthetic-gateway-secret', { status: 401 })))
    expect((await store.getState().testConnection()).ok).toBe(false)
    const { getLogs } = await import('../../src/lib/ai/logger')
    expect(JSON.stringify(getLogs())).not.toContain('synthetic-gateway-secret')
  })
})
