import { describe, expect, it } from 'vitest';
import { createOperatorRelayAdapters } from '../operatorRelayAdapters.js';

describe('createOperatorRelayAdapters', () => {
  it('does not invent provider fallbacks', () => {
    const claude = async () => { throw new Error('not invoked'); };
    const adapters = createOperatorRelayAdapters({ 'claude-code': claude });
    expect(adapters['claude-code']).toBe(claude);
    expect(adapters.perplexity).toBeUndefined();
    expect(adapters.codex).toBeUndefined();
  });
});
