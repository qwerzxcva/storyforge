import type { AIConfig } from '../types';

export function providerApiFormat(config: Pick<AIConfig, 'provider' | 'apiFormat'>): NonNullable<AIConfig['apiFormat']> {
  return config.apiFormat ?? 'chat-completions'
}

export interface NormalizedOpenAIBaseUrl {
  baseUrl: string
  changed: boolean
  warnings: string[]
}

const COMMON_ENDPOINT_SUFFIXES = [
  '/chat/completions',
  '/completions',
  '/models',
  '/embeddings',
]

export function normalizeOpenAIBaseUrl(rawBaseUrl: string, format: AIConfig['apiFormat'] = 'chat-completions'): NormalizedOpenAIBaseUrl {
  const input = (rawBaseUrl || '').trim()
  let baseUrl = input.replace(/\/+$/, '')
  const warnings: string[] = []

  const extraSuffix = format === 'anthropic-messages' ? '/messages' : format === 'openai-responses' ? '/responses' : ''
  for (const suffix of extraSuffix ? [...COMMON_ENDPOINT_SUFFIXES, extraSuffix] : COMMON_ENDPOINT_SUFFIXES) {
    if (baseUrl.toLowerCase().endsWith(suffix)) {
      baseUrl = baseUrl.slice(0, -suffix.length).replace(/\/+$/, '')
      warnings.push(`Base URL 已包含 ${suffix} 端点，已按 OpenAI 兼容根路径自动修正。`)
      break
    }
  }

  if (extraSuffix && /^https?:\/\/[^/?#\\\s]+$/i.test(baseUrl)) baseUrl += '/v1'

  const beforeDedupe = baseUrl
  baseUrl = baseUrl.replace(/(\/v1)+\/v1$/i, '/v1')
  if (baseUrl !== beforeDedupe) {
    warnings.push('Base URL 含重复 /v1，已自动合并。')
  }

  return {
    baseUrl,
    changed: baseUrl !== input.replace(/\/+$/, ''),
    warnings,
  }
}

export function buildOpenAIEndpoint(rawBaseUrl: string, endpoint: 'chat/completions' | 'models' | 'embeddings' | 'messages' | 'responses', format?: AIConfig['apiFormat']): string {
  const normalized = normalizeOpenAIBaseUrl(rawBaseUrl, format)
  return `${normalized.baseUrl}/${endpoint}`
}
