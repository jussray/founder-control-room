import { describe, expect, it } from 'vitest';
import {
  assessIndependentCoverageWitness,
  type IndependentDeploymentObservation,
} from '../releaseCoverageWitness.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const NOW_MS = Date.parse('2026-08-20T16:00:00.000Z');

function observation(
  overrides: Partial<IndependentDeploymentObservation> = {},
): IndependentDeploymentObservation {
  return {
    sourceEventId: 'provider-event-1',
    providerEventProcessed: true,
    environment: 'production',
    commitSha: SHA,
    observedAt: '2026-08-20T15:55:00.000Z',
    status: 'success',
    ...overrides,
  };
}

function assess(observations: readonly IndependentDeploymentObservation[], currentMainSha = SHA) {
  return assessIndependentCoverageWitness({
    expectedReleaseSha: SHA,
    currentMainSha,
    maximumWitnessAgeSeconds: 15 * 60,
    nowMs: NOW_MS,
    observations,
  });
}

describe('independent passed coverage witness', () => {
  it('accepts only a fresh, processed Cloudflare production observation at current main', () => {
    expect(assess([observation()])).toEqual({
      status: 'verified',
      currentMainSha: SHA,
      deploymentSha: SHA,
      observedAt: '2026-08-20T15:55:00.000Z',
    });
  });

  it('rejects provider-main SHA drift before a signed receipt can become passed coverage', () => {
    expect(assess([observation()], OTHER_SHA)).toEqual({
      status: 'mismatch',
      code: 'coverage_witness_current_main_mismatch',
    });
  });

  it('rejects stale, self-witnessing, and deployment-SHA-mismatched evidence', () => {
    expect(assess([observation({ observedAt: '2026-08-20T15:44:59.999Z' })])).toEqual({
      status: 'stale',
      code: 'coverage_witness_cloudflare_observation_stale',
    });
    expect(assess([observation({ sourceEventId: null, providerEventProcessed: false })])).toEqual({
      status: 'missing',
      code: 'coverage_witness_cloudflare_observation_missing',
    });
    expect(assess([observation({ commitSha: OTHER_SHA })])).toEqual({
      status: 'mismatch',
      code: 'coverage_witness_deployment_sha_mismatch',
    });
  });

  it('lets a newer independent Cloudflare failure invalidate an older passing observation', () => {
    expect(assess([
      observation(),
      observation({
        observedAt: '2026-08-20T15:59:00.000Z',
        status: 'failed',
      }),
    ])).toEqual({
      status: 'stale',
      code: 'coverage_witness_newer_cloudflare_failure',
    });
  });
});
