import { describe, expect, it, vi, afterEach } from 'vitest'
import type { AIConfig } from '../../src/lib/types'
import { transformProviderRequest, normalizeProviderCompletion, normalizeProviderStream } from '../../src/lib/ai/provider-protocol'
import { buildAIRequestHeaders } from '../../src/lib/ai/request-headers'
import { fetchOpenAIModels } from '../../src/lib/ai/model-list'
import { buildOpenAIEndpoint } from '../../src/lib/ai/openai-endpoint'
const config = (apiFormat: AIConfig['apiFormat']): AIConfig => ({ provider: 'custom', apiFormat, baseUrl: 'https://gateway.invalid/v1', apiKey: 'synthetic', model: 'test', maxTokens: 100, temperature: 0.7 })
const body = { model: 'test', messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: [{ type: 'text', text: 'hello' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] }], max_tokens: 100, temperature: 0.7, tools: [{ type: 'function', function: { name: 'lookup', description: 'look', parameters: { type: 'object' } } }], tool_choice: 'auto' }
function sse(events: unknown[], tail = true) {
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}`).join('\r\n\r\n') + (tail ? '\r\n\r\n' : ''))
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close() } }))
}
afterEach(() => vi.unstubAllGlobals())
describe('CLI HTTP protocols', () => {
  it('converts Messages system, image and tools and uses Anthropic authentication', () => {
    const cfg = config('anthropic-messages')
    const req = transformProviderRequest(cfg, body)
    expect(req.url).toBe('https://gateway.invalid/v1/messages')
    const value = JSON.parse(req.body)
    expect(value).toMatchObject({ system: 'rules', max_tokens: 100, tools: [{ name: 'lookup', input_schema: { type: 'object' } }] })
    expect(value.messages[0].content[1]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png' } })
    expect(buildAIRequestHeaders(cfg)).toMatchObject({ 'x-api-key': 'synthetic', 'anthropic-version': '2023-06-01' })
    expect(buildAIRequestHeaders(cfg)).not.toHaveProperty('Authorization')
  })
  it('keeps legacy Claude-labeled gateways on Chat Completions unless opted in', () => {
    const legacy = { ...config(undefined), provider: 'claude' as const }
    expect(buildOpenAIEndpoint(legacy.baseUrl, 'chat/completions', undefined)).toBe('https://gateway.invalid/v1/chat/completions')
    expect(buildAIRequestHeaders(legacy)?.Authorization).toBe('Bearer synthetic')
    expect(buildAIRequestHeaders({ ...legacy, apiFormat: 'anthropic-messages' })).toMatchObject({ 'x-api-key': 'synthetic' })
  })
  it('normalizes a configured full Responses endpoint without duplicating its route', () => {
    expect(buildOpenAIEndpoint('https://gateway.invalid/v1/responses', 'responses', 'openai-responses'))
      .toBe('https://gateway.invalid/v1/responses')
  })
  it('converts Responses system, image and tools without unsupported sampling defaults', () => {
    const req = transformProviderRequest(config('openai-responses'), body)
    expect(req.url).toBe('https://gateway.invalid/v1/responses')
    const value = JSON.parse(req.body)
    expect(value).toMatchObject({ instructions: 'rules', max_output_tokens: 100, tools: [{ type: 'function', name: 'lookup' }] })
    expect(value.input[0].content[1]).toMatchObject({ type: 'input_image', image_url: 'data:image/png;base64,aGVsbG8=' })
    expect(value).not.toHaveProperty('temperature')
  })
  it('maps JSON-object mode to a generic Anthropic JSON schema', () => {
    const request = transformProviderRequest(config('anthropic-messages'), { ...body, response_format: { type: 'json_object' } })
    expect(JSON.parse(request.body).output_config).toEqual({ format: { type: 'json_schema', schema: { type: 'object' } } })
  })
  it('normalizes Messages text, tool calls, usage and finish', () => {
    expect(normalizeProviderCompletion(config('anthropic-messages'), { type: 'message', content: [{ type: 'text', text: 'hello' }, { type: 'tool_use', id: 't', name: 'lookup', input: { q: 1 } }], stop_reason: 'tool_use', usage: { input_tokens: 3, output_tokens: 4 } })).toMatchObject({ choices: [{ message: { content: 'hello', tool_calls: [{ id: 't', function: { name: 'lookup', arguments: '{"q":1}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })
  })
  it('normalizes Responses output and refuses error or mismatched terminal events', async () => {
    expect(normalizeProviderCompletion(config('openai-responses'), { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'hello' }] }], usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } })).toMatchObject({ choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }], usage: { total_tokens: 5 } })
    expect(() => normalizeProviderCompletion(config('openai-responses'), { status: 'failed', error: { message: 'synthetic' } })).toThrow()
    await expect(normalizeProviderStream(config('openai-responses'), sse([
      { type: 'response.completed', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] } },
    ])).text()).rejects.toThrow()
    expect(() => normalizeProviderCompletion(config('anthropic-messages'), { type: 'message', content: [] })).toThrow()
  })
  it.each([true, false])('handles Messages SSE byte splits and final tail (separator=%s)', async tail => {
    const response = normalizeProviderStream(config('anthropic-messages'), sse([{ type: 'message_start', message: { type: 'message', usage: { input_tokens: 3 } } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }, { type: 'message_stop' }], tail))
    const text = await response.text()
    expect(text).toContain('你好')
    expect(text).toContain('"total_tokens":7')
    expect(text).toContain('[DONE]')
  })
  it('normalizes Responses deltas and terminal usage', async () => {
    const text = await normalizeProviderStream(config('openai-responses'), sse([{ type: 'response.output_text.delta', delta: 'hello' }, { type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } } }], false)).text()
    expect(text).toContain('hello')
    expect(text).toContain('"finish_reason":"stop"')
    expect(text).toContain('"total_tokens":5')
  })
  it('accepts Responses max-output incomplete as a terminal length result', async () => {
    const text = await normalizeProviderStream(config('openai-responses'), sse([
      { type: 'response.output_text.delta', delta: 'partial' },
      { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } } },
    ], false)).text()
    expect(text).toContain('partial')
    expect(text).toContain('"finish_reason":"length"')
    expect(text).toContain('"total_tokens":5')
    expect(text).toContain('[DONE]')
    await expect(normalizeProviderStream(config('openai-responses'), sse([
      { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [] } },
    ])).text()).rejects.toThrow()
  })
  it('rejects premature EOF and error events, and forwards cancellation', async () => {
    await expect(normalizeProviderStream(config('anthropic-messages'), sse([{ type: 'message_delta', delta: { stop_reason: 'end_turn' } }])).text()).rejects.toThrow()
    await expect(normalizeProviderStream(config('openai-responses'), sse([{ type: 'error', message: 'synthetic' }])).text()).rejects.toThrow()
    const cancel = vi.fn()
    const response = normalizeProviderStream(config('openai-responses'), new Response(new ReadableStream({ cancel })))
    await response.body!.cancel()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('reports the exact automatic output parameter for both explicit protocols', async () => {
    const { describeResolvedAIRequestSettingsV1, resolveRequestConfig } = await import('../../src/lib/ai/client')
    const messages = { ...config('anthropic-messages'), maxTokens: 0 }
    const messagesSettings = describeResolvedAIRequestSettingsV1(resolveRequestConfig(messages), false)
    expect(messagesSettings.parameters.max_tokens).toBeGreaterThan(0)
    const responsesSettings = describeResolvedAIRequestSettingsV1(resolveRequestConfig(config('openai-responses')), false)
    expect(responsesSettings.parameters.max_output_tokens).toBeGreaterThan(0)
  })
  it('preserves a Responses length finish reason alongside returned partial content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }],
      usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
    })))
    const { chat } = await import('../../src/lib/ai/client')
    const result: { finishReason?: string } = {}
    const text = await chat([{ role: 'user', content: 'hello' }], config('openai-responses'), undefined, undefined, result)
    expect(text).toBe('partial')
    expect(result.finishReason).toBe('length')
  })
  it('uses Messages authentication for model queries', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ id: 'claude-test' }] }))
    expect(await fetchOpenAIModels({ ...config('anthropic-messages'), fetchImpl })).toEqual(['claude-test'])
    expect(new Headers((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get('x-api-key')).toBe('synthetic')
  })
})
