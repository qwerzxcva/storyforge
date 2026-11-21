import { transformProviderRequest, normalizeProviderCompletion } from '../lib/ai/provider-protocol'
import { IS_MODEL_DISABLED_BUILD, MODEL_DISABLED_NOTICE } from '../lib/showcase/policy'
import { streamCodex } from '../lib/ai/codex-transport'
import { create } from 'zustand'
import type { AIConfig, AIProvider, AIConfigPreset, EmbeddingConfig } from '../lib/types'
import { normalizeProviderModel, PROVIDER_PRESETS } from '../lib/types'
import { createLog, updateLog } from '../lib/ai/logger'
import { nanoid } from '../lib/utils/id'
import { buildOpenAIEndpoint, normalizeOpenAIBaseUrl, providerApiFormat } from '../lib/ai/openai-endpoint'
import { customHeaderValues, parseCustomHeaders, redactRequestSecrets } from '../lib/ai/request-headers'
import { sameAICredentialAuthorityV1 } from '../lib/ai/credential-identity'
import { createSessionCredentialV1, readSessionCredentialV1, type SessionCredentialV1 } from '../lib/ai/session-credential'
import { isProviderQuotaRejectionV1 } from '../lib/ai/provider-rejection'
import { AICompletionResponseErrorV1, inspectCompletionResponseV1, requireCompletionTextV1 } from '../lib/ai/completion-response'
import {
  sanitizeAITaskRoutes,
  type AITaskKind,
  type AITaskRoutes,
} from '../lib/ai/task-routing'
import {
  sanitizeAgentContextProfiles,
  type AgentContextProfile,
  type AgentContextProfiles,
  type AgentContextTaskKind,
} from '../lib/agent/context-policy'
import {
  sanitizeAgentTeamBudgetProfile,
  type AgentTeamBudgetProfile,
} from '../lib/agent/team-budget'
import {
  sanitizeCreativeQualityModeV1,
  type CreativeQualityModeV1,
} from '../lib/agent/creative-reliability'

const STORAGE_KEY = 'storyforge-ai-config'
const PRESETS_KEY = 'storyforge-ai-presets'
const SESSION_API_KEY = 'storyforge-ai-api-key-session'
const PRESET_SESSION_API_KEYS = 'storyforge-ai-preset-api-keys-session'
const SESSION_HEADERS = 'storyforge-ai-headers-session'
const PRESET_SESSION_HEADERS = 'storyforge-ai-preset-headers-session'
const REMEMBER_API_KEY = 'storyforge-ai-api-key-remember'
const ANDROID_CREDENTIAL_MIGRATION = 'storyforge-android-ai-credentials-v1'
const EMBEDDING_KEY = 'storyforge-embedding-config'
const EMBEDDING_SESSION_KEY = 'storyforge-embedding-key-session'
export const TASK_ROUTES_KEY = 'storyforge-ai-task-routes'
export const AGENT_CONTEXT_PROFILES_KEY = 'storyforge-agent-context-profiles'
export const AGENT_TEAM_BUDGET_PROFILE_KEY = 'storyforge-agent-team-budget-profile'
export const CREATIVE_QUALITY_MODE_KEY = 'storyforge-creative-quality-mode-v1'

const DEFAULT_CONFIG: AIConfig = {
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com/v1',
  temperature: 0.7,
  maxTokens: 0,
}

/** NS-5 默认：关闭；隐私首选本地 Ollama + bge-m3（手稿不出本机）。 */
const DEFAULT_EMBEDDING: EmbeddingConfig = {
  enabled: false,
  provider: 'ollama',
  apiKey: '',
  baseUrl: 'http://localhost:11434/v1',
  model: 'bge-m3',
}

/** embedding 配置加载：key 复用与聊天 key 相同的「记住」开关（不记住→sessionStorage）。 */
function loadEmbeddingConfig(rememberApiKey: boolean): EmbeddingConfig {
  let saved: Partial<EmbeddingConfig> & { _sessionCredentialId?: string } = {}
  try { const raw = localStorage.getItem(EMBEDDING_KEY); if (raw) saved = JSON.parse(raw) } catch { /* ignore */ }
  const { _sessionCredentialId, ...fields } = saved
  const owner = { ...DEFAULT_EMBEDDING, ...fields }
  const sessionKey = readSessionCredentialV1(sessionStorage.getItem(EMBEDDING_SESSION_KEY), owner, _sessionCredentialId)
  return { ...owner, apiKey: rememberApiKey ? (fields.apiKey || '') : sessionKey }
}

