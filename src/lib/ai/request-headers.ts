import type { AIConfig, AIRequestHeader } from '../types'

type HeaderConfig = Pick<AIConfig, 'provider' | 'apiKey' | 'customHeaders'>

export function parseCustomHeaders(input: unknown): AIRequestHeader[] {
  return Array.isArray(input) ? input.filter((row): row is AIRequestHeader => (
    !!row && typeof row === 'object' && typeof row.name === 'string' && typeof row.value === 'string'
  )).map(({ name, value }) => ({ name, value })) : []
}

export function customHeaderValues(config: Pick<AIConfig, 'provider' | 'customHeaders'>): string[] {
  return config.provider === 'custom' ? (config.customHeaders ?? []).flatMap(header => [header.value, header.value.trim()]) : []
}

export function hasCustomHeaders(config: Pick<AIConfig, 'provider' | 'customHeaders'>): boolean {
  return config.provider === 'custom' && (config.customHeaders ?? []).some(header => header.name.trim().length > 0)
}

function redactLiteralSecrets(text: string, secrets: readonly string[]): string {
  return secrets.reduce((message, secret) => message.split(secret).join('[REDACTED]'), text)
}

function redactJsonSecrets(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') return redactLiteralSecrets(value, secrets)
  if (Array.isArray(value)) return value.map(item => redactJsonSecrets(item, secrets))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      redactLiteralSecrets(key, secrets), redactJsonSecrets(item, secrets),
    ]))
  }
  return value
}

export function redactRequestSecrets(text: string, config: Pick<AIConfig, 'provider' | 'apiKey' | 'customHeaders'>): string {
  const secrets = [config.apiKey, ...customHeaderValues(config)]
    .filter(value => value.trim().length > 0)
    .sort((left, right) => right.length - left.length)
  const literalRedacted = redactLiteralSecrets(text, secrets)
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return literalRedacted }
  try {
    const sanitized = JSON.stringify(redactJsonSecrets(parsed, secrets))
    return redactLiteralSecrets(sanitized, secrets)
  } catch {
    return '[provider response omitted]'
  }
}

export function buildAIRequestHeaders(config: HeaderConfig, json = true): Record<string, string> | undefined {
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {}
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  if (config.provider === 'custom') {
    for (const { name, value } of config.customHeaders ?? []) {
      const trimmedName = name.trim()
      if (!trimmedName && !value) continue
      if (!trimmedName) throw new Error('自定义请求头名称不能为空')
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(trimmedName) || /[\r\n]/.test(value)) {
        throw new Error('自定义请求头格式无效：名称必须是 HTTP 字段名，值不能包含换行')
      }
      let normalizedValue: string
      try { normalizedValue = new Headers([[trimmedName, value]]).get(trimmedName)! }
      catch { throw new Error('自定义请求头格式无效：值必须使用 HTTP 支持的字符') }
      const previous = Object.keys(headers).find(key => key.toLowerCase() === trimmedName.toLowerCase())
      if (previous) delete headers[previous]
      Object.defineProperty(headers, trimmedName, { value: normalizedValue, enumerable: true, writable: true, configurable: true })
    }
  }
  return Object.keys(headers).length ? headers : undefined
}
