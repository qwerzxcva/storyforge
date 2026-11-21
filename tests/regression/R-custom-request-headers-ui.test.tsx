import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AIConfigPanel from '../../src/components/settings/AIConfigPanel'
import { DialogProvider } from '../../src/components/shared/Dialog'
import { useAIConfigStore } from '../../src/stores/ai-config'

let host: HTMLDivElement
let root: Root | undefined
const original = useAIConfigStore.getState()
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const originalFlag = environment.IS_REACT_ACT_ENVIRONMENT

async function mount() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(DialogProvider, null, createElement(AIConfigPanel))))
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  if (!button) throw new Error(`Missing button: ${text}`)
  await act(async () => button.click())
}
async function input(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)
  if (!field) throw new Error(`Missing input: ${label}`)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  sessionStorage.clear()
  useAIConfigStore.setState({ ...original, config: {
    provider: 'custom', apiKey: '', baseUrl: 'https://gateway.invalid/v1',
    model: 'test-model', temperature: 0.7, maxTokens: 32,
  }, presets: [], taskRoutes: {}, rememberApiKey: false })
})
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  host.remove()
  useAIConfigStore.setState(original, true)
  localStorage.clear()
  sessionStorage.clear()
  vi.unstubAllGlobals()
  if (originalFlag === undefined) delete environment.IS_REACT_ACT_ENVIRONMENT
  else environment.IS_REACT_ACT_ENVIRONMENT = originalFlag
})

