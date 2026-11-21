import { useState } from 'react'
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import type { AIConfig, AIRequestHeader } from '../../lib/types'
import { buildAIRequestHeaders } from '../../lib/ai/request-headers'

const CLAUDE_CODE_USER_AGENT = 'claude-cli/2.1.301 (external, sdk-cli)'
const CLAUDE_CODE_BETA = 'claude-code-20250219,interleaved-thinking-2025-05-14,thinking-token-count-2026-05-13,context-management-2025-06-27,prompt-caching-scope-2026-01-05,per-turn-control-2026-07-01,mid-conversation-tool-changes-2026-07-01,effort-2025-11-24,dangerous-tool-use-2026-09-03,afk-mode-2026-01-31'
const CODEX_USER_AGENT = 'codex_cli_rs/0.163.0 (Ubuntu 26.10.0; aarch64) xterm-256color (codex_cli_rs; 0.163.0)'

interface Props {
  headers: AIRequestHeader[]
  presetHeaderNames: string[]
  onChange: (headers: AIRequestHeader[], presetHeaderNames: string[]) => void
  apiFormat?: AIConfig['apiFormat']
  onProtocolChange?: (apiFormat: NonNullable<AIConfig['apiFormat']>, headers: AIRequestHeader[], presetHeaderNames: string[]) => void
}

export default function CustomRequestHeaders({ headers, presetHeaderNames, onChange, apiFormat, onProtocolChange }: Props) {
  function applyPreset(kind: 'claude' | 'codex') {
    const defaults: AIRequestHeader[] = kind === 'claude' ? [
      { name: 'User-Agent', value: CLAUDE_CODE_USER_AGENT },
      { name: 'X-Claude-Code-Session-Id', value: crypto.randomUUID() },
      { name: 'anthropic-beta', value: CLAUDE_CODE_BETA },
      { name: 'anthropic-dangerous-direct-browser-access', value: 'true' },
      { name: 'anthropic-version', value: '2023-06-01' },
      { name: 'x-app', value: 'cli' },
    ] : [
      { name: 'originator', value: 'codex_cli_rs' },
      { name: 'User-Agent', value: CODEX_USER_AGENT },
    ]
    const retained = headers.filter(row => !presetHeaderNames.includes(row.name.trim().toLowerCase()))
    const existing = new Set(retained.map(row => row.name.trim().toLowerCase()))
    const nextPresetHeaders = defaults.filter(row => !existing.has(row.name.toLowerCase()))
    onProtocolChange?.(kind === 'claude' ? 'anthropic-messages' : 'openai-responses', [...retained, ...nextPresetHeaders],
      nextPresetHeaders.map(row => row.name.toLowerCase()))
  }
  const [showValues, setShowValues] = useState(false)
  let error = ''
  try { buildAIRequestHeaders({ provider: 'custom', apiKey: '', customHeaders: headers }) }
  catch (cause) { error = cause instanceof Error ? cause.message : '自定义请求头格式无效' }

  return (
    <details className="rounded-lg border border-border bg-bg-base p-3" open={headers.length > 0}>
      <summary className="cursor-pointer text-sm text-text-secondary">自定义请求头（可选）</summary>
      <p className="mt-2 text-xs text-text-muted">
        用于当前自定义服务的生成、连接测试和模型查询。同名请求头不区分大小写，后填的值覆盖默认值和前面的值。
        浏览器版仅能发送浏览器允许的请求头，服务端需允许对应的 CORS 请求头。
      </p>
      {onProtocolChange && <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-text-secondary">API 协议
          <select aria-label="API 协议" value={apiFormat ?? 'chat-completions'}
            onChange={event => onProtocolChange(event.target.value as NonNullable<AIConfig['apiFormat']>, headers, presetHeaderNames)}
            className="ml-2 rounded border border-border bg-bg-surface p-2">
            <option value="chat-completions">OpenAI Chat Completions</option>
            <option value="anthropic-messages">Anthropic Messages</option>
            <option value="openai-responses">OpenAI Responses</option>
          </select>
        </label>
        <button type="button" className="min-h-11 px-3 text-xs text-accent" onClick={() => applyPreset('claude')}>Claude Code 请求头</button>
        <button type="button" className="min-h-11 px-3 text-xs text-accent" onClick={() => applyPreset('codex')}>Codex 专属选项</button>
        <p className="w-full text-xs text-text-muted">Codex 选项使用 /v1/responses 与 OpenAI 兼容 Bearer 密钥；请在上方密钥框填写服务密钥，不提供 ChatGPT 订阅登录或授权。预设保留已填的同名值；密钥和请求头由“在本机记住”开关一起保存。</p>
      </div>}
      <div className="mt-3 space-y-2">
        {headers.map((header, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`请求头名称 ${index + 1}`}
              value={header.name}
              onChange={event => {
                const oldName = header.name.trim().toLowerCase()
                const newName = event.target.value.trim().toLowerCase()
                let nextHeaders = headers.map((row, i) => i === index ? { ...row, name: event.target.value } : row)
                if (newName !== oldName && presetHeaderNames.includes(newName)) {
                  nextHeaders = nextHeaders.filter((row, i) => i === index || row.name.trim().toLowerCase() !== newName)
                }
                onChange(nextHeaders, presetHeaderNames.filter(name => name !== oldName && name !== newName))
              }}
              placeholder="例如 X-API-Key"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 basis-32 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <input
              aria-label={`请求头值 ${index + 1}`}
              type={showValues ? 'text' : 'password'}
              value={header.value}
              onChange={event => onChange(headers.map((row, i) => i === index ? { ...row, value: event.target.value } : row),
                presetHeaderNames.filter(name => name !== header.name.trim().toLowerCase()))}
              placeholder="请求头值"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 basis-40 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <button type="button" aria-label={`删除请求头 ${index + 1}`} onClick={() => onChange(headers.filter((_, i) => i !== index),
              presetHeaderNames.filter(name => name !== header.name.trim().toLowerCase()))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:bg-bg-surface hover:text-text-primary">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onChange([...headers, { name: '', value: '' }], presetHeaderNames)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs text-accent hover:bg-accent/10">
          <Plus className="h-4 w-4" />添加请求头
        </button>
        {headers.length > 0 && <button type="button" onClick={() => setShowValues(!showValues)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs text-text-muted hover:bg-bg-surface">
          {showValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showValues ? '隐藏请求头值' : '显示请求头值'}
        </button>}
      </div>
    </details>
  )
}
