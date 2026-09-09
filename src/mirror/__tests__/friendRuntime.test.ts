import { describe, expect, it, vi } from 'vitest';
import { createFriendRuntimeRunner } from '../friendRuntime.js';

const structuredOutput = {
  headline: 'Move the proof forward',
  summary: 'The founder wants one bounded step that improves the current build.',
  intent_tags: ['build'],
  move_kind: 'tiny_move',
  action_text: 'Run the focused proof and record the result.',
  rationale: 'One bounded proof reduces uncertainty.',
  time_estimate_minutes: 10,
  gate_warning: 'No external action is authorized.',
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Friend runtime providers', () => {
  it('keeps deterministic mode local and marks model execution not_used', async () => {
    const fetchFn = vi.fn();
    const run = createFriendRuntimeRunner({ env: {}, fetchFn: fetchFn as typeof fetch });

    const result = await run('deterministic', {
      transcript: 'I need one small build step today.',
      timeEnergyContext: 'Ten minutes.',
      voiceProfile: null,
    });

    expect(result.provenance).toMatchObject({
      provider: 'deterministic',
      providerStorageMode: 'local_only',
      webSearchUsed: false,
    });
    expect(result.modelExecutionState).toBe('not_used');
    expect(result.move.kind).toBe('tiny_move');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails closed when live Friend models are disabled', async () => {
    const run = createFriendRuntimeRunner({
      env: { OPENAI_API_KEY: 'test' },
      fetchFn: vi.fn() as typeof fetch,
    });

    await expect(run('openai', {
      transcript: 'Build.',
      timeEnergyContext: 'Ten minutes.',
      voiceProfile: null,
    })).rejects.toMatchObject({
      code: 'FRIEND_MODELS_DISABLED',
      executionState: 'blocked',
    });
  });

  it('uses OpenAI structured output with provider storage disabled for the request', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.text?.format?.type).toBe('json_schema');
      return jsonResponse({
        id: 'resp_openai',
        output_text: JSON.stringify(structuredOutput),
      });
    });

    const run = createFriendRuntimeRunner({
      env: {
        FRIEND_MODELS_ENABLED: 'true',
        FRIEND_RUNTIME_PROVIDERS: 'openai,anthropic,perplexity',
        OPENAI_API_KEY: 'test-openai',
        FRIEND_OPENAI_MODEL: 'test-openai-model',
      },
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await run('openai', {
      transcript: 'Move the build.',
      timeEnergyContext: 'Ten minutes.',
      voiceProfile: null,
    });

    expect(result.provenance).toMatchObject({
      provider: 'openai',
      model: 'test-openai-model',
      responseId: 'resp_openai',
      providerStorageMode: 'disabled_request',
      webSearchUsed: false,
    });
    expect(result.modelExecutionState).toBe('succeeded');
  });

  it('uses Anthropic Messages structured output without converting the model into authority', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/messages');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-api-key')).toBe('test-anthropic');
      const body = JSON.parse(String(init?.body));
      expect(body.output_config?.format?.type).toBe('json_schema');
      return jsonResponse({
        id: 'msg_anthropic',
        content: [{ type: 'text', text: JSON.stringify(structuredOutput) }],
      });
    });

    const run = createFriendRuntimeRunner({
      env: {
        FRIEND_MODELS_ENABLED: 'true',
        FRIEND_RUNTIME_PROVIDERS: 'anthropic',
        ANTHROPIC_API_KEY: 'test-anthropic',
        FRIEND_ANTHROPIC_MODEL: 'test-claude',
      },
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await run('anthropic', {
      transcript: 'Move the build.',
      timeEnergyContext: 'Ten minutes.',
      voiceProfile: 'Direct and short.',
    });

    expect(result.provenance).toMatchObject({
      provider: 'anthropic',
      model: 'test-claude',
      responseId: 'msg_anthropic',
      providerStorageMode: 'provider_default',
      webSearchUsed: false,
    });
    expect(result.modelExecutionState).toBe('succeeded');
  });

  it('forces Perplexity Friend runtime to run with web search disabled', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain('/v1/sonar');
      const body = JSON.parse(String(init?.body));
      expect(body.disable_search).toBe(true);
      expect(body.return_images).toBe(false);
      expect(body.return_related_questions).toBe(false);
      expect(body.response_format?.type).toBe('json_schema');
      return jsonResponse({
        id: 'sonar_perplexity',
        choices: [{
          message: {
            content: JSON.stringify(structuredOutput),
          },
        }],
      });
    });

    const run = createFriendRuntimeRunner({
      env: {
        FRIEND_MODELS_ENABLED: 'true',
        FRIEND_RUNTIME_PROVIDERS: 'perplexity',
        PERPLEXITY_API_KEY: 'test-perplexity',
        FRIEND_PERPLEXITY_MODEL: 'test-sonar',
      },
      fetchFn: fetchFn as typeof fetch,
    });

    const result = await run('perplexity', {
      transcript: 'Move the build.',
      timeEnergyContext: 'Ten minutes.',
      voiceProfile: null,
    });

    expect(result.provenance).toMatchObject({
      provider: 'perplexity',
      model: 'test-sonar',
      responseId: 'sonar_perplexity',
      webSearchUsed: false,
    });
    expect(result.modelExecutionState).toBe('succeeded');
  });
});
