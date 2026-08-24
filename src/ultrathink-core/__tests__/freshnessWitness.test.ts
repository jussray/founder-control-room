import { describe, expect, it } from 'vitest';
import {
  evaluateFreshnessWitness,
  type FreshnessWitness,
} from '../freshnessWitness.js';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const witness: FreshnessWitness = {
  id: 'freshness-1',
  subject: 'main-proof',
  repository: 'jussray/example',
  expectedMainSha: SHA_A,
  evidenceRefs: [{ id: 'proof-1', verified: true }],
  verifiedAt: '2026-08-23T12:00:00.000Z',
  expiresAt: '2026-08-23T14:00:00.000Z',
};

const observation = {
  currentMainSha: SHA_A,
  observedAt: '2026-08-23T13:00:00.000Z',
};

describe('evaluateFreshnessWitness', () => {
  it('marks bounded verified evidence valid only against fresh current main', () => {
    expect(evaluateFreshnessWitness(witness, observation)).toEqual({
      status: 'VALID', current: true, reasons: [],
    });
  });

  it('blocks when freshly observed main differs from the witnessed identity', () => {
    expect(evaluateFreshnessWitness(witness, { ...observation, currentMainSha: SHA_B })).toEqual({
      status: 'BLOCKED', current: false, reasons: ['sha_drift'],
    });
  });

  it('requires evidence to be resolved as verified', () => {
    expect(evaluateFreshnessWitness({ ...witness, evidenceRefs: [{ id: 'proof-1', verified: false }] }, observation)).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['unverified_evidence'],
    });
  });

  it('requires an explicit bounded lifetime', () => {
    expect(evaluateFreshnessWitness({ ...witness, expiresAt: undefined }, observation)).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['missing_expiry'],
    });
  });

  it('rejects malformed repository identities', () => {
    expect(evaluateFreshnessWitness({ ...witness, expectedMainSha: 'sha-a' }, { ...observation, currentMainSha: 'sha-a' })).toEqual({
      status: 'BLOCKED', current: false, reasons: ['invalid_expected_sha', 'invalid_current_sha'],
    });
  });

  it('rejects normalized impossible calendar dates', () => {
    expect(evaluateFreshnessWitness({ ...witness, expiresAt: '2026-02-30T00:00:00.000Z' }, observation)).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['invalid_expiry'],
    });
  });

  it('marks matching evidence stale after expiry', () => {
    expect(evaluateFreshnessWitness(witness, { ...observation, observedAt: '2026-08-23T14:00:00.000Z' })).toEqual({
      status: 'STALE', current: false, reasons: ['expired'],
    });
  });

  it('does not trust verification timestamps from the future', () => {
    expect(evaluateFreshnessWitness({ ...witness, verifiedAt: '2026-08-23T13:30:00.000Z' }, observation)).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['verification_from_future'],
    });
  });
});
