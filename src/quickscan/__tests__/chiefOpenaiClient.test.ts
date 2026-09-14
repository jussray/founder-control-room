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

function localPayload(output: Record<string, unknown>) {
  return { created_at: '2026-09-13T17:00:00Z', message: { content: JSON.stringify(output) } };
}

const validOutput = {
  summary: 'Clear evidence of missed booking requests.',
  next_action: 'approve_outreach',
  message_draft: 'Hey Maya — do booking requests in comments ever slip through?',
};

describe('createOpenAiQuickScanChiefRunner', () => {
  it('keeps Chief operational without any model provider configured', async () => {
    const fetchFn = vi.fn();
    const runner = createOpenAiQuickScanChiefRunner({ env: {}, fetchFn });
    const result = await runner(promptInput());

    expect(result.recommendation).toMatchObject({
      nextAction: 'capture_more_evidence',
      promptWorkflow: QUICKSCAN_CHIEF_WORKFLOW,
    });
    expect(result.provenance).toMatchObject({
      provider: 'deterministic-kernel',
      model: 'quickscan-rules-v1',
      responseId: null,
      fallbackReason: 'NO_MODEL_PROVIDER_CONFIGURED',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns a recommendation stamped with the canonical PromptOS workflow', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(openAiPayload(validOutput)));
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

  it('selects an eligible verified local runtime before the paid provider', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith('/api/chat')) return fakeResponse(localPayload(validOutput));
      return fakeResponse(openAiPayload(validOutput));
    });
    const runner = createOpenAiQuickScanChiefRunner({
      env: {
        QUICKSCAN_LOCAL_ENABLED: 'true',
        QUICKSCAN_LOCAL_QUALITY_VERIFIED: 'true',
        QUICKSCAN_LOCAL_COMMERCIAL_RIGHTS: 'verified',
        QUICKSCAN_LOCAL_LICENSE_EVIDENCE: 'license-reviewed',
        QUICKSCAN_LOCAL_BASE_URL: 'http://127.0.0.1:11434',
        QUICKSCAN_LOCAL_MODEL: 'qwen3:8b',
        OPENAI_API_KEY: 'sk-test',
      },
      fetchFn,
    });

    const result = await runner(promptInput());

    expect(result.provenance.provider).toBe('local-ollama');
    expect(result.provenance.model).toBe('qwen3:8b');
    expect(result.provenance.selection).toMatchObject({ providerId: 'local-ollama', costClass: 'LOCAL_NO_PROVIDER_FEE' });
    expect(result.provenance.fallbackReason).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('falls back to paid only after a selected local runtime fails and records why', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith('/api/chat')) throw Object.assign(new Error('local refused connection'), { code: 'ECONNREFUSED' });
      return fakeResponse(openAiPayload(validOutput, 'resp_paid_fallback'));
    });
    const runner = createOpenAiQuickScanChiefRunner({
      env: {
        QUICKSCAN_LOCAL_ENABLED: 'true',
        QUICKSCAN_LOCAL_QUALITY_VERIFIED: 'true',
        QUICKSCAN_LOCAL_COMMERCIAL_RIGHTS: 'verified',
        QUICKSCAN_LOCAL_LICENSE_EVIDENCE: 'license-reviewed',
        QUICKSCAN_LOCAL_BASE_URL: 'http://127.0.0.1:11434',
        QUICKSCAN_LOCAL_MODEL: 'qwen3:8b',
        OPENAI_API_KEY: 'sk-test',
      },
      fetchFn,
    });

    const result = await runner(promptInput());

    expect(result.provenance).toMatchObject({
      provider: 'openai',
      responseId: 'resp_paid_fallback',
      fallbackReason: 'LOCAL_CHIEF_REQUEST_FAILED',
      selection: { providerId: 'openai', costClass: 'PAID' },
    });
    expect(result.provenance.decisionTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: 'local-ollama', eligible: false, reasons: expect.arrayContaining(['transport']) }),
      expect.objectContaining({ providerId: 'openai', eligible: true }),
    ]));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('falls back to the deterministic kernel when the only local runtime is unavailable', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('local offline'); });
    const runner = createOpenAiQuickScanChiefRunner({
      env: {
        QUICKSCAN_LOCAL_ENABLED: 'true',
        QUICKSCAN_LOCAL_QUALITY_VERIFIED: 'true',
        QUICKSCAN_LOCAL_COMMERCIAL_RIGHTS: 'verified',
        QUICKSCAN_LOCAL_LICENSE_EVIDENCE: 'license-reviewed',
        QUICKSCAN_LOCAL_BASE_URL: 'http://127.0.0.1:11434',
        QUICKSCAN_LOCAL_MODEL: 'qwen3:8b',
      },
      fetchFn,
    });

    const result = await runner(promptInput());

    expect(result.provenance).toMatchObject({
      provider: 'deterministic-kernel',
      fallbackReason: 'LOCAL_CHIEF_REQUEST_FAILED',
    });
    expect(result.recommendation.nextAction).toBe('capture_more_evidence');
  });

  it('does not select local just because it is free when quality proof is missing', async () => {
    const fetchFn = vi.fn(async () => fakeResponse(openAiPayload(validOutput)));
    const runner = createOpenAiQuickScanChiefRunner({
      env: {
        QUICKSCAN_LOCAL_ENABLED: 'true',
        QUICKSCAN_LOCAL_COMMERCIAL_RIGHTS: 'verified',
        QUICKSCAN_LOCAL_BASE_URL: 'http://127.0.0.1:11434',
        QUICKSCAN_LOCAL_MODEL: 'qwen3:8b',
        OPENAI_API_KEY: 'sk-test',
      },
      fetchFn,
    });

    const result = await runner(promptInput());

    expect(result.provenance.provider).toBe('openai');
    expect(result.provenance.decisionTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: 'local-ollama', eligible: false, reasons: expect.arrayContaining(['quality']) }),
    ]));
  });

  it('uses the configured model override in the request body', async () => {
    const observedRequestBody: { current?: Record<string, unknown> } = {};
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      observedRequestBody.current = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return fakeResponse(openAiPayload({
        summary: 'Not enough evidence yet.',
        next_action: 'capture_more_evidence',
        message_draft: null,
      }));
    });
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test', QUICKSCAN_CHIEF_MODEL: 'gpt-5-nano' }, fetchFn });
    const result = await runner(promptInput());

    expect(result.provenance.model).toBe('gpt-5-nano');
    expect(observedRequestBody.current?.model).toBe('gpt-5-nano');
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

  it('degrades to deterministic mode when OpenAI is unavailable', async () => {
    const fetchFn = vi.fn(async () => fakeResponse({ error: { message: 'rate limited' } }, { status: 429 }));
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    const result = await runner(promptInput());

    expect(result.provenance).toMatchObject({ provider: 'deterministic-kernel', fallbackReason: 'OPENAI_HTTP_ERROR' });
    expect(result.recommendation.nextAction).toBe('capture_more_evidence');
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
    await expect(runner(promptInput())).rejects.toMatchObject({ code: 'CHIEF_RESPONSE_TOO_LARGE' });
  });

  it('degrades to deterministic mode when the provider request times out', async () => {
    const fetchFn = vi.fn(async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      throw abortError;
    });
    const runner = createOpenAiQuickScanChiefRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn });
    const result = await runner(promptInput());
    expect(result.provenance).toMatchObject({ provider: 'deterministic-kernel', fallbackReason: 'OPENAI_TIMEOUT' });
  });

  it('exposes QuickScanChiefProviderError as the error class for invalid provider output', async () => {
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

  it('degrades to deterministic mode when an abort fires while reading the response body', async () => {
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
    const result = await runner(promptInput());
    expect(result.provenance).toMatchObject({ provider: 'deterministic-kernel', fallbackReason: 'OPENAI_TIMEOUT' });
  });
});