describe('custom request headers settings', () => {
  it('adds, edits, masks and removes headers through the actual settings controls', async () => {
    await mount()
    await click('添加请求头')
    await input('请求头名称 1', 'X-Gateway-Token')
    await input('请求头值 1', 'synthetic-ui-secret')
    expect(useAIConfigStore.getState().config.customHeaders).toEqual([{ name: 'X-Gateway-Token', value: 'synthetic-ui-secret' }])
    expect(host.querySelector<HTMLInputElement>('[aria-label="请求头值 1"]')!.type).toBe('password')
    await click('显示请求头值')
    expect(host.querySelector<HTMLInputElement>('[aria-label="请求头值 1"]')!.type).toBe('text')
    expect(localStorage.getItem('storyforge-ai-config')).not.toContain('synthetic-ui-secret')
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="删除请求头 1"]')!.click())
    expect(useAIConfigStore.getState().config.customHeaders).toEqual([])
  })

  it('shows invalid header feedback and hides the editor after switching providers', async () => {
    await mount()
    await click('添加请求头')
    await input('请求头名称 1', 'Invalid Header')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('自定义请求头格式无效')
    const provider = host.querySelector<HTMLSelectElement>('[aria-label="提供商"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(provider, 'openai')
      provider.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useAIConfigStore.getState().config.provider).toBe('openai')
    expect(host.textContent).not.toContain('添加请求头')
    expect(useAIConfigStore.getState().config.customHeaders ?? []).toEqual([])
  })

  it('applies the dedicated Codex option with Responses and preserves an OpenAI-compatible key', async () => {
    await mount()
    const keyInput = host.querySelector<HTMLInputElement>('.ai-key-field input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(keyInput, 'synthetic-openai-key')
      keyInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Codex 专属选项')
    expect(useAIConfigStore.getState().config.apiFormat).toBe('openai-responses')
    expect(useAIConfigStore.getState().config.customHeaders).toEqual([
      { name: 'originator', value: 'codex_cli_rs' },
      expect.objectContaining({ name: 'User-Agent', value: expect.stringContaining('codex_cli_rs/') }),
    ])
    expect(useAIConfigStore.getState().config.apiKey).toBe('synthetic-openai-key')
    const { buildAIRequestHeaders } = await import('../../src/lib/ai/request-headers')
    expect(buildAIRequestHeaders(useAIConfigStore.getState().config)?.Authorization)
      .toBe('Bearer synthetic-openai-key')
  })

  it('preserves a manual header renamed to a generated Claude header name', async () => {
    await mount()
    await click('Claude Code')
    await click('添加请求头')
    await input('请求头值 7', 'manual-beta-value')
    await input('请求头名称 7', 'anthropic-beta')
    await click('Codex 专属选项')
    expect(useAIConfigStore.getState().config.customHeaders?.filter(row => row.name.toLowerCase() === 'anthropic-beta'))
      .toEqual([{ name: 'anthropic-beta', value: 'manual-beta-value' }])
  })

  it('replaces old Claude client headers with Codex headers after settings remount', async () => {
    await mount()
    await click('Claude Code')
    expect(useAIConfigStore.getState().config.customHeaders?.some(row => row.name === 'anthropic-beta')).toBe(true)
    await input('请求头值 2', 'user-managed-session-id')
    await act(async () => root!.unmount())
    root = undefined
    host.remove()
    await mount()
    await click('Codex 专属选项')
    const headers = useAIConfigStore.getState().config.customHeaders ?? []
    expect(headers.some(row => row.name.toLowerCase().startsWith('anthropic-'))).toBe(false)
    expect(headers.find(row => row.name === 'X-Claude-Code-Session-Id')?.value).toBe('user-managed-session-id')
    expect(headers.find(row => row.name.toLowerCase() === 'originator')?.value).toBe('codex_cli_rs')
    expect(headers.find(row => row.name.toLowerCase() === 'user-agent')?.value).toContain('codex_cli_rs/')
  })

  it('retains generated header ownership in a session-only preset without storing header values', async () => {
    await mount()
    await click('Claude Code')
    const generated = useAIConfigStore.getState().config.customHeaders!.find(row => row.name === 'anthropic-beta')!
    let presetId = ''
    await act(async () => { presetId = useAIConfigStore.getState().saveAsPreset('Claude Code') })
    const storedPresets = localStorage.getItem('storyforge-ai-presets')!
    expect(storedPresets).not.toContain(generated.value)
    expect(storedPresets).toContain('anthropic-beta')
    await act(async () => useAIConfigStore.getState().applyPreset(presetId))
    await click('Codex 专属选项')
    expect(useAIConfigStore.getState().config.customHeaders?.some(row => row.name === 'anthropic-beta')).toBe(false)
    expect(useAIConfigStore.getState().config.customHeaders?.find(row => row.name === 'originator')?.value).toBe('codex_cli_rs')
  })

  it('passes edited headers to model refresh through the actual refresh button', async () => {
    await mount()
    await click('添加请求头')
    await input('请求头名称 1', 'X-Gateway-Token')
    await input('请求头值 1', 'synthetic-ui-secret')
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ id: 'gateway-model' }] }))
    vi.stubGlobal('fetch', fetchImpl)
    await click('刷新模型')
    expect(fetchImpl).toHaveBeenCalledOnce()
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(new Headers(init.headers).get('X-Gateway-Token')).toBe('synthetic-ui-secret')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="服务返回的模型列表"]')?.textContent).toContain('gateway-model')
  })

  it('applies CLI presets atomically, preserves overrides, and allows protocol editing', async () => {
    await mount()
    await click('添加请求头')
    await input('请求头名称 1', 'user-agent')
    await input('请求头值 1', 'my-client')
    await click('Claude Code')
    let cfg = useAIConfigStore.getState().config
    expect(cfg.apiFormat).toBe('anthropic-messages')
    expect(cfg.customHeaders?.find(row => row.name.toLowerCase() === 'user-agent')?.value).toBe('my-client')
    const session = cfg.customHeaders?.find(row => row.name === 'X-Claude-Code-Session-Id')?.value
    expect(session).toMatch(/^[0-9a-f-]{36}$/i)
    expect(session).not.toBe('7f3a1c2e-8b64-4d19-9a05-2c6e8f1b3d47')
    await click('Codex 专属选项')
    cfg = useAIConfigStore.getState().config
    expect(cfg.apiFormat).toBe('openai-responses')
    expect(cfg.customHeaders?.find(row => row.name === 'originator')?.value).toBe('codex_cli_rs')
    expect(cfg.customHeaders?.some(row => row.name.toLowerCase() === 'anthropic-beta')).toBe(false)
    expect(cfg.customHeaders?.find(row => row.name.toLowerCase() === 'user-agent')?.value).toBe('my-client')
    const select = host.querySelector<HTMLSelectElement>('[aria-label="API 协议"]')!
    await act(async () => {
      select.value = 'chat-completions'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useAIConfigStore.getState().config.apiFormat).toBe('chat-completions')
  })

})
