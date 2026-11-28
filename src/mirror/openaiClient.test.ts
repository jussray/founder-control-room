import { describe, expect, it, vi } from 'vitest';
import { createOpenAiMirrorRunner } from './openaiClient.js';
import type { MirrorRunInput } from './types.js';

const INPUT: MirrorRunInput = {
  transcript: 'PRIVATE_PROMPT_AND_SECRET_MARKER',
  relatedMemories: [],
  timeEnergyContext: 'A short test window.',
  recipientContext: null,
  voiceProfile: null,
};

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('createOpenAiMirrorRunner provider error boundary', () => {
  it('redacts provider response bodies and transport exception details', async () => {
    const privateMarker = 'PRIVATE_PROMPT_AND_SECRET_MARKER';
    const providerFailure = vi.fn<typeof fetch>(async () => fakeResponse({
      error: { message: privateMarker },
    }, 401));
    const providerRunner = createOpenAiMirrorRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn: providerFailure });

    await expect(providerRunner(INPUT)).rejects.toMatchObject({
      message: 'OpenAI request failed with status 401',
      code: 'OPENAI_HTTP_ERROR',
      status: 401,
    });

    const transportFailure = vi.fn<typeof fetch>(async () => {
      throw new Error(privateMarker);
    });
    const transportRunner = createOpenAiMirrorRunner({ env: { OPENAI_API_KEY: 'sk-test' }, fetchFn: transportFailure });

    await expect(transportRunner(INPUT)).rejects.toMatchObject({
      message: 'OpenAI Mirror Engine request failed',
      code: 'OPENAI_REQUEST_FAILED',
    });
  });
});