function persistEmbeddingConfig(cfg: EmbeddingConfig, rememberApiKey: boolean): void {
  const referenceId = nanoid()
  const persisted = { ...cfg, apiKey: rememberApiKey ? cfg.apiKey : '', _sessionCredentialId: referenceId }
  localStorage.setItem(EMBEDDING_KEY, JSON.stringify(persisted))
  if (rememberApiKey) sessionStorage.removeItem(EMBEDDING_SESSION_KEY)
  else if (cfg.apiKey) sessionStorage.setItem(EMBEDDING_SESSION_KEY, JSON.stringify(createSessionCredentialV1(cfg, referenceId, cfg.apiKey)))
  else sessionStorage.removeItem(EMBEDDING_SESSION_KEY)
}

/** 从 localStorage 加载预设列表 */
function loadPresets(): AIConfigPreset[] {
  try {
    const saved = localStorage.getItem(PRESETS_KEY)
    if (saved) {
      const arr = JSON.parse(saved)
      if (Array.isArray(arr)) {
        const normalized = arr.map((preset: AIConfigPreset) => ({
          ...preset,
          config: normalizeConfigModel(preset.config),
        }))
        if (normalized.some((preset, index) => preset.config.model !== arr[index]?.config?.model || arr[index]?.config?.contextWindow !== undefined || arr[index]?.config?.modelCapacity !== undefined)) {
          savePresets(normalized)
        }
        return normalized
      }
    }
  } catch { /* ignore */ }
  return []
}

function savePresets(presets: AIConfigPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.map(preset => ({ ...preset, config: normalizeConfigModel(preset.config) }))))
}

function loadPresetSessionApiKeys(storageKey = PRESET_SESSION_API_KEYS): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.assign(Object.create(null) as Record<string, unknown>, parsed)
  } catch {
    return {}
  }
}

function savePresetSessionApiKey(id: string, credential: SessionCredentialV1 | null, storageKey = PRESET_SESSION_API_KEYS): void {
  const keys = loadPresetSessionApiKeys(storageKey)
  if (credential) Object.defineProperty(keys, id, { value: credential, enumerable: true, writable: true, configurable: true })
  else delete keys[id]
  if (Object.keys(keys).length) sessionStorage.setItem(storageKey, JSON.stringify(keys))
  else sessionStorage.removeItem(storageKey)
}

export function getAIConfigPresetSessionApiKey(id: string): string {
  const preset = useAIConfigStore.getState().presets.find(item => item.id === id)
  return preset ? readSessionCredentialV1(loadPresetSessionApiKeys()[id], preset.config, preset.sessionCredentialId) : ''
}

function readSessionHeaders(input: unknown, owner: AIConfig, referenceId: unknown): NonNullable<AIConfig['customHeaders']> {
  const raw = readSessionCredentialV1(input, owner, referenceId)
  try { return parseCustomHeaders(raw ? JSON.parse(raw) : []) } catch { return [] }
}

export function getAIConfigPresetHeadersV1(preset: AIConfigPreset): NonNullable<AIConfig['customHeaders']> {
  return preset.config.customHeaders?.length ? parseCustomHeaders(preset.config.customHeaders)
    : readSessionHeaders(loadPresetSessionApiKeys(PRESET_SESSION_HEADERS)[preset.id], preset.config, preset.sessionCredentialId)
}

function savePresetSessionHeaders(preset: AIConfigPreset, config: AIConfig, remember: boolean): void {
  savePresetSessionApiKey(preset.id, !remember && config.customHeaders?.length
    ? createSessionCredentialV1(config, preset.sessionCredentialId!, JSON.stringify(config.customHeaders)) : null, PRESET_SESSION_HEADERS)
}

export function getAIConfigPresetApiKeyV1(preset: AIConfigPreset): string {
  return preset.config.apiKey || readSessionCredentialV1(loadPresetSessionApiKeys()[preset.id], preset.config, preset.sessionCredentialId)
}

/** Retained but unpaired temporary keys need an explicit author re-entry. */
export function hasUnmatchedSessionCredentialV1(kind: 'chat' | 'embedding'): boolean {
  const state = useAIConfigStore.getState()
  const config = kind === 'chat' ? state.config : state.embedding
  if (state.rememberApiKey || config.apiKey) return false
  if (sessionStorage.getItem(kind === 'chat' ? SESSION_API_KEY : EMBEDDING_SESSION_KEY)) return true
  const preset = kind === 'chat' && state.presets.find(item => item.id === state.activePresetId)
  return Boolean(preset && loadPresetSessionApiKeys()[preset.id] && !getAIConfigPresetApiKeyV1(preset))
}

