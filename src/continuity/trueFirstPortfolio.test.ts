import { describe, expect, it } from 'vitest';
import { buildTrueFirstBaseline, evaluateTruthChallenge } from './trueFirstPortfolio.js';

const project = {
  slug: 'founder-control-room',
  name: 'Founder Control Room',
  repository: 'jussray/founder-control-room',
  status: 'active' as const,
  capabilities: ['portfolio-operations'] as const,
};

const HEAD = 'b1df38342829b48f53de00b9414e3ebbbb12808b';
const NEXT_HEAD = 'c1df38342829b48f53de00b9414e3ebbbb12808b';
const OBSERVED_AT = '2026-09-24T02:40:00.000Z';
const WINDOW = 60 * 60 * 1000;

function baseline() {
  return buildTrueFirstBaseline({
    project,
    branch: 'main',
    headSha: HEAD,
    scope: 'portfolio truth baseline',
    observedAt: OBSERVED_AT,
    freshnessWindowMs: WINDOW,
    claims: [
      {
        claimId: 'main-head-bound',
        statement: 'The inspected state is bound to the exact main head.',
        value: 'TRUE',
        state: 'VERIFIED',
        evidenceRefs: ['github:branches/main', 'github:commit:b1df3834'],
      },
    ],
  });
}

describe('true-first portfolio continuity', () => {
  it('mints a deterministic baseline fingerprint independent of input ordering', () => {
    const first = buildTrueFirstBaseline({
      project,
      branch: 'main',
      headSha: HEAD.toUpperCase(),
      scope: 'portfolio truth baseline',
      observedAt: OBSERVED_AT,
      freshnessWindowMs: WINDOW,
      claims: [
        {
          claimId: 'b',
          statement: 'Second fact',
          value: 'TRUE',
          state: 'VERIFIED',
          evidenceRefs: ['ref:z', 'ref:a'],
        },
        {
          claimId: 'a',
          statement: 'First fact',
          value: 'TRUE',
          state: 'VERIFIED',
          evidenceRefs: ['ref:1'],
        },
      ],
    });

    const second = buildTrueFirstBaseline({
      project,
      branch: 'main',
      headSha: HEAD,
      scope: 'portfolio truth baseline',
      observedAt: OBSERVED_AT,
      freshnessWindowMs: WINDOW,
      claims: [
        {
          claimId: 'a',
          statement: 'First fact',
          value: 'TRUE',
          state: 'VERIFIED',
          evidenceRefs: ['ref:1'],
        },
        {
          claimId: 'b',
          statement: 'Second fact',
          value: 'TRUE',
          state: 'VERIFIED',
          evidenceRefs: ['ref:a', 'ref:z'],
        },
      ],
    });

    expect(first.baselineFingerprint).toBe(second.baselineFingerprint);
    expect(first.proofCookie.cookieId).toBe(second.proofCookie.cookieId);
  });

  it('keeps inferred, false, unknown, and evidence-free claims out of the TRUE baseline', () => {
    const result = buildTrueFirstBaseline({
      project,
      branch: 'main',
      headSha: HEAD,
      scope: 'filter truth',
      observedAt: OBSERVED_AT,
      freshnessWindowMs: WINDOW,
      claims: [
        { claimId: 'verified-true', statement: 'Verified true', value: 'TRUE', state: 'VERIFIED', evidenceRefs: ['ref:1'] },
        { claimId: 'inferred-true', statement: 'Inferred true', value: 'TRUE', state: 'INFERRED', evidenceRefs: ['ref:2'] },
        { claimId: 'verified-false', statement: 'Verified false', value: 'FALSE', state: 'VERIFIED', evidenceRefs: ['ref:3'] },
        { claimId: 'unknown', statement: 'Unknown', value: 'UNKNOWN', state: 'UNKNOWN', evidenceRefs: ['ref:4'] },
        { claimId: 'no-proof', statement: 'No proof', value: 'TRUE', state: 'VERIFIED', evidenceRefs: [] },
      ],
    });

    expect(result.verifiedTrueClaims.map((claim) => claim.claimId)).toEqual(['verified-true']);
    expect(result.rejectedClaims).toHaveLength(4);
    expect(result.status).toBe('ESTABLISHED');
    expect(result.authority).toBe('EVIDENCE_ONLY');
    expect(result.browserCookieStored).toBe(false);
  });

  it('classifies verified false evidence as a contradiction only on the exact live subject', () => {
    const current = baseline();
    const result = evaluateTruthChallenge(current, {
      repository: project.repository,
      branch: 'main',
      headSha: HEAD,
      claimId: 'main-head-bound',
      value: 'FALSE',
      state: 'VERIFIED',
      evidenceRefs: ['github:independent-readback'],
      observedAt: '2026-09-24T02:45:00.000Z',
    }, new Date('2026-09-24T02:45:01.000Z'));

    expect(result.verdict).toBe('VERIFIED_CONTRADICTION');
  });

  it('marks the prior baseline stale instead of calling a moved head false', () => {
    const current = baseline();
    const result = evaluateTruthChallenge(current, {
      repository: project.repository,
      branch: 'main',
      headSha: NEXT_HEAD,
      claimId: 'main-head-bound',
      value: 'FALSE',
      state: 'VERIFIED',
      evidenceRefs: ['github:new-head'],
      observedAt: '2026-09-24T02:45:00.000Z',
    }, new Date('2026-09-24T02:45:01.000Z'));

    expect(result.verdict).toBe('BASELINE_STALE');
    expect(result.reason).toContain('Rebuild the TRUE baseline first');
  });

  it('links successor proof cookies without transferring authority', () => {
    const first = baseline();
    const successor = buildTrueFirstBaseline({
      project,
      branch: 'main',
      headSha: HEAD,
      scope: 'successor continuity',
      observedAt: '2026-09-24T02:50:00.000Z',
      freshnessWindowMs: WINDOW,
      predecessorCookieId: first.proofCookie.cookieId,
      claims: [{
        claimId: 'main-head-bound',
        statement: 'The inspected state is bound to the exact main head.',
        value: 'TRUE',
        state: 'VERIFIED',
        evidenceRefs: ['github:branches/main'],
      }],
    });

    expect(successor.proofCookie.parentCookieId).toBe(first.proofCookie.cookieId);
    expect(successor.authority).toBe('EVIDENCE_ONLY');
  });
});
