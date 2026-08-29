import { describe, expect, it } from 'vitest';
import {
  assertReasoningStateStillCurrent,
  ReasoningStateChangedError,
} from '../reasoningStateRevalidation.js';

type State = {
  lifecycle: string;
  evidenceIds: string[];
  note?: string;
};

function fingerprint(state: State): string {
  return JSON.stringify({
    lifecycle: state.lifecycle,
    evidenceIds: state.evidenceIds,
  });
}

describe('assertReasoningStateStillCurrent', () => {
  it('accepts a result when the reasoner-bound state is unchanged', () => {
    const before: State = { lifecycle: 'qualified', evidenceIds: ['e1'], note: 'before' };
    const after: State = { lifecycle: 'qualified', evidenceIds: ['e1'], note: 'after' };

    expect(assertReasoningStateStillCurrent({ before, after, fingerprint, label: 'prospect' }))
      .toBe(fingerprint(after));
  });

  it('fails closed when a reasoner-bound field changes', () => {
    const before: State = { lifecycle: 'qualified', evidenceIds: ['e1'] };
    const after: State = { lifecycle: 'paid', evidenceIds: ['e1'] };

    expect(() => assertReasoningStateStillCurrent({ before, after, fingerprint, label: 'prospect' }))
      .toThrow(ReasoningStateChangedError);
  });

  it('does not treat unrelated state as stale when the caller intentionally excludes it from the fingerprint', () => {
    const before: State = { lifecycle: 'qualified', evidenceIds: ['e1'], note: 'old UI note' };
    const after: State = { lifecycle: 'qualified', evidenceIds: ['e1'], note: 'new UI note' };

    expect(() => assertReasoningStateStillCurrent({ before, after, fingerprint }))
      .not.toThrow();
  });

  it('preserves both fingerprints on the stale-state error for bounded diagnostics', () => {
    const before: State = { lifecycle: 'qualified', evidenceIds: ['e1'] };
    const after: State = { lifecycle: 'qualified', evidenceIds: ['e1', 'e2'] };

    try {
      assertReasoningStateStillCurrent({ before, after, fingerprint, label: 'prospect' });
      throw new Error('expected revalidation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ReasoningStateChangedError);
      const stale = error as ReasoningStateChangedError;
      expect(stale.code).toBe('REASONING_STATE_CHANGED');
      expect(stale.beforeFingerprint).toBe(fingerprint(before));
      expect(stale.afterFingerprint).toBe(fingerprint(after));
    }
  });

  it('fails closed when a fingerprint function returns an empty identity', () => {
    const state: State = { lifecycle: 'qualified', evidenceIds: ['e1'] };
    expect(() => assertReasoningStateStillCurrent({ before: state, after: state, fingerprint: () => '' }))
      .toThrow('reasoning-state fingerprint must be a non-empty string');
  });
});
