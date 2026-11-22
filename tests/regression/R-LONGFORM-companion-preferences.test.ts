import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPANION_KEY, DEFAULT_COMPANION, sanitizeCompanion } from '../../src/stores/companion'

const SESSION_KEY = 'storyforge-longform-voice-keys-v1'
const portrait = 'data:image/png;base64,YWJjZA=='

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  vi.resetModules()
})
afterEach(() => { vi.restoreAllMocks() })

describe('助手偏好与作品数据隔离', () => {
  it.each([
    'https://untrusted.example/image.png',
    'data:image/svg+xml;base64,abcd',
    'data:image/png;base64,invalid!',
    'data:image/png;base64,' + 'A'.repeat(2_800_000),
    42,
  ])('拒绝远程、SVG、无效或超长立绘 %#', (invalidPortrait) => {
    expect(sanitizeCompanion({ portrait: invalidPortrait })).toEqual(DEFAULT_COMPANION)
  })
  it.each(['png', 'jpeg', 'webp'])('保留 %s 图片与隐藏偏好，只输出形象字段', (format) => {
    const image = `data:image/${format};base64,YWJjZA==`
    expect(sanitizeCompanion({ visible: false, portrait: image, inputMode: 'service', autoRead: true, input: {}, workId: 1 }))
      .toEqual({ visible: false, portrait: image })
  })
  it('加载旧偏好时清除语音字段和会话密钥，保留图片与其他存储', async () => {
    localStorage.setItem(COMPANION_KEY, JSON.stringify({
      visible: false, portrait, inputMode: 'service', outputMode: 'browser',
      inputDeviceId: 'old-input', outputDeviceId: 'old-output', browserVoice: 'old-voice',
      autoRead: true, input: {}, output: {},
    }))
    sessionStorage.setItem(SESSION_KEY, '{}')
    localStorage.setItem('unrelated-preference', 'keep')
    sessionStorage.setItem('unrelated-session', 'keep')
    const { useCompanionStore } = await import('../../src/stores/companion')
    expect(useCompanionStore.getState().preferences).toEqual({ visible: false, portrait })
    expect(JSON.parse(localStorage.getItem(COMPANION_KEY)!)).toEqual({ visible: false, portrait })
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(localStorage.getItem('unrelated-preference')).toBe('keep')
    expect(sessionStorage.getItem('unrelated-session')).toBe('keep')
    expect(useCompanionStore.getState().storageError).toBe('')
  })
  it('隐藏形象、换图和恢复原画可保存并重新加载，不带作品字段', async () => {
    const { useCompanionStore } = await import('../../src/stores/companion')
    useCompanionStore.getState().update({ visible: false, portrait })
    expect(JSON.parse(localStorage.getItem(COMPANION_KEY)!)).toEqual({ visible: false, portrait })
    vi.resetModules()
    const reloaded = await import('../../src/stores/companion')
    expect(reloaded.useCompanionStore.getState().preferences).toEqual({ visible: false, portrait })
    reloaded.useCompanionStore.getState().update({ portrait: '' })
    expect(JSON.parse(localStorage.getItem(COMPANION_KEY)!)).toEqual({ visible: false, portrait: '' })
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })
  it('存储写入失败仍在当前页面应用形象偏好，提示错误且不覆盖旧数据', async () => {
    localStorage.setItem(COMPANION_KEY, JSON.stringify(DEFAULT_COMPANION))
    const { useCompanionStore } = await import('../../src/stores/companion')
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    useCompanionStore.getState().update({ visible: false, portrait })
    expect(useCompanionStore.getState().preferences).toEqual({ visible: false, portrait })
    expect(useCompanionStore.getState().storageError).not.toBe('')
    expect(JSON.parse(localStorage.getItem(COMPANION_KEY)!)).toEqual(DEFAULT_COMPANION)
    write.mockRestore()
    useCompanionStore.getState().update({ visible: true })
    expect(useCompanionStore.getState().storageError).toBe('')
    expect(JSON.parse(localStorage.getItem(COMPANION_KEY)!)).toEqual({ visible: true, portrait })
  })
  it('旧偏好重写失败不丢失已读图片，仍清除会话密钥并报告失败', async () => {
    localStorage.setItem(COMPANION_KEY, JSON.stringify({ visible: false, portrait, autoRead: true }))
    sessionStorage.setItem(SESSION_KEY, '{}')
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const { useCompanionStore } = await import('../../src/stores/companion')
    write.mockRestore()
    expect(useCompanionStore.getState().preferences).toEqual({ visible: false, portrait })
    expect(useCompanionStore.getState().storageError).not.toBe('')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })
  it('会话清理失败不阻断图片加载或保存，后续更新重试清理', async () => {
    localStorage.setItem(COMPANION_KEY, JSON.stringify({ visible: false, portrait, autoRead: true }))
    sessionStorage.setItem(SESSION_KEY, '{}')
    const remove = vi.spyOn(sessionStorage, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    const { useCompanionStore } = await import('../../src/stores/companion')
    expect(useCompanionStore.getState().preferences).toEqual({ visible: false, portrait })
    expect(JSON.parse(localStorage.getItem(COMPANION_KEY)!)).toEqual({ visible: false, portrait })
    expect(useCompanionStore.getState().storageError).not.toBe('')
    useCompanionStore.getState().update({ visible: true })
    expect(useCompanionStore.getState().storageError).not.toBe('')
    expect(JSON.parse(localStorage.getItem(COMPANION_KEY)!)).toEqual({ visible: true, portrait })
    remove.mockRestore()
    useCompanionStore.getState().update({ visible: false })
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(useCompanionStore.getState().storageError).toBe('')
  })
  it('偏好损坏时安全回退并清除旧会话密钥', async () => {
    localStorage.setItem(COMPANION_KEY, '{invalid')
    sessionStorage.setItem(SESSION_KEY, '{}')
    const { useCompanionStore } = await import('../../src/stores/companion')
    expect(useCompanionStore.getState().preferences).toEqual(DEFAULT_COMPANION)
    expect(useCompanionStore.getState().storageError).not.toBe('')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })
})