function sameChatCredentialAuthority(left: AIConfig, right: AIConfig): boolean {
  return sameAICredentialAuthorityV1(
    { provider: left.provider, baseUrl: normalizeOpenAIBaseUrl(left.baseUrl).baseUrl },
    { provider: right.provider, baseUrl: normalizeOpenAIBaseUrl(right.baseUrl).baseUrl },
  )
}

/** Resolve one preset without changing the selected global configuration. */
export function resolveAIConfigPresetV1(preset: AIConfigPreset, current: AIConfig): AIConfig {
  const apiKey = getAIConfigPresetApiKeyV1(preset)
    || (sameChatCredentialAuthority(preset.config, current) ? current.apiKey : '')
  return normalizeConfigModel({ ...preset.config, apiKey, customHeaders: getAIConfigPresetHeadersV1(preset) })
}

function loadTaskRoutes(): AITaskRoutes {
  try {
    const saved = localStorage.getItem(TASK_ROUTES_KEY)
    return saved ? sanitizeAITaskRoutes(JSON.parse(saved)) : {}
  } catch {
    return {}
  }
}

function saveTaskRoutes(routes: AITaskRoutes): void {
  localStorage.setItem(TASK_ROUTES_KEY, JSON.stringify(routes))
}

function loadAgentContextProfiles(): AgentContextProfiles {
  try {
    const saved = localStorage.getItem(AGENT_CONTEXT_PROFILES_KEY)
    return sanitizeAgentContextProfiles(saved ? JSON.parse(saved) : {})
  } catch {
    return sanitizeAgentContextProfiles({})
  }
}

function saveAgentContextProfiles(profiles: AgentContextProfiles): void {
  localStorage.setItem(AGENT_CONTEXT_PROFILES_KEY, JSON.stringify(profiles))
}

function loadAgentTeamBudgetProfile(): AgentTeamBudgetProfile {
  return sanitizeAgentTeamBudgetProfile(localStorage.getItem(AGENT_TEAM_BUDGET_PROFILE_KEY))
}

function saveAgentTeamBudgetProfile(profile: AgentTeamBudgetProfile): void {
  localStorage.setItem(AGENT_TEAM_BUDGET_PROFILE_KEY, profile)
}

function loadCreativeQualityMode(): CreativeQualityModeV1 {
  return sanitizeCreativeQualityModeV1(localStorage.getItem(CREATIVE_QUALITY_MODE_KEY))
}

function saveCreativeQualityMode(mode: CreativeQualityModeV1): void {
  localStorage.setItem(CREATIVE_QUALITY_MODE_KEY, mode)
}

/** 根据 HTTP 状态码和英文错误信息，返回中文解释 */
function getChineseExplanation(status: number, msg: string): string {
  const lower = msg.toLowerCase()

  if (lower.includes('user location is not supported'))
    return '当前请求所在地不在该平台 API 支持范围内；更换模型或 Key 不会解决，需要从受支持地区访问'
  if (lower.includes('无可用渠道') || lower.includes('distributor'))
    return '该模型当前无可用上游渠道，请切换其他模型或稍后重试'
  if (lower.includes('api key format is incorrect'))
    return 'API Key 类型或格式不正确；豆包请使用火山方舟 API Key，不要使用 IAM Access Key、API Key ID 或 Secret'
  if (lower.includes('has not activated the model'))
    return '账号尚未开通该模型，请在火山方舟「开通管理」启用对应模型'
  if (
    lower.includes('overdue balance')
    || lower.includes('account overdue')
    || lower.includes('accountoverdueerror')
  ) return '账户存在逾期欠费，本次请求已在账户校验层被阻断；结清欠费后再重试'
  if (isProviderQuotaRejectionV1({ status, message: msg }))
    return '账户余额不足或配额已用完，本次请求未获 Provider 执行；补足额度后再重试'

  // 按 HTTP 状态码
  if (status === 401) return 'API Key 无效或已过期'
  if (status === 402) return '账户余额不足，请充值后使用'
  if (status === 403) return 'API Key 权限不足，无权访问该模型'
  if (status === 404) return 'API 地址或模型名称错误，请检查 Base URL 和模型名'
  if (status === 429) return '请求频率超限，请稍后再试'
  if (status === 500) return '服务器内部错误，请稍后重试'
  if (status === 502) return '网关错误，服务暂时不可用'
  if (status === 503) return '服务暂时不可用，可能正在维护'

  // 按错误信息关键词匹配
  if (lower.includes('invalid api key') || lower.includes('invalid_api_key'))
    return 'API Key 无效，请检查是否填写正确'
  if (lower.includes('authentication') || lower.includes('unauthorized'))
    return '认证失败，API Key 无效或已过期'
  if (lower.includes('rate limit') || lower.includes('rate_limit'))
    return '请求频率超限，请稍后再试'
  if (lower.includes('model not found') || lower.includes('model_not_found'))
    return '模型不存在，请检查模型名称是否正确'
  if (lower.includes('context length') || lower.includes('context_length'))
    return '输入内容超过模型最大上下文长度'
  if (lower.includes('quota exceeded') || lower.includes('quota_exceeded'))
    return '配额已用完'
  if (lower.includes('server error') || lower.includes('internal error'))
    return '服务器内部错误'
  if (lower.includes('timeout'))
    return '请求超时'
  if (lower.includes('bad request'))
    return '请求格式错误，请检查参数'
  if (lower.includes('not found'))
    return '接口不存在，请检查 Base URL'
  if (lower.includes('permission denied'))
    return '权限不足'
  if (lower.includes('billing') || lower.includes('payment'))
    return '账单/付款问题，请检查账户'
  if (lower.includes('overloaded') || lower.includes('capacity'))
    return '服务过载，请稍后重试'
  if (lower.includes('thinking') && lower.includes('budget'))
    return '思考模式参数冲突，请不要手动传 thinking 相关参数'

  return ''
}

