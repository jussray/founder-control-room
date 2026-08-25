import { describe, expect, it, vi } from 'vitest';
import { createOpenAiQuickScanChiefRunner, QuickScanChiefProviderError } from '../chiefOpenaiClient.js';
import { QUICKSCAN_CHIEF_WORKFLOW } from '../chiefPrompts.js';
import type { QuickScanChiefPromptInput } from '../chiefPrompts.js';

function promptInput(overrides: Partial<QuickScanChiefPromptInput> = {}): QuickScanChiefPromptInput {
  return {
    businessName: 'Glow Studio',
    ownerName: 'Maya',
    segment: 'salon_studio_team_owner',
    lifecycleState: 'draft_ready',
    score: { visibleFriction: 2, activeDemand: 2, ownerReachable: 1, repeatHighValue: 2, operationalComplexity: 1, urgency: 2, total: 10, evidenceIds: ['e1'], humanApproved: false },
    evidence: [{ id: 'e1', category: 'visible_friction', note: 'Customers ask about availability in comments.', observedAt: new Date().toISOString() }],
    qualification: null,
    ...overrides,
  };
}

function fakeResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = init.status ?? 200;
  const headerMap = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headerMap.get(key.toLowerCase()) ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function openAiPayload(output: Record<string, unknown>, responseId = 'resp_test_1') {
  return { id: responseId, output_text: JSON.stringify(output) };
}

describe('createOpenAiQuickScanChiefRunner', () => {
  it('refuses to run without OPENAI_API_KEY configured', async () => {
    const runner = createOpenAiQuickScanChiefRunner({ env: {}, fetchFn: vi.fn() });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'OPENAI_NOT_CONFIGURED' });
  });

  it('returns a recommendation stamped with the canonical PromptOS workflow', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(openAiPayload({
      summary: 'Clear evidence of missed booking requests.',
      next_action: 'approve_outreach',
      message_draft: 'Hey Maya — do booking requests in comments ever slip through?',
    })));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    const result = await runner(promptInput());

    expect(result.recommendation).toEqual({
      summary: 'Clear evidence of missed booking requests.',
      nextAction: 'approve_outreach',
      messageDraft: 'Hey Maya — do booking requests in comments ever slip through?',
      promptWorkflow: QUICKSCAN_CHIEF_WORKFLOW,
    });
    expect(result.provenance).toMatchObject({ provider: 'openai', model: 'gpt-5-mini', responseId: 'resp_test_1' });
  });

  it('uses the configured model override in the request body', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => fakeResponse(openAiPayload({
      summary: 'Not enough evidence yet.',
      next_action: 'capture_more_evidence',
      message_draft: null,
    })));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test', QUICKSCAN_CHIEF_MODEL: 'gpt-5-nano' }, fetchFn });
    const result = await runner(promptInput());

    expect(result.provenance.model).toBe('gpt-5-nano');
    const requestBody = JSON.parse(fetchFn.mock.calls[0][1]!.body as string);
    expect(requestBody.model).toBe('gpt-5-nano');
  });

  it('allows a null message_draft for a purely informational next action', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(openAiPayload({
      summary: 'Evidence is too thin to recommend outreach yet.',
      next_action: 'capture_more_evidence',
      message_draft: null,
    })));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    const result = await runner(promptInput());

    expect(result.recommendation.nextAction).toBe('capture_more_evidence');
    expect(result.recommendation.messageDraft).toBeUndefined();
  });

  it('refuses a send-worthy next action with a missing message_draft', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(openAiPayload({
      summary: 'Ready for outreach.',
      next_action: 'approve_outreach',
      message_draft: null,
    })));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'INVALID_MODEL_OUTPUT' });
  });

  it('refuses an unsupported next_action value', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(openAiPayload({
      summary: 'Ready.',
      next_action: 'send_invoice',
      message_draft: null,
    })));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'INVALID_MODEL_OUTPUT' });
  });

  it('surfaces a non-2xx OpenAI response as a provider error', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ error: { message: 'rate limited' } }, { status: 429 }));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'OPENAI_HTTP_ERROR', status: 429 });
  });

  it('refuses a response body that is not valid JSON', async () => {
    const fetchFn = vi.fn(async () => fakeResponse('not json'));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'OPENAI_INVALID_RESPONSE' });
  });

  it('refuses a response declared larger than the allowed size before reading the body', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(openAiPayload({ summary: 'x', next_action: 'capture_more_evidence', message_draft: null }), {
      headers: { 'content-length': String(200 * 1024) },
    }));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'OPENAI_RESPONSE_TOO_LARGE' });
  });

  it('treats an abort as a timeout error', async () => {
    const fetchFn = vi.fn(async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      throw abortError;
    });
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'OPENAI_TIMEOUT' });
  });

  it('exposes QuickScanChiefProviderError as the error class for provider failures', async () => {
    const fetchFn = vi.fn(async () => fakeResponse('not json'));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toBeInstanceOf(QuickScanChiefProviderError);
  });

  it('keeps the abort timer active until the response body has been fully read', async () => {
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
          return JSON.stringify(openAiPayload({ summary: 'x', next_action: 'capture_more_evidence', message_draft: null }));
        },
      } as unknown as Response));

      const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
      await runner(promptInput());

      expect(events).toEqual(['text-start', 'text-end', 'clearTimeout']);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it('treats an abort that fires while reading the response body as a timeout error', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => {
        const abortError = new Error('aborted mid-body');
        abortError.name = 'AbortError';
        throw abortError;
      },
    } as unknown as Response));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'OPENAI_TIMEOUT' });
  });
});
