import { describe, expect, it } from 'vitest';
import { classifyOperatorRelayTruth } from '../operatorRelayTruth.js';

describe('classifyOperatorRelayTruth', () => {
  it('does not call packet-only work verified', () => {
    expect(classifyOperatorRelayTruth({
      contractTests: true,
      authenticatedRoute: false,
      realProviderDispatch: false,
      boundProviderReceipt: false,
      playwrightRoundTrip: false,
    })).toBe('PARTIAL');
  });

  it('requires browser and provider outcome proof', () => {
    expect(classifyOperatorRelayTruth({
      contractTests: true,
      authenticatedRoute: true,
      realProviderDispatch: true,
      boundProviderReceipt: true,
      playwrightRoundTrip: true,
    })).toBe('VERIFIED');
  });
});
