import type { AIConfig } from '../types';
import { buildAIRequestHeaders, hasCustomHeaders } from './request-headers';
import { normalizeOpenAIBaseUrl, providerApiFormat } from './openai-endpoint';
export { providerApiFormat } from './openai-endpoint'

type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
}
function rows(value: unknown): RecordValue[] { return Array.isArray(value) ? value.map(record) : [] }
function protocolError(): Error { return new Error('模型协议响应无效、失败或提前中断；未确认生成成功。') }

function contentParts(content: unknown, anthropic: boolean, assistant = false): unknown {
  if (typeof content === 'string') return content
  return rows(content).map(part => {
    if (part.type === 'text') return { type: anthropic ? 'text' : assistant ? 'output_text' : 'input_text', text: part.text }
    if (part.type !== 'image_url') throw new Error('当前 API 协议不支持此消息内容类型')
    const image = record(part.image_url)
    if (typeof image.url !== 'string') throw new Error('图片缺少 URL')
    if (!anthropic) return { type: 'input_image', image_url: image.url, ...(image.detail ? { detail: image.detail } : {}) }
    const data = /^data:([^;,]+);base64,(.*)$/s.exec(image.url)
    return { type: 'image', source: data ? { type: 'base64', media_type: data[1], data: data[2] } : { type: 'url', url: image.url } }
  })
}

/** Keep the existing OpenAI request builder as the single source of request policy. */
export function transformProviderRequest(config: AIConfig, original: RecordValue) {
  const format = providerApiFormat(config)
  const anthropic = format === 'anthropic-messages'
  let body = original
  if (format !== 'chat-completions') {
    const messages = rows(original.messages)
    const system = messages.filter(message => message.role === 'system').map(message => {
      if (typeof message.content !== 'string') throw new Error('System 消息必须为文本')
      return message.content
    }).join('\n\n')
    const input = messages.filter(message => message.role !== 'system').map(message => ({
      role: message.role, content: contentParts(message.content, anthropic, message.role === 'assistant'),
    }))
    body = { model: original.model, ...(typeof original.stream === 'boolean' ? { stream: original.stream } : {}) }
    if (anthropic) {
      body.messages = input
      if (system) body.system = system
      if (typeof original.max_tokens !== 'number' || original.max_tokens <= 0) throw new Error('Messages API 需要有效的最大输出 token 数')
      body.max_tokens = original.max_tokens
      if (original.temperature !== undefined) body.temperature = original.temperature
    } else {
      body.input = input
      if (system) body.instructions = system
      if (original.max_tokens !== undefined) body.max_output_tokens = original.max_tokens
      // Responses models do not all accept Chat Completions sampling parameters.
      body.store = false
    }
    if (original.tools) {
      body.tools = rows(original.tools).map(tool => {
        const fn = record(tool.function)
        return anthropic ? { name: fn.name, description: fn.description, input_schema: fn.parameters }
          : { type: 'function', name: fn.name, description: fn.description, parameters: fn.parameters, ...(fn.strict !== undefined ? { strict: fn.strict } : {}) }
      })
      const choice = original.tool_choice
      if (anthropic && choice === 'auto') body.tool_choice = { type: 'auto' }
      else if (anthropic && choice === 'required') body.tool_choice = { type: 'any' }
      else if (anthropic && choice && typeof choice === 'object') {
        const fn = record(record(choice).function)
        if (typeof fn.name === 'string') body.tool_choice = { type: 'tool', name: fn.name }
      } else if (!anthropic && choice !== undefined) {
        const fn = record(record(choice).function)
        body.tool_choice = fn.name ? { type: 'function', name: fn.name }
          : choice === 'required' ? 'required' : choice
      }
    }
    if (original.response_format) {
      const responseFormat = record(original.response_format)
      if (anthropic) {
        const format = responseFormat.type === 'json_schema'
          ? { type: 'json_schema', schema: record(responseFormat.json_schema).schema }
          : responseFormat.type === 'json_object' ? { type: 'json_schema', schema: { type: 'object' } } : undefined
        if (!format) throw new Error('Messages API 不支持此结构化输出格式')
        body.output_config = { format }
      } else {
        body.text = { format: responseFormat.type === 'json_schema'
          ? { type: 'json_schema', ...record(responseFormat.json_schema) } : responseFormat }
      }
    }
  }
  const endpoint = anthropic ? 'messages' : format === 'openai-responses' ? 'responses' : 'chat/completions'
  return {
    url: `${normalizeOpenAIBaseUrl(config.baseUrl, format).baseUrl}/${endpoint}`,
    headers: buildAIRequestHeaders(config),
    redirect: hasCustomHeaders(config) || anthropic ? 'error' as const : undefined,
    body: JSON.stringify(body),
  }
}

