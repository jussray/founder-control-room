import { describe, expect, it } from 'vitest';
import { createBuildEvent } from '../buildEvent.js';
import { buildCurrentTruthProjection } from '../currentTruth.js';

const OLD_SHA = 'a'.repeat(40);
const AUDITED_SHA = 'b'.repeat(40);
const MAIN_SHA = 'c'.repeat(40);
const INFERRED_SHA = 'd'.repeat(40);
const PROPOSAL_SHA = 'e'.repeat(40);
const FIXTURE_NOW_MS = Date.parse('2026-08-16T03:30:00Z');
const REPOSITORY = 'jussray/Sekret-Bip';

function evidence(id: string) {
  return [`test-evidence:${id}`];
}

function projection(
  events: ReturnType<typeof createBuildEvent>[],
  nowMs = FIXTURE_NOW_MS,
  currentMainRevalidation?: ReturnType<typeof liveMainRevalidation>,
) {
  return buildCurrentTruthProjection({
    projectSlug: 'sekret-bip',
    repository: REPOSITORY,
    events,
    nowMs,
    currentMainRevalidation,
  });
}

function liveMainRevalidation(commitSha: string, observedAt: string) {
  return {
    repository: REPOSITORY,
    branch: 'main',
    commitSha,
    provider: 'github' as const,
    observedAt,
  };
}

