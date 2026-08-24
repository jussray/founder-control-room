import { describe, expect, it } from 'vitest';
import {
  evaluateFreshnessWitness,
  type FreshnessWitness,
} from '../freshnessWitness.js';

const witness: FreshnessWitness = {
  id: 'freshness-1',
  subject: 'main-proof',
  repository: 'jussray/example',
  expectedMainSha: 'sha-a',
  observedMainSha: 'sha-a',
  evidenceRefs: ['proof-1'],
  verifiedAt: '2026-08-23T12:00:00.000Z',
  expiresAt: '2026-08-23T14:00:00.000Z',
};

describe('evaluateFreshnessWitness', () => {
  it('marks exact, evidenced repository state as valid', () => {
    expect(
      evaluateFreshnessWitness(witness, '2026-08-23T13:00:00.000Z'),
    ).toEqual({ status: 'VALID', current: true, reasons: [] });
  });

  it('marks evidence stale when current main no longer matches the expected sha', () => {
    expect(
      evaluateFreshnessWitness(
        { ...witness, observedMainSha: 'sha-b' },
        '2026-08-23T13:00:00.000Z',
      ),
    ).toEqual({ status: 'STALE', current: false, reasons: ['sha_drift'] });
  });

  it('does not evaluate a witness whose evidence references are empty or blank', () => {
    expect(
      evaluateFreshnessWitness(
        { ...witness, evidenceRefs: [' ', ''] },
        '2026-08-23T13:00:00.000Z',
      ),
    ).toEqual({
      status: 'NOT_EVALUATED',
      current: false,
      reasons: ['missing_evidence'],
    });
  });

  it('blocks when witness identity or repository comparison context is missing', () => {
    expect(
      evaluateFreshnessWitness(
        {
          ...witness,
          id: ' ',
          subject: '',
          repository: undefined,
          observedMainSha: undefined,
        },
        '2026-08-23T13:00:00.000Z',
      ),
    ).toEqual({
      status: 'BLOCKED',
      current: false,
      reasons: [
        'missing_id',
        'missing_subject',
        'missing_repository',
        'missing_observed_sha',
      ],
    });
  });

  it('does not trust verification timestamps from the future', () => {
    expect(
      evaluateFreshnessWitness(
        { ...witness, verifiedAt: '2026-08-23T13:30:00.000Z' },
        '2026-08-23T13:00:00.000Z',
      ),
    ).toEqual({
      status: 'NOT_EVALUATED',
      current: false,
      reasons: ['verification_from_future'],
    });
  });

  it('does not trust an expiry that predates verification', () => {
    expect(
      evaluateFreshnessWitness(
        { ...witness, expiresAt: '2026-08-23T11:59:59.000Z' },
        '2026-08-23T13:00:00.000Z',
      ),
    ).toEqual({
      status: 'NOT_EVALUATED',
      current: false,
      reasons: ['invalid_expiry'],
    });
  });

  it('marks otherwise matching evidence stale after its explicit expiry', () => {
    expect(
      evaluateFreshnessWitness(witness, '2026-08-23T14:00:00.000Z'),
    ).toEqual({ status: 'STALE', current: false, reasons: ['expired'] });
  });
});