function normalizedUsage(value: unknown) {
  const usage = record(value)
  const input = usage.input_tokens, output = usage.output_tokens
  const valid = (number: unknown): number is number => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0
  if (!valid(input) && !valid(output)) return undefined
  return {
    ...(valid(input) ? { prompt_tokens: input } : {}),
    ...(valid(output) ? { completion_tokens: output } : {}),
    ...(valid(input) && valid(output) ? { total_tokens: input + output } : {}),
  }
}
function anthropicFinish(reason: unknown): string {
  if (reason === 'tool_use') return 'tool_calls'
  if (reason === 'max_tokens') return 'length'
  if (reason === 'refusal') return 'content_filter'
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'stop'
  throw protocolError()
}
interface Completion {
  choices?: Array<{ message?: { role?: string; content?: unknown; tool_calls?: unknown; refusal?: string }; finish_reason?: string }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}
export function normalizeProviderCompletion(config: AIConfig, payload: unknown): Completion {
  const format = providerApiFormat(config)
  if (format === 'chat-completions') return payload as Completion
  const root = record(payload)
  if (root.error || root.type === 'error') throw protocolError()
  let text = '', refusal = '', finish: string
  const tools: unknown[] = []
  if (format === 'anthropic-messages') {
    if (root.type !== 'message') throw protocolError()
    finish = anthropicFinish(root.stop_reason)
    for (const block of rows(root.content)) {
      if (block.type === 'text' && typeof block.text === 'string') text += block.text
      if (block.type === 'tool_use') tools.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } })
    }
  } else {
    if (root.status === 'incomplete' && record(root.incomplete_details).reason === 'max_output_tokens') finish = 'length'
    else if (root.status === 'completed') finish = 'stop'
    else throw protocolError()
    for (const item of rows(root.output)) {
      if (item.type === 'function_call') tools.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } })
      for (const block of rows(item.content)) {
        if (block.type === 'output_text' && typeof block.text === 'string') text += block.text
        if (block.type === 'refusal') refusal += typeof block.refusal === 'string' ? block.refusal : 'refused'
      }
    }
    if (tools.length && finish === 'stop') finish = 'tool_calls'
    if (refusal) finish = 'content_filter'
  }
  return { choices: [{ message: { role: 'assistant', content: text, ...(tools.length ? { tool_calls: tools } : {}), ...(refusal ? { refusal } : {}) }, finish_reason: finish }], ...(normalizedUsage(root.usage) ? { usage: normalizedUsage(root.usage) } : {}) }
}