/** 从 localStorage 加载配置 */
function loadInitialConfig(): { config: AIConfig; rememberApiKey: boolean } {
  if (IS_MODEL_DISABLED_BUILD) return { config: { ...DEFAULT_CONFIG }, rememberApiKey: false }
  let savedConfig: Partial<AIConfig> & { _sessionCredentialId?: string } = {}
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      savedConfig = JSON.parse(saved)
      if (savedConfig.contextWindow !== undefined || savedConfig.modelCapacity !== undefined) {
        delete savedConfig.contextWindow
        delete savedConfig.modelCapacity
        // Preserve the credential reference and every unrelated setting verbatim.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedConfig))
      }
    }
  } catch { /* ignore */ }

  const rememberRaw = localStorage.getItem(REMEMBER_API_KEY)
  const rememberApiKey = rememberRaw === 'true'
  const { _sessionCredentialId, ...fields } = savedConfig
  const owner = { ...DEFAULT_CONFIG, ...fields }
  const rawSession = sessionStorage.getItem(SESSION_API_KEY)
  const sessionKey = readSessionCredentialV1(rawSession, owner, _sessionCredentialId)

  const config = normalizeConfigModel({
    ...DEFAULT_CONFIG,
    ...fields,
    apiKey: rememberApiKey ? (fields.apiKey || '') : sessionKey,
    customHeaders: rememberApiKey ? parseCustomHeaders(fields.customHeaders)
      : readSessionHeaders(sessionStorage.getItem(SESSION_HEADERS), owner, _sessionCredentialId),
  })
  if ((fields.contextWindow !== undefined || fields.modelCapacity !== undefined || (fields.model && config.model !== fields.model)) && (rememberApiKey || !rawSession || sessionKey || !fields.apiKey)) {
    persistConfig(config, rememberApiKey)
  }

  return {
    config,
    rememberApiKey,
  }
}

function normalizeConfigModel(config: AIConfig): AIConfig {
  config = { ...config }
  delete config.contextWindow
  delete config.modelCapacity
  if (config.provider !== 'custom') {
    delete config.customHeaders
    delete config.customHeadersPresetNames
  } else {
    if (config.customHeaders) config.customHeaders = parseCustomHeaders(config.customHeaders)
    if (config.customHeadersPresetNames) config.customHeadersPresetNames = [...new Set(config.customHeadersPresetNames
      .filter(name => typeof name === 'string' && /^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name.trim()))
      .map(name => name.trim().toLowerCase()))]
  }
  if (config.provider === 'codex') return { ...config, apiKey: '', baseUrl: '/storyforge/local-codex/v1' }
  const model = normalizeProviderModel(config.provider, config.model)
  return model === config.model ? config : { ...config, model }
}

