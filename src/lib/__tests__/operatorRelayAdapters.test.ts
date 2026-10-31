import { describe, expect, it } from 'vitest';
import { createOperatorRelayAdapters } from '../operatorRelayAdapters.js';

describe('createOperatorRelayAdapters', () => {
  it('preserves every configured peer adapter without inventing fallbacks', () => {
    const gemini = async () => { throw new Error('not invoked'); };
    const codex = async () => { throw new Error('not invoked'); };
    const claude = async () => { throw new Error('not invoked'); };
    const perplexity = async () => { throw new Error('not invoked'); };
    const muse = async () => { throw new Error('not invoked'); };

    const adapters = createOperatorRelayAdapters({
      gemini,
      codex,
      'claude-code': claude,
      perplexity,
      muse,
    });

    expect(adapters.gemini).toBe(gemini);
    expect(adapters.codex).toBe(codex);
    expect(adapters['claude-code']).toBe(claude);
    expect(adapters.perplexity).toBe(perplexity);
    expect(adapters.muse).toBe(muse);
  });

  it('does not invent provider fallbacks', () => {
    const claude = async () => { throw new Error('not invoked'); };
    const adapters = createOperatorRelayAdapters({ 'claude-code': claude });
    expect(adapters['claude-code']).toBe(claude);
    expect(adapters.gemini).toBeUndefined();
    expect(adapters.perplexity).toBeUndefined();
    expect(adapters.codex).toBeUndefined();
    expect(adapters.muse).toBeUndefined();
  });
});
