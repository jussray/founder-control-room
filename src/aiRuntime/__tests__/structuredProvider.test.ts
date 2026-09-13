import { describe, expect, it, vi } from 'vitest';
import {
  runStructuredJson,
  StructuredProviderError,
  type StructuredProviderConfig,
} from '../structuredProvider.js';

const SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
} as const;

const REQUEST = {
  schemaName: 'test_output',
  schema: SCHEMA,
  systemPrompt: 'Return the requested structured result.',
  userPrompt: 'Answer with ok.',
  maxOutputTokens: 128,
};

function fakeResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => normalized.get(key.toLowerCase()) ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function openAiConfig(): StructuredProviderConfig {
  return { provider: 'openai', apiKey: 'openai-test', model: 'gpt-test' };
}

function anthropicConfig(): StructuredProviderConfig {
  return { provider: 'anthropic', apiKey: 'anthropic-test', model: 'claude-test' };
}

describe('runStructuredJson', () => {
  it('uses OpenAI Responses structured output without leaking provider shape to callers', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => fakeResponse({
      id: 'resp_1',
      output_text: JSON.stringify({ answer: 'ok' }),
    }));

    const result = await runStructuredJson([openAiConfig()], REQUEST, { fetchFn });

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-test',
      responseId: 'resp_1',
      output: { answer: 'ok' },
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(init!.body as string);
    expect(body.text.format).toEqual(expect.objectContaining({
      type: 'json_schema',
      name: 'test_output',
      strict: true,
      schema: SCHEMA,
    }));
  });

  it('uses Anthropic JSON structured outputs through the same contract', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => fakeResponse({
      id: 'msg_1',
      content: [{ type: 'text', text: JSON.stringify({ answer: 'ok' }) }],
    }));

    const result = await runStructuredJson([anthropicConfig()], REQUEST, { fetchFn });

    expect(result).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      responseId: 'msg_1',
      output: { answer: 'ok' },
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init!.headers as Record<string, string>;
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init!.body as string);
    expect(body.output_config.format).toEqual({ type: 'json_schema', schema: SCHEMA });
  });

  it('fails over only after a retryable provider failure', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ error: { message: 'temporary outage' } }, 503))
      .mockResolvedValueOnce(fakeResponse({
        id: 'msg_fallback',
        content: [{ type: 'text', text: JSON.stringify({ answer: 'recovered' }) }],
      }));

    const result = await runStructuredJson(
      [openAiConfig(), anthropicConfig()],
      REQUEST,
      { fetchFn },
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_fallback',
      output: { answer: 'recovered' },
    });
  });

  it('does not fail over after a permanent authentication failure', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ error: { message: 'bad key' } }, 401));

    await expect(runStructuredJson(
      [openAiConfig(), anthropicConfig()],
      REQUEST,
      { fetchFn },
    )).rejects.toMatchObject({
      code: 'OPENAI_HTTP_ERROR',
      status: 401,
      retryable: false,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout armed through the full response body read', async () => {
    const events: string[] = [];
    const originalClearTimeout = global.clearTimeout;
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout').mockImplementation((id) => {
      events.push('clearTimeout');
      return originalClearTimeout(id);
    });

    try {
      const fetchFn = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => {
          events.push('text-start');
          await Promise.resolve();
          events.push('text-end');
          return JSON.stringify({ id: 'resp_2', output_text: JSON.stringify({ answer: 'ok' }) });
        },
      } as unknown as Response));

      await runStructuredJson([openAiConfig()], REQUEST, { fetchFn });
      expect(events).toEqual(['text-start', 'text-end', 'clearTimeout']);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it('rejects oversized bodies before parsing them', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(
      { id: 'resp_big', output_text: JSON.stringify({ answer: 'ok' }) },
      200,
      { 'content-length': '999999' },
    ));

    await expect(runStructuredJson([openAiConfig()], REQUEST, {
      fetchFn,
      maxResponseBytes: 1024,
    })).rejects.toBeInstanceOf(StructuredProviderError);
    await expect(runStructuredJson([openAiConfig()], REQUEST, {
      fetchFn,
      maxResponseBytes: 1024,
    })).rejects.toMatchObject({ code: 'OPENAI_RESPONSE_TOO_LARGE' });
  });

  it('cancels streamed bodies as soon as their byte budget is exceeded', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('x'.repeat(700)),
      encoder.encode('y'.repeat(700)),
      encoder.encode('z'.repeat(700)),
    ];
    let readIndex = 0;
    let cancelled = false;

    const reader = {
      read: async () => {
        const value = chunks[readIndex];
        readIndex += 1;
        return value ? { done: false, value } : { done: true, value: undefined };
      },
      cancel: async () => {
        cancelled = true;
      },
      releaseLock: () => undefined,
    };

    const fetchFn = vi.fn<typeof fetch>(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => reader },
      text: async () => {
        throw new Error('streamed responses must not fall back to response.text()');
      },
    } as unknown as Response));

    await expect(runStructuredJson([openAiConfig()], REQUEST, {
      fetchFn,
      maxResponseBytes: 1024,
    })).rejects.toMatchObject({ code: 'OPENAI_RESPONSE_TOO_LARGE' });

    expect(cancelled).toBe(true);
    expect(readIndex).toBe(2);
  });
});