function persistConfig(config: AIConfig, rememberApiKey: boolean): void {
  const referenceId = nanoid()
  const persisted = { ...presetConfig(normalizeConfigModel(config), rememberApiKey), _sessionCredentialId: referenceId }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  localStorage.setItem(REMEMBER_API_KEY, String(rememberApiKey))
  if (!rememberApiKey && config.customHeaders?.length) {
    sessionStorage.setItem(SESSION_HEADERS, JSON.stringify(createSessionCredentialV1(config, referenceId, JSON.stringify(config.customHeaders))))
  } else sessionStorage.removeItem(SESSION_HEADERS)
  if (rememberApiKey) {
    sessionStorage.removeItem(SESSION_API_KEY)
  } else if (config.apiKey) {
    sessionStorage.setItem(SESSION_API_KEY, JSON.stringify(createSessionCredentialV1(config, referenceId, config.apiKey)))
  } else {
    sessionStorage.removeItem(SESSION_API_KEY)
  }
}

function presetConfig(config: AIConfig, rememberApiKey: boolean): AIConfig {
  return rememberApiKey ? { ...config } : { ...config, apiKey: '', customHeaders: config.customHeaders ? [] : undefined }
}

export interface TestResult {
  ok: boolean
  message: string
  statusCode?: number
  duration?: number
}

interface AIConfigStore {
  config: AIConfig
  rememberApiKey: boolean
  presets: AIConfigPreset[]
  taskRoutes: AITaskRoutes
  agentContextProfiles: AgentContextProfiles
  agentTeamBudgetProfile: AgentTeamBudgetProfile
  creativeQualityMode: CreativeQualityModeV1
  /** 当前生效的预设 id（null = 未对应任何预设/已改动） */
  activePresetId: string | null
  /** 最近一次应用/保存的预设 id；表单改动后仍保留,用于显式覆盖当前预设。 */
  editingPresetId: string | null
  /** NS-5 语义检索（embedding）配置 */
  embedding: EmbeddingConfig
  setEmbeddingConfig: (partial: Partial<EmbeddingConfig>) => void
  setConfig: (config: Partial<AIConfig>) => void
  setRememberApiKey: (remember: boolean) => void
  switchProvider: (provider: AIProvider) => void
  testConnection: () => Promise<TestResult>
  // ── 预设管理 ──
  saveAsPreset: (name: string) => string
  applyPreset: (id: string) => void
  updatePresetFromCurrent: (id: string) => void
  renamePreset: (id: string, name: string) => void
  deletePreset: (id: string) => void
  setTaskRoute: (taskKind: AITaskKind, presetId: string | null) => void
  setAgentContextProfile: (taskKind: AgentContextTaskKind, profile: AgentContextProfile) => void
  setAgentTeamBudgetProfile: (profile: AgentTeamBudgetProfile) => void
  setCreativeQualityMode: (mode: CreativeQualityModeV1) => void
}

const initial = loadInitialConfig()

