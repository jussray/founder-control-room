import { describe, expect, it, vi } from 'vitest';
import { OPERATOR_RELAY_INSTRUCTOR, OPERATOR_RELAY_PEERS } from '../operatorRelayConstants.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

describe('DeepSeek instructor-only boundary', () => {
  it('keeps DeepSeek out of the peer registry and peer provider adapters', () => {
    const adapters = createServerOperatorRelayAdapters({
      DEEPSEEK_API_KEY: 'fixture-deepseek-key',
      FCR_RELAY_DEEPSEEK_MODEL: 'deepseek-flash',
    }, vi.fn() as unknown as typeof fetch);

    expect(OPERATOR_RELAY_PEERS).not.toContain('deepseek' as never);
    expect(OPERATOR_RELAY_PEERS).not.toContain(OPERATOR_RELAY_INSTRUCTOR as never);
    expect(Object.prototype.hasOwnProperty.call(adapters, 'deepseek')).toBe(false);
  });
});