describe('current truth projection', () => {
  it('keeps observed main, audited source, runtime identity, and verification as separate facts', () => {
    const events = [
      createBuildEvent({
        eventId: 'github:old-main',
        occurredAt: '2026-08-16T01:00:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: OLD_SHA,
        },
        evidenceRefs: evidence('old-main'),
      }),
      createBuildEvent({
        eventId: 'system:audit',
        occurredAt: '2026-08-16T01:05:00Z',
        source: 'system',
        category: 'artifact',
        phase: 'verify',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: { name: 'jussray/Sekret-Bip', auditedCommitSha: AUDITED_SHA },
        evidenceRefs: evidence('audit'),
      }),
      createBuildEvent({
        eventId: 'github:new-main',
        occurredAt: '2026-08-16T01:10:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        evidenceRefs: evidence('new-main'),
      }),
      createBuildEvent({
        eventId: 'system:runtime-old',
        occurredAt: '2026-08-16T01:12:00Z',
        source: 'system',
        category: 'runtime',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: { name: 'jussray/Sekret-Bip', refKind: 'detached', commitSha: OLD_SHA },
        runtime: {
          service: 'sekret-backend',
          environment: 'production',
          releaseSha: OLD_SHA,
          versionId: 'version-1',
        },
        evidenceRefs: evidence('runtime'),
      }),
      createBuildEvent({
        eventId: 'github:ci-main',
        occurredAt: '2026-08-16T01:13:00Z',
        source: 'github',
        category: 'verification',
        phase: 'verify',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'detached',
          commitSha: MAIN_SHA,
        },
        verification: { kind: 'CI', status: 'passed', exactCommitSha: MAIN_SHA },
        evidenceRefs: evidence('ci'),
      }),
      createBuildEvent({
        eventId: 'chatgpt:inferred-main',
        occurredAt: '2026-08-16T01:14:00Z',
        source: 'chatgpt',
        category: 'source',
        phase: 'observe',
        truth: 'inferred',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: INFERRED_SHA,
        },
      }),
      createBuildEvent({
        eventId: 'github:proposal-main',
        occurredAt: '2026-08-16T01:15:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'running',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'proposal-head',
          commitSha: PROPOSAL_SHA,
        },
        evidenceRefs: evidence('proposal'),
      }),
    ];

    const snapshot = projection(events);

    expect(snapshot.source.currentMainSha).toBeNull();
    expect(snapshot.source.lastObservedMainSha?.value).toBe(MAIN_SHA);
    expect(snapshot.source.auditedSha?.value).toBe(AUDITED_SHA);
    expect(snapshot.runtimes['sekret-backend:production']?.value.releaseSha).toBe(OLD_SHA);
    expect(snapshot.verifications.CI?.value.exactCommitSha).toBe(MAIN_SHA);
    expect(snapshot.quality.staleCurrentFacts).toBe(0);
    expect(snapshot.quality.verifiedEvents).toBe(6);
    expect(snapshot.quality.inferredEvents).toBe(1);
  });


  it('keeps aggregate rollout coverage separate from binary runtime identity', () => {
    const events = [
      createBuildEvent({
        eventId: 'github:main-for-coverage',
        occurredAt: '2026-08-16T03:00:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        evidenceRefs: evidence('main-for-coverage'),
      }),
      createBuildEvent({
        eventId: 'cloudflare:current-rollout-coverage',
        occurredAt: '2026-08-16T03:10:00Z',
        source: 'cloudflare',
        category: 'analytics',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        coverage: {
          service: 'sekret-bip-production',
          environment: 'production',
          releaseSha: MAIN_SHA,
          windowStartedAt: '2026-08-16T02:50:00Z',
          windowEndedAt: '2026-08-16T03:05:00Z',
          sampleSource: 'analytics-engine',
          requestCount: 25,
          currentReleaseRequestCount: 25,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
          routeClasses: [{
            name: 'front-door',
            requestCount: 25,
            currentReleaseRequestCount: 25,
            priorReleaseRequestCount: 0,
            unclassifiedRequestCount: 0,
          }],
        },
        evidenceRefs: evidence('current-rollout-coverage'),
      }),
      createBuildEvent({
        eventId: 'cloudflare:old-rollout-coverage',
        occurredAt: '2026-08-16T03:20:00Z',
        source: 'cloudflare',
        category: 'analytics',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: OLD_SHA,
        },
        coverage: {
          service: 'sekret-bip-production',
          environment: 'production',
          releaseSha: OLD_SHA,
          windowStartedAt: '2026-08-16T03:00:00Z',
          windowEndedAt: '2026-08-16T03:15:00Z',
          sampleSource: 'analytics-engine',
          requestCount: 25,
          currentReleaseRequestCount: 25,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
          routeClasses: [{
            name: 'front-door',
            requestCount: 25,
            currentReleaseRequestCount: 25,
            priorReleaseRequestCount: 0,
            unclassifiedRequestCount: 0,
          }],
        },
        evidenceRefs: evidence('old-rollout-coverage'),
      }),
    ];

    const snapshot = projection(
      events,
      FIXTURE_NOW_MS,
      liveMainRevalidation(MAIN_SHA, '2026-08-16T03:25:00Z'),
    );

    expect(snapshot.runtimes).toEqual({});
    expect(snapshot.coverage['sekret-bip-production:production']?.value.releaseSha).toBe(MAIN_SHA);
    expect(snapshot.quality.staleCurrentFacts).toBe(0);
    expect(snapshot.quality.staleCoverageFacts).toBe(1);
  });

  it('does not render coverage current without a verified current-main fact', () => {
    const events = [
      createBuildEvent({
        eventId: 'cloudflare:unbound-rollout-coverage',
        occurredAt: '2026-08-16T03:20:00Z',
        source: 'cloudflare',
        category: 'analytics',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        coverage: {
          service: 'sekret-bip-production',
          environment: 'production',
          releaseSha: MAIN_SHA,
          windowStartedAt: '2026-08-16T03:00:00Z',
          windowEndedAt: '2026-08-16T03:15:00Z',
          sampleSource: 'analytics-engine',
          requestCount: 25,
          currentReleaseRequestCount: 25,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
          routeClasses: [{
            name: 'front-door',
            requestCount: 25,
            currentReleaseRequestCount: 25,
            priorReleaseRequestCount: 0,
            unclassifiedRequestCount: 0,
          }],
        },
        evidenceRefs: evidence('unbound-rollout-coverage'),
      }),
    ];

    const snapshot = projection(events);

    expect(snapshot.source.currentMainSha).toBeNull();
    expect(snapshot.coverage).toEqual({});
    expect(snapshot.quality.staleCoverageFacts).toBe(0);
    expect(snapshot.quality.unboundCoverageFacts).toBe(1);
  });

  it('leaves runtime truth absent when only source and provider facts exist', () => {
    const events = [
      createBuildEvent({
        eventId: 'github:main',
        occurredAt: '2026-08-16T02:00:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        evidenceRefs: evidence('main'),
      }),
      createBuildEvent({
        eventId: 'github:deployment',
        occurredAt: '2026-08-16T02:01:00Z',
        source: 'github',
        category: 'provider',
        phase: 'deploy',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: { name: 'jussray/Sekret-Bip', refKind: 'detached', commitSha: MAIN_SHA },
        provider: { name: 'github', resource: 'deployment:1', environment: 'production' },
        evidenceRefs: evidence('deployment'),
      }),
    ];

    const snapshot = projection(events);
    expect(snapshot.source.currentMainSha).toBeNull();
    expect(snapshot.source.lastObservedMainSha?.value).toBe(MAIN_SHA);
    expect(snapshot.runtimes).toEqual({});
    expect(snapshot.providers['github:deployment:1']).toBeDefined();
  });

  it('expires a completed coverage window instead of presenting it as a durable current green state', () => {
    const events = [
      createBuildEvent({
        eventId: 'github:main-for-expiring-coverage',
        occurredAt: '2026-08-16T03:00:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        evidenceRefs: evidence('main-for-expiring-coverage'),
      }),
      createBuildEvent({
        eventId: 'cloudflare:expiring-rollout-coverage',
        occurredAt: '2026-08-16T03:10:00Z',
        source: 'cloudflare',
        category: 'analytics',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: {
          name: 'jussray/Sekret-Bip',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        coverage: {
          service: 'sekret-bip-production',
          environment: 'production',
          releaseSha: MAIN_SHA,
          windowStartedAt: '2026-08-16T02:50:00Z',
          windowEndedAt: '2026-08-16T03:05:00Z',
          sampleSource: 'analytics-engine',
          requestCount: 25,
          currentReleaseRequestCount: 25,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
          routeClasses: [{
            name: 'front-door',
            requestCount: 25,
            currentReleaseRequestCount: 25,
            priorReleaseRequestCount: 0,
            unclassifiedRequestCount: 0,
          }],
        },
        evidenceRefs: evidence('expiring-rollout-coverage'),
      }),
    ];

    const snapshot = projection(
      events,
      Date.parse('2026-08-16T04:05:00Z'),
      liveMainRevalidation(MAIN_SHA, '2026-08-16T04:00:00Z'),
    );

    expect(snapshot.coverage).toEqual({});
    expect(snapshot.quality.expiredCoverageFacts).toBe(1);
  });

  it('requires an ephemeral live GitHub revalidation instead of trusting a stored canonical-shaped event', () => {
    const storedVerification = createBuildEvent({
      eventId: 'system:stored-canonical-shaped-main',
      occurredAt: '2026-08-16T03:29:00Z',
      source: 'system',
      category: 'verification',
      phase: 'verify',
      truth: 'verified',
      authority: 'observed',
      status: 'completed',
      repository: {
        name: REPOSITORY,
        branch: 'main',
        refKind: 'branch-head',
        commitSha: MAIN_SHA,
      },
      provider: { name: 'github', resource: 'main' },
      verification: {
        kind: 'canonical-main-revalidation@v1',
        status: 'completed',
        exactCommitSha: MAIN_SHA,
      },
      evidenceRefs: evidence('stored-canonical-shaped-main'),
    });

    const storedOnly = projection([storedVerification]);
    const exactLeaseBoundary = projection(
      [],
      FIXTURE_NOW_MS,
      liveMainRevalidation(MAIN_SHA, '2026-08-16T03:15:00Z'),
    );

    expect(storedOnly.source.currentMainSha).toBeNull();
    expect(exactLeaseBoundary.source.currentMainSha).toBeNull();
  });

  it('does not render legacy external runtime or verification assertions as current operational facts', () => {
    const events = [
      createBuildEvent({
        eventId: 'cloudflare:legacy-runtime-assertion',
        occurredAt: '2026-08-16T03:10:00Z',
        source: 'cloudflare',
        category: 'runtime',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: { name: REPOSITORY, refKind: 'detached', commitSha: MAIN_SHA },
        runtime: {
          service: 'sekret-bip-production',
          environment: 'production',
          releaseSha: MAIN_SHA,
        },
        evidenceRefs: evidence('legacy-runtime-assertion'),
      }),
      createBuildEvent({
        eventId: 'playwright:legacy-verification-assertion',
        occurredAt: '2026-08-16T03:11:00Z',
        source: 'playwright',
        category: 'verification',
        phase: 'verify',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: { name: REPOSITORY, refKind: 'detached', commitSha: MAIN_SHA },
        verification: { kind: 'browser-e2e', status: 'passed', exactCommitSha: MAIN_SHA },
        evidenceRefs: evidence('legacy-verification-assertion'),
      }),
    ];

    const snapshot = projection(
      events,
      FIXTURE_NOW_MS,
      liveMainRevalidation(MAIN_SHA, '2026-08-16T03:20:00Z'),
    );

    expect(snapshot.runtimes).toEqual({});
    expect(snapshot.verifications).toEqual({});
  });

  it('does not render non-passed coverage even when live current-main is available', () => {
    const events = [
      createBuildEvent({
        eventId: 'cloudflare:completed-not-passed-coverage',
        occurredAt: '2026-08-16T03:22:00Z',
        source: 'cloudflare',
        category: 'analytics',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: REPOSITORY,
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        coverage: {
          service: 'sekret-bip-production',
          environment: 'production',
          releaseSha: MAIN_SHA,
          windowStartedAt: '2026-08-16T03:00:00Z',
          windowEndedAt: '2026-08-16T03:15:00Z',
          sampleSource: 'analytics-engine',
          requestCount: 25,
          currentReleaseRequestCount: 25,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
          routeClasses: [{
            name: 'front-door',
            requestCount: 25,
            currentReleaseRequestCount: 25,
            priorReleaseRequestCount: 0,
            unclassifiedRequestCount: 0,
          }],
        },
        evidenceRefs: evidence('completed-not-passed-coverage'),
      }),
    ];

    const snapshot = projection(
      events,
      FIXTURE_NOW_MS,
      liveMainRevalidation(MAIN_SHA, '2026-08-16T03:20:00Z'),
    );
    expect(snapshot.source.currentMainSha?.value).toBe(MAIN_SHA);
    expect(snapshot.coverage).toEqual({});
    expect(snapshot.quality.ineligibleCoverageFacts).toBe(1);
  });

  it('keeps delayed or other-repository webhook facts historical instead of resurrecting a current main', () => {
    const events = [
      createBuildEvent({
        eventId: 'github:observed-current-b',
        occurredAt: '2026-08-16T03:00:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: REPOSITORY,
          branch: 'main',
          refKind: 'branch-head',
          commitSha: MAIN_SHA,
        },
        evidenceRefs: evidence('observed-current-b'),
      }),
      createBuildEvent({
        eventId: 'github:delayed-old-a',
        occurredAt: '2026-08-16T03:25:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: REPOSITORY,
          branch: 'main',
          refKind: 'branch-head',
          commitSha: OLD_SHA,
        },
        evidenceRefs: evidence('delayed-old-a'),
      }),
      createBuildEvent({
        eventId: 'cloudflare:old-a-coverage-after-delayed-webhook',
        occurredAt: '2026-08-16T03:26:00Z',
        source: 'cloudflare',
        category: 'analytics',
        phase: 'observe',
        truth: 'verified',
        authority: 'observed',
        status: 'passed',
        repository: {
          name: REPOSITORY,
          branch: 'main',
          refKind: 'branch-head',
          commitSha: OLD_SHA,
        },
        coverage: {
          service: 'sekret-bip-production',
          environment: 'production',
          releaseSha: OLD_SHA,
          windowStartedAt: '2026-08-16T03:05:00Z',
          windowEndedAt: '2026-08-16T03:20:00Z',
          sampleSource: 'analytics-engine',
          requestCount: 25,
          currentReleaseRequestCount: 25,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
          routeClasses: [{
            name: 'front-door',
            requestCount: 25,
            currentReleaseRequestCount: 25,
            priorReleaseRequestCount: 0,
            unclassifiedRequestCount: 0,
          }],
        },
        evidenceRefs: evidence('old-a-coverage-after-delayed-webhook'),
      }),
      createBuildEvent({
        eventId: 'github:other-repository-source',
        occurredAt: '2026-08-16T03:29:00Z',
        source: 'github',
        category: 'source',
        phase: 'build',
        truth: 'verified',
        authority: 'observed',
        status: 'completed',
        repository: {
          name: 'other-owner/other-repo',
          branch: 'main',
          refKind: 'branch-head',
          commitSha: INFERRED_SHA,
        },
        evidenceRefs: evidence('other-repository-source'),
      }),
    ];

    const snapshot = projection(
      events,
      FIXTURE_NOW_MS,
      liveMainRevalidation(MAIN_SHA, '2026-08-16T03:20:00Z'),
    );
    expect(snapshot.source.currentMainSha?.value).toBe(MAIN_SHA);
    expect(snapshot.source.lastObservedMainSha?.value).toBe(OLD_SHA);
    expect(snapshot.coverage).toEqual({});
    expect(snapshot.quality.staleCoverageFacts).toBe(1);
  });
});
