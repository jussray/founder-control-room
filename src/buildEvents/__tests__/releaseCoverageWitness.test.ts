import { describe, expect, it } from 'vitest';
import {
  assessIndependentCoverageWitness,
  coverageWitnessDigest,
  type IndependentCoverageWitnessBinding,
  type IndependentDeploymentObservation,
} from '../releaseCoverageWitness.js';
import type { BuildEvent } from '../buildEvent.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const NOW_MS = Date.parse('2026-08-20T16:00:00.000Z');
const WITNESS_BINDING: IndependentCoverageWitnessBinding = {
  provider: 'cloudflare',
  resourceType: 'worker-deployment',
  resourceId: 'sekret-bip-production',
  eventType: 'deployment.completed',
};
const COVERAGE: NonNullable<BuildEvent['coverage']> = {
  service: 'sekret-bip-production',
  environment: 'production',
  releaseSha: SHA,
  windowStartedAt: '2026-08-20T15:30:00.000Z',
  windowEndedAt: '2026-08-20T15:45:00.000Z',
  sampleSource: 'analytics-engine',
  requestCount: 25,
  currentReleaseRequestCount: 24,
  priorReleaseRequestCount: 1,
  unclassifiedRequestCount: 0,
  routeClasses: [{
    name: 'front-door',
    requestCount: 25,
    currentReleaseRequestCount: 24,
    priorReleaseRequestCount: 1,
    unclassifiedRequestCount: 0,
  }],
  tailReasons: ['cached-edge-response'],
};

function observation(
  overrides: Partial<IndependentDeploymentObservation> = {},
): IndependentDeploymentObservation {
  return {
    sourceEventId: 'provider-event-1',
    providerEventProcessed: true,
    providerEventType: WITNESS_BINDING.eventType,
    providerEventResourceType: WITNESS_BINDING.resourceType,
    providerEventResourceId: WITNESS_BINDING.resourceId,
    resourceType: WITNESS_BINDING.resourceType,
    resourceId: WITNESS_BINDING.resourceId,
    environment: 'production',
    commitSha: SHA,
    observedAt: '2026-08-20T15:55:00.000Z',
    deploymentCompletedAt: '2026-08-20T15:25:00.000Z',
    coverageDigest: coverageWitnessDigest(COVERAGE),
    status: 'success',
    ...overrides,
  };
}

function assess(
  observations: readonly IndependentDeploymentObservation[],
  currentMainSha = SHA,
  maximumWitnessAgeSeconds = 15 * 60,
) {
  return assessIndependentCoverageWitness({
    expectedReleaseSha: SHA,
    currentMainSha,
    maximumWitnessAgeSeconds,
    nowMs: NOW_MS,
    coverageWindowStartedAt: COVERAGE.windowStartedAt,
    coverageWindowEndedAt: COVERAGE.windowEndedAt,
    expectedCoverageDigest: coverageWitnessDigest(COVERAGE),
    providerWitness: WITNESS_BINDING,
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
    expect(assess(
      [observation({ observedAt: '2026-08-20T15:45:00.000Z' })],
      SHA,
      14 * 60,
    )).toEqual({
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

  it('rejects another Cloudflare resource even when it is healthy at the expected SHA', () => {
    expect(assess([observation({
      resourceId: 'another-production-worker',
      providerEventResourceId: 'another-production-worker',
    })])).toEqual({
      status: 'missing',
      code: 'coverage_witness_cloudflare_observation_missing',
    });
  });

  it('requires the provider-owned deployment completion to predate the claimed coverage window', () => {
    expect(assess([observation({
      deploymentCompletedAt: '2026-08-20T15:31:00.000Z',
    })])).toEqual({
      status: 'mismatch',
      code: 'coverage_witness_deployment_after_coverage_window',
    });
  });

  it('requires an independently written aggregate digest observed after the coverage window', () => {
    expect(assess([observation({ coverageDigest: 'b'.repeat(64) })])).toEqual({
      status: 'mismatch',
      code: 'coverage_witness_independent_aggregate_mismatch',
    });
    expect(assess(
      [observation({ observedAt: '2026-08-20T15:44:59.999Z' })],
      SHA,
      20 * 60,
    )).toEqual({
      status: 'stale',
      code: 'coverage_witness_coverage_observation_precedes_window',
    });
  });
});
