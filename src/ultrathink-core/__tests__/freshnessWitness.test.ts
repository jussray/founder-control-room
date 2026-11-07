import { describe, expect, it } from 'vitest';
import {
  evaluateFreshnessWitness,
  type FreshnessWitness,
} from '../freshnessWitness.js';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const ZERO_SHA = '0000000000000000000000000000000000000000';

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
  repository: 'jussray/example',
  currentMainSha: SHA_A,
  observedAt: '2026-08-23T13:00:00.000Z',
  expiresAt: '2026-08-23T13:05:00.000Z',
};

const evaluatedAt = '2026-08-23T13:01:00.000Z';

describe('evaluateFreshnessWitness', () => {
  it('marks bounded verified evidence valid only against fresh current main', () => {
    expect(evaluateFreshnessWitness(witness, observation, evaluatedAt)).toEqual({
      status: 'VALID', current: true, reasons: [],
    });
  });

  it('blocks when freshly observed main differs from the witnessed identity', () => {
    expect(evaluateFreshnessWitness(witness, { ...observation, currentMainSha: SHA_B }, evaluatedAt)).toEqual({
      status: 'BLOCKED', current: false, reasons: ['sha_drift'],
    });
  });

  it('blocks observations captured for another repository even when the sha matches', () => {
    expect(evaluateFreshnessWitness(witness, { ...observation, repository: 'jussray/fork' }, evaluatedAt)).toEqual({
      status: 'BLOCKED', current: false, reasons: ['repository_drift'],
    });
  });

  it('rejects Git zero sentinel as expected main identity', () => {
    expect(evaluateFreshnessWitness(
      { ...witness, expectedMainSha: ZERO_SHA },
      { ...observation, currentMainSha: ZERO_SHA },
      evaluatedAt,
    )).toEqual({
      status: 'BLOCKED', current: false, reasons: ['invalid_expected_sha', 'invalid_current_sha'],
    });
  });

  it('rejects Git zero sentinel as current main identity', () => {
    expect(evaluateFreshnessWitness(
      witness,
      { ...observation, currentMainSha: ZERO_SHA },
      evaluatedAt,
    )).toEqual({
      status: 'BLOCKED', current: false, reasons: ['invalid_current_sha'],
    });
  });

  it('rejects replayed observations after their own bounded lifetime', () => {
    expect(evaluateFreshnessWitness(witness, observation, '2026-08-23T13:05:00.000Z')).toEqual({
      status: 'STALE', current: false, reasons: ['stale_observation'],
    });
  });

  it('requires evidence to be resolved as verified', () => {
    expect(evaluateFreshnessWitness(
      { ...witness, evidenceRefs: [{ id: 'proof-1', verified: false }] },
      observation,
      evaluatedAt,
    )).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['unverified_evidence'],
    });
  });

  it('requires an explicit bounded witness lifetime', () => {
    expect(evaluateFreshnessWitness({ ...witness, expiresAt: undefined }, observation, evaluatedAt)).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['missing_expiry'],
    });
  });

  it('requires an explicit bounded observation lifetime', () => {
    expect(evaluateFreshnessWitness(witness, { ...observation, expiresAt: undefined }, evaluatedAt)).toEqual({
      status: 'BLOCKED', current: false, reasons: ['missing_observation_expiry'],
    });
  });

  it('rejects malformed repository identities', () => {
    expect(evaluateFreshnessWitness(
      { ...witness, expectedMainSha: 'sha-a' },
      { ...observation, currentMainSha: 'sha-a' },
      evaluatedAt,
    )).toEqual({
      status: 'BLOCKED', current: false, reasons: ['invalid_expected_sha', 'invalid_current_sha'],
    });
  });

  it('rejects normalized impossible calendar dates', () => {
    expect(evaluateFreshnessWitness(
      { ...witness, expiresAt: '2026-02-30T00:00:00.000Z' },
      observation,
      evaluatedAt,
    )).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['invalid_expiry'],
    });
  });

  it('marks matching evidence stale after witness expiry using evaluation time', () => {
    expect(evaluateFreshnessWitness(
      witness,
      { ...observation, expiresAt: '2026-08-23T14:05:00.000Z' },
      '2026-08-23T14:00:00.000Z',
    )).toEqual({
      status: 'STALE', current: false, reasons: ['expired'],
    });
  });

  it('does not trust verification timestamps from the future', () => {
    expect(evaluateFreshnessWitness(
      { ...witness, verifiedAt: '2026-08-23T13:30:00.000Z' },
      observation,
      evaluatedAt,
    )).toEqual({
      status: 'NOT_EVALUATED', current: false, reasons: ['verification_from_future'],
    });
  });
});
