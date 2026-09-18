import { describe, expect, it } from 'vitest';
import { relayStopReason } from '../operatorRelayStop.js';

describe('relayStopReason', () => {
  it('stops only on proof or a concrete terminal boundary', () => {
    expect(relayStopReason({ verified: true, blocked: false, expired: false })).toBe('verified');
    expect(relayStopReason({ verified: false, blocked: true, expired: false })).toBe('blocked');
    expect(relayStopReason({ verified: false, blocked: false, expired: false })).toBe('continue');
  });
});