/** A terminal provider event is required; an EOF after deltas is never success. */
export function normalizeProviderStream(config: AIConfig, response: Response): Response {
  const format = providerApiFormat(config)
  if (format === 'chat-completions' || !response.ok) return response
  if (!response.body) throw protocolError()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = '', eof = false, terminal = false, finish: string | undefined
  let usage: RecordValue = {}
  const toolIndexes = new Map<unknown, number>()
  function process(frame: string): string {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data) return ''
    let event: RecordValue
    try { event = record(JSON.parse(data)) } catch { throw protocolError() }
    if (event.type === 'error' || event.error || event.type === 'response.failed'
      || (event.type === 'response.incomplete' && record(event.response).status !== 'incomplete')) throw protocolError()
    const chunks: RecordValue[] = []
    const delta = (value: RecordValue) => chunks.push({ choices: [{ delta: value }] })
    if (format === 'anthropic-messages') {
      if (event.type === 'message_start') {
        const message = record(event.message)
        if (message.type !== 'message') throw protocolError()
        usage = { ...record(message.usage) }
      }
      if (event.type === 'content_block_start') {
        const block = record(event.content_block)
        if (block.type === 'text' && typeof block.text === 'string' && block.text) delta({ content: block.text })
        if (block.type === 'tool_use') {
          if (typeof block.id !== 'string' || typeof block.name !== 'string') throw protocolError()
          const index = toolIndexes.size
          toolIndexes.set(event.index, index)
          delta({ tool_calls: [{ index, id: block.id, type: 'function', function: { name: block.name, arguments: '' } }] })
        }
      }
      if (event.type === 'content_block_delta') {
        const value = record(event.delta)
        if (value.type === 'text_delta' && typeof value.text === 'string') delta({ content: value.text })
        if (value.type === 'input_json_delta') {
          const index = toolIndexes.get(event.index)
          if (index === undefined || typeof value.partial_json !== 'string') throw protocolError()
          delta({ tool_calls: [{ index, function: { arguments: value.partial_json } }] })
        }
      }
      if (event.type === 'message_delta') {
        finish = anthropicFinish(record(event.delta).stop_reason)
        if (finish === 'content_filter') throw protocolError()
        usage = { ...usage, ...record(event.usage) }
      }
      if (event.type === 'message_stop') {
        if (!finish) throw protocolError()
        terminal = true
      }
    } else {
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') delta({ content: event.delta })
      if (event.type === 'response.refusal.delta') throw protocolError()
      if (event.type === 'response.output_item.added' && record(event.item).type === 'function_call') {
        const item = record(event.item), index = toolIndexes.size
        if (typeof item.call_id !== 'string' || typeof item.name !== 'string') throw protocolError()
        toolIndexes.set(event.output_index, index)
        delta({ tool_calls: [{ index, id: item.call_id, type: 'function', function: { name: item.name, arguments: '' } }] })
      }
      if (event.type === 'response.function_call_arguments.delta') {
        const index = toolIndexes.get(event.output_index)
        if (index === undefined || typeof event.delta !== 'string') throw protocolError()
        delta({ tool_calls: [{ index, function: { arguments: event.delta } }] })
      }
      if (event.type === 'response.completed' && record(event.response).status !== 'completed') throw protocolError()
      if (event.type === 'response.incomplete' && record(event.response).status !== 'incomplete') throw protocolError()
      if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        const normalized = normalizeProviderCompletion(config, event.response)
        finish = normalized.choices?.[0]?.finish_reason
        if (!finish || finish === 'content_filter') throw protocolError()
        if (event.type === 'response.incomplete' && finish !== 'length') throw protocolError()
        usage = record(record(event.response).usage)
        terminal = true
      }
    }
    if (terminal) chunks.push({ choices: [{ delta: {}, finish_reason: finish }], usage: normalizedUsage(usage) })
    return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + (terminal ? 'data: [DONE]\n\n' : '')
  }
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!cancelled) {
          const boundary = /\r?\n\r?\n/.exec(buffer)
          if (boundary || eof) {
            const frame = boundary ? buffer.slice(0, boundary.index) : buffer
            buffer = boundary ? buffer.slice(boundary.index + boundary[0].length) : ''
            const output = process(frame)
            if (output) controller.enqueue(encoder.encode(output))
            if (terminal) {
              controller.close()
              try { await reader.cancel() } catch { /* Terminal response is already complete. */ }
              reader.releaseLock()
              return
            }
            if (eof && !buffer) throw protocolError()
            if (output) return
          } else {
            const chunk = await reader.read()
            if (cancelled) return
            eof = chunk.done
            buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true })
          }
        }
      } catch (error) {
        if (!cancelled) controller.error(error)
        try { await reader.cancel(); reader.releaseLock() } catch { /* Keep the original stream error. */ }
      }
    },
    async cancel(reason) { cancelled = true; try { await reader.cancel(reason) } finally { reader.releaseLock() } },
  })
  return new Response(stream, { status: response.status, headers: { 'Content-Type': 'text/event-stream' } })
}
