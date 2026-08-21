import { describe, expect, it } from 'vitest';
import {
  createProductionTruthLease,
  evaluateProductionTruthLeaseAtUse,
  observeProductionTruthEvidence,
  type ProductionTruthEvidence,
} from '../productionTruthLease.js';
import { evaluateTruthLeaseAtUse } from '../../lib/truthLease.js';

const HEAD = 'a'.repeat(40);
const HASH = 'b'.repeat(64);
const VERIFIED_AT = '2026-08-21T04:00:00.000Z';
const OBSERVED_AT = '2026-08-21T04:05:00.000Z';
const NOW = '2026-08-21T04:06:00.000Z';

function evidence(): ProductionTruthEvidence {
  return {
    repository: { sha: HEAD },
    cloudflare: {
      workerSha: HEAD,
      pagesSha: HEAD,
      routesDigest: HASH,
    },
    supabase: {
      projectRef: 'oojzfmmywbvficgybaxd',
      migrationHead: '20260821040000',
      advisorDigest: 'c'.repeat(64),
    },
    playwright: {
      testedSha: HEAD,
      runtimeSha: HEAD,
      artifactDigest: 'd'.repeat(64),
    },
    review: {
      exactHeadSha: HEAD,
      receiptDigest: 'e'.repeat(64),
    },
  };
}

function bundle() {
  return createProductionTruthLease({
    evidence: evidence(),
    verifiedAt: VERIFIED_AT,
    validUntil: '2026-08-21T04:30:00.000Z',
  });
}

describe('production truth lease', () => {
  it('allows a consequential use only when every production fact still matches', () => {
    const evaluation = evaluateProductionTruthLeaseAtUse({
      bundle: bundle(),
      evidence: evidence(),
      observedAt: OBSERVED_AT,
      useBoundary: 'deploy',
      now: NOW,
    });

    expect(evaluation.state).toBe('current');
    expect(evaluation.mayUseClaim).toBe(true);
  });

  it('rejects construction when Cloudflare or Playwright do not prove the exact repository head', () => {
    const drifted = evidence();
    drifted.cloudflare.workerSha = 'f'.repeat(40);
    expect(() => createProductionTruthLease({
      evidence: drifted,
      verifiedAt: VERIFIED_AT,
      validUntil: '2026-08-21T04:30:00.000Z',
    })).toThrow('Cloudflare runtime identity must match repository SHA');

    const wrongBrowser = evidence();
    wrongBrowser.playwright.runtimeSha = 'f'.repeat(40);
    expect(() => createProductionTruthLease({
      evidence: wrongBrowser,
      verifiedAt: VERIFIED_AT,
      validUntil: '2026-08-21T04:30:00.000Z',
    })).toThrow('Playwright must prove the exact repository/runtime SHA');
  });

  it('invalidates the lease when Supabase production state changes', () => {
    const changed = evidence();
    changed.supabase.migrationHead = '20260821040100';

    const evaluation = evaluateProductionTruthLeaseAtUse({
      bundle: bundle(),
      evidence: changed,
      observedAt: OBSERVED_AT,
      useBoundary: 'publish',
      now: NOW,
    });

    expect(evaluation.state).toBe('invalidated');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.reasons.join(' ')).toContain('supabase:production-state');
  });

  it('fails closed when a mandatory provider observation is missing', () => {
    const currentBundle = bundle();
    const observations = observeProductionTruthEvidence(evidence(), OBSERVED_AT)
      .filter((observation) => observation.key !== 'cloudflare:production-runtime');

    const evaluation = evaluateTruthLeaseAtUse({
      lease: currentBundle.lease,
      observations,
      useBoundary: 'completion-claim',
      now: NOW,
    });

    expect(evaluation.state).toBe('unknown');
    expect(evaluation.mayUseClaim).toBe(false);
    expect(evaluation.reasons.join(' ')).toContain('cloudflare:production-runtime has no at-use observation');
  });

  it('fails closed when at-use evidence is stale', () => {
    const evaluation = evaluateProductionTruthLeaseAtUse({
      bundle: bundle(),
      evidence: evidence(),
      observedAt: '2026-08-21T04:00:01.000Z',
      useBoundary: 'completion-claim',
      now: '2026-08-21T04:20:02.000Z',
    });

    expect(evaluation.state).toBe('stale');
    expect(evaluation.mayUseClaim).toBe(false);
  });

  it('binds independent review to the exact head', () => {
    const drifted = evidence();
    drifted.review.exactHeadSha = 'f'.repeat(40);

    expect(() => createProductionTruthLease({
      evidence: drifted,
      verifiedAt: VERIFIED_AT,
      validUntil: '2026-08-21T04:30:00.000Z',
    })).toThrow('review receipt must bind the exact repository SHA');
  });
});
