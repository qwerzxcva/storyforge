import { useState } from 'react'
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import type { AIRequestHeader } from '../../lib/types'
import { buildAIRequestHeaders } from '../../lib/ai/request-headers'

interface Props {
  headers: AIRequestHeader[]
  onChange: (headers: AIRequestHeader[]) => void
}

export default function CustomRequestHeaders({ headers, onChange }: Props) {
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
      <div className="mt-3 space-y-2">
        {headers.map((header, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`请求头名称 ${index + 1}`}
              value={header.name}
              onChange={event => onChange(headers.map((row, i) => i === index ? { ...row, name: event.target.value } : row))}
              placeholder="例如 X-API-Key"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 basis-32 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <input
              aria-label={`请求头值 ${index + 1}`}
              type={showValues ? 'text' : 'password'}
              value={header.value}
              onChange={event => onChange(headers.map((row, i) => i === index ? { ...row, value: event.target.value } : row))}
              placeholder="请求头值"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 basis-40 rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <button type="button" aria-label={`删除请求头 ${index + 1}`} onClick={() => onChange(headers.filter((_, i) => i !== index))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:bg-bg-surface hover:text-text-primary">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onChange([...headers, { name: '', value: '' }])}
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