export const useAIConfigStore = create<AIConfigStore>((set, get) => ({
  config: initial.config,
  rememberApiKey: initial.rememberApiKey,
  presets: IS_MODEL_DISABLED_BUILD ? [] : loadPresets(),
  taskRoutes: loadTaskRoutes(),
  agentContextProfiles: loadAgentContextProfiles(),
  agentTeamBudgetProfile: loadAgentTeamBudgetProfile(),
  creativeQualityMode: loadCreativeQualityMode(),
  activePresetId: null,
  editingPresetId: null,
  embedding: IS_MODEL_DISABLED_BUILD ? { ...DEFAULT_EMBEDDING } : loadEmbeddingConfig(initial.rememberApiKey),

  setEmbeddingConfig: (partial: Partial<EmbeddingConfig>) => {
    if (IS_MODEL_DISABLED_BUILD) return
    const previous = get().embedding
    const next = { ...previous, ...partial }
    const identityChanged = previous.provider !== next.provider || previous.baseUrl !== next.baseUrl
    if (!Object.prototype.hasOwnProperty.call(partial, 'apiKey') && identityChanged && !sameAICredentialAuthorityV1(previous, next)) next.apiKey = ''
    persistEmbeddingConfig(next, get().rememberApiKey)
    set({ embedding: next })
  },

  setConfig: (partial: Partial<AIConfig>) => {
    if (IS_MODEL_DISABLED_BUILD) return
    const previous = get().config
    const newConfig = normalizeConfigModel({ ...previous, ...(partial.provider && partial.provider !== previous.provider ? { apiFormat: undefined } : {}), ...partial })
    const identityChanged = previous.provider !== newConfig.provider || previous.baseUrl !== newConfig.baseUrl
    if (identityChanged && !sameChatCredentialAuthority(previous, newConfig)) {
      if (!Object.prototype.hasOwnProperty.call(partial, 'apiKey')) newConfig.apiKey = ''
      if (!Object.prototype.hasOwnProperty.call(partial, 'customHeaders')) delete newConfig.customHeaders
    }
    persistConfig(newConfig, get().rememberApiKey)
    // 手动改动配置后，与已选预设脱钩（除非改动等于该预设）
    set({ config: newConfig, activePresetId: null })
  },

  setRememberApiKey: (remember: boolean) => {
    if (IS_MODEL_DISABLED_BUILD) return
    const state = get(), config = { ...state.config }, embedding = { ...state.embedding }
    persistConfig(config, remember)
    persistEmbeddingConfig(embedding, remember)
    const presets = state.presets.map(preset => {
      const headers = getAIConfigPresetHeadersV1(preset)
      const apiKey = getAIConfigPresetApiKeyV1(preset)
      const next = { ...preset, sessionCredentialId: preset.sessionCredentialId || nanoid(),
        config: { ...preset.config, apiKey: remember ? apiKey : '', customHeaders: remember ? headers : [] } }
      savePresetSessionApiKey(next.id, !remember && apiKey
        ? createSessionCredentialV1(next.config, next.sessionCredentialId, apiKey) : null)
      savePresetSessionHeaders(next, { ...next.config, customHeaders: headers }, remember)
      return next
    })
    savePresets(presets)
    set({ rememberApiKey: remember, presets })
  },

  saveAsPreset: (name: string) => {
    if (IS_MODEL_DISABLED_BUILD) return ''
    const state = get(), config = { ...state.config }, remember = state.rememberApiKey
    const id = nanoid()
    const preset: AIConfigPreset = {
      id,
      name: name.trim() || '未命名配置',
      config: presetConfig(config, remember),
      sessionCredentialId: nanoid(),
    }
    const presets = [...state.presets, preset]
    savePresets(presets)
    savePresetSessionHeaders(preset, config, remember)
    savePresetSessionApiKey(id, remember || !config.apiKey ? null
      : createSessionCredentialV1(config, preset.sessionCredentialId!, config.apiKey))
    set({ presets, activePresetId: id, editingPresetId: id })
    return id
  },

  applyPreset: (id: string) => {
    if (IS_MODEL_DISABLED_BUILD) return
    const preset = get().presets.find(p => p.id === id)
    if (!preset) return
    const newConfig = resolveAIConfigPresetV1(preset, get().config)
    persistConfig(newConfig, get().rememberApiKey)
    set({ config: newConfig, activePresetId: id, editingPresetId: id })
  },

  updatePresetFromCurrent: (id: string) => {
    if (IS_MODEL_DISABLED_BUILD) return
    const state = get(), config = { ...state.config }, remember = state.rememberApiKey
    if (!state.presets.some(preset => preset.id === id)) return
    const referenceId = nanoid()
    const presets = state.presets.map(p => p.id === id ? {
      ...p,
      config: presetConfig(config, remember),
      sessionCredentialId: referenceId,
    } : p)
    savePresets(presets)
    savePresetSessionApiKey(id, remember || !config.apiKey ? null
      : createSessionCredentialV1(config, referenceId, config.apiKey))
    savePresetSessionHeaders(presets.find(preset => preset.id === id)!, config, remember)
    set({ presets, activePresetId: id, editingPresetId: id })
  },

  renamePreset: (id: string, name: string) => {
    const presets = get().presets.map(p => p.id === id ? { ...p, name: name.trim() || p.name } : p)
    savePresets(presets)
    set({ presets })
  },

  deletePreset: (id: string) => {
    const presets = get().presets.filter(p => p.id !== id)
    const taskRoutes = Object.fromEntries(
      Object.entries(get().taskRoutes).filter(([, presetId]) => presetId !== id),
    ) as AITaskRoutes
    savePresets(presets)
    saveTaskRoutes(taskRoutes)
    savePresetSessionApiKey(id, null)
    savePresetSessionApiKey(id, null, PRESET_SESSION_HEADERS)
    set({
      presets,
      taskRoutes,
      activePresetId: get().activePresetId === id ? null : get().activePresetId,
      editingPresetId: get().editingPresetId === id ? null : get().editingPresetId,
    })
  },

  setTaskRoute: (taskKind, presetId) => {
    const taskRoutes = { ...get().taskRoutes }
    if (presetId && get().presets.some(preset => preset.id === presetId)) {
      taskRoutes[taskKind] = presetId
    } else {
      delete taskRoutes[taskKind]
    }
    saveTaskRoutes(taskRoutes)
    set({ taskRoutes })
  },

  setAgentContextProfile: (taskKind, profile) => {
    const agentContextProfiles = sanitizeAgentContextProfiles({
      ...get().agentContextProfiles,
      [taskKind]: profile,
    })
    saveAgentContextProfiles(agentContextProfiles)
    set({ agentContextProfiles })
  },

  setAgentTeamBudgetProfile: profile => {
    const agentTeamBudgetProfile = sanitizeAgentTeamBudgetProfile(profile)
    saveAgentTeamBudgetProfile(agentTeamBudgetProfile)
    set({ agentTeamBudgetProfile })
  },

  setCreativeQualityMode: mode => {
    const creativeQualityMode = sanitizeCreativeQualityModeV1(mode)
    saveCreativeQualityMode(creativeQualityMode)
    set({ creativeQualityMode })
  },

  switchProvider: (provider: AIProvider) => {
    if (IS_MODEL_DISABLED_BUILD) return
    const state = get(), previous = { ...state.config }
    const preset = PROVIDER_PRESETS[provider] || {}
    const owner = { ...previous, provider, apiFormat: undefined, ...preset }
    const newConfig = normalizeConfigModel({
      ...owner,
      apiKey: sameChatCredentialAuthority(previous, owner) ? previous.apiKey : (preset.apiKey || ''),
      customHeaders: sameChatCredentialAuthority(previous, owner) ? previous.customHeaders : undefined,
    })
    persistConfig(newConfig, state.rememberApiKey)
    set({ config: newConfig, activePresetId: null, editingPresetId: null })
  },

  testConnection: async (): Promise<TestResult> => {
    if (IS_MODEL_DISABLED_BUILD) return { ok: false, message: MODEL_DISABLED_NOTICE }
    const { config } = get()
    if (config.provider === 'codex') {
      const startedAt = Date.now()
      const log = createLog({ type: 'test', provider: 'codex', model: config.model, url: config.baseUrl, status: 'pending' })
      try {
        let text = ''
        for await (const delta of streamCodex([{ role: 'user', content: '仅回复：连接成功' }], config.model, AbortSignal.timeout(120_000))) text += delta
        updateLog(log.id, { status: 'success', duration: Date.now() - startedAt })
        return { ok: Boolean(text.trim()), message: 'Codex 最小生成成功，使用本机 ChatGPT 登录；消耗套餐额度，不代表长文或剩余额度充足。', duration: Date.now() - startedAt }
      } catch (error) {
        updateLog(log.id, { status: 'error', duration: Date.now() - startedAt, errorMessage: error instanceof Error ? error.message : 'Codex 连接失败' })
        return { ok: false, message: error instanceof Error ? error.message : 'Codex 连接失败', duration: Date.now() - startedAt }
      }
    }
    const format = providerApiFormat(config)
    const normalized = normalizeOpenAIBaseUrl(config.baseUrl, format)
    if (normalized.changed) {
      const newConfig = { ...config, baseUrl: normalized.baseUrl }
      persistConfig(newConfig, get().rememberApiKey)
      set({ config: newConfig, activePresetId: null })
    }
    const route = format === 'anthropic-messages' ? 'messages' : format === 'openai-responses' ? 'responses' : 'chat/completions'
    const url = buildOpenAIEndpoint(normalized.baseUrl, route, format)
    const startTime = Date.now()
    const controller = new AbortController()
    // NVIDIA 的托管开发端点常有冷启动；连接探活只限制输出，不把首 token
    // 超过 15 秒误判为 Key/模型失效。真实生成仍由调用方自己的 signal 控制。
    const timeoutMs = config.provider === 'nvidia' ? 60_000 : 20_000
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

    // 创建日志
    const log = createLog({
      type: 'test',
      provider: config.provider,
      url,
      model: config.model,
      status: 'pending',
    }, {
      sensitiveValues: [config.apiKey, ...customHeaderValues(config)],
      baseUrl: config.baseUrl,
    })

    try {
      const endpoint = transformProviderRequest(config, {
        model: config.model, messages: [{ role: 'user', content: '请回复“连接成功”' }],
        max_tokens: config.provider === 'agnes' || format === 'openai-responses' ? 1024 : 32,
      })
      const response = await fetch(endpoint.url, {
        method: 'POST',
        signal: controller.signal,
        headers: endpoint.headers,
        redirect: endpoint.redirect,
        body: endpoint.body,
      })

      const duration = Date.now() - startTime
      const bodyText = await response.text()
      const safeBodyText = redactRequestSecrets(bodyText, config)

      if (response.ok) {
        let completion
        try { completion = JSON.parse(bodyText) } catch {
          throw new AICompletionResponseErrorV1('invalid-json', '连接测试收到 HTTP 200，但响应不是 JSON。')
        }
        completion = normalizeProviderCompletion(config, completion)
        const responseSummary = inspectCompletionResponseV1(completion).summary
        updateLog(log.id, { statusCode: response.status, responseSummary })
        requireCompletionTextV1(completion)
        updateLog(log.id, { status: 'success', statusCode: response.status, duration })
        const prefix = normalized.warnings.length ? `${normalized.warnings.join(' ')} ` : ''
        return {
          ok: true,
          message: `✅ ${prefix}最小连接成功；仅证明当前模型可完成短请求，不代表长输出或批量评测额度`,
          statusCode: response.status,
          duration,
        }
      }

      // 解析错误信息
      let rawErrorMsg = `HTTP ${response.status}`
      try {
        const parsed = JSON.parse(safeBodyText)
        // Gemini OpenAI compatibility can wrap its normal error object in a
        // one-element array. Normalize both shapes before classification.
        const errJson = Array.isArray(parsed) ? parsed[0] : parsed
        const errRecord = errJson && typeof errJson === 'object' ? errJson as Record<string, unknown> : {}
        const nestedError = errRecord.error && typeof errRecord.error === 'object'
          ? errRecord.error as Record<string, unknown>
          : {}
        const candidate = [nestedError.message, errRecord.message, errRecord.error_msg]
          .find((value): value is string => typeof value === 'string' && value.length > 0)
        if (candidate) rawErrorMsg = candidate
        else if (safeBodyText.trim()) rawErrorMsg = safeBodyText.slice(0, 500)
      } catch {
        if (safeBodyText.trim()) rawErrorMsg += ': ' + safeBodyText.slice(0, 500)
      }

      // 常见英文错误 → 中文翻译映射
      const cnExplanation = getChineseExplanation(response.status, rawErrorMsg)

      const urlHint = normalized.warnings.length
        ? `；${normalized.warnings.join(' ')}`
        : ''
      const localHint = ['custom', 'ollama'].includes(config.provider)
        ? '；本地 OpenAI 兼容服务的 Base URL 通常应填到 /v1，例如 LM Studio: http://主机:1234/v1，Ollama: http://localhost:11434/v1'
        : ''
      const safeRawErrorMsg = redactRequestSecrets(rawErrorMsg, config)
      const errorMsg = `${cnExplanation ? `${safeRawErrorMsg}（${cnExplanation}）` : safeRawErrorMsg}${urlHint}${localHint}`

      updateLog(log.id, { status: 'error', statusCode: response.status, duration, errorMessage: errorMsg, responseBody: safeBodyText.slice(0, 500) })
      return { ok: false, message: `❌ ${errorMsg}`, statusCode: response.status, duration }

    } catch (err: unknown) {
      const duration = Date.now() - startTime
      const error = err as Error
      let errorMsg: string

      if (error.name === 'TypeError' && /Failed to fetch|Load failed|NetworkError|network request failed/i.test(error.message)) {
        errorMsg = '网络错误 — 浏览器未提供可读的 HTTP 响应，无法据此判断 Key 是否正确。请核对 Base URL 和网络；若控制台显示 CORS/预检失败，需要服务方放行当前网页来源。'
      } else if (error.name === 'AbortError') {
        errorMsg = '请求超时'
      } else {
        errorMsg = redactRequestSecrets(error.message || '未知错误', config)
      }

      updateLog(log.id, { status: 'error', duration, errorMessage: errorMsg })
      return { ok: false, message: `❌ ${errorMsg}`, duration }
    } finally {
      window.clearTimeout(timeoutId)
    }
  },
}))

// Promote only owner-matched credentials once; a later explicit opt-out remains effective.
if (!IS_MODEL_DISABLED_BUILD && import.meta.env.MODE === 'android' && localStorage.getItem(ANDROID_CREDENTIAL_MIGRATION) !== '1') {
  useAIConfigStore.getState().setRememberApiKey(true)
  localStorage.setItem(ANDROID_CREDENTIAL_MIGRATION, '1')
}
