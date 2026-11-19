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
})
