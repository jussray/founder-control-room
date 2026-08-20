import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  createBuildEventReceiptIngestHandler,
  deriveBuildEventReceiptToken,
} from '../buildEventReceipts.js';
import type { BuildEvent } from '../../../buildEvents/buildEvent.js';
import type { PassedCoverageWitnessReader } from '../../../buildEvents/releaseCoverageWitness.js';
import type { BuildEventStoreDisposition } from '../../../services/buildEventStore.js';

const MCP_TOKEN = 'founder-signal-test-token';
const RECEIPT_ROOT_TOKEN = 'build-event-receipt-root-test-token';
const PRODUCER = 'sekret-bip-release-observer';
const PROJECT_SLUG = 'sekret-bip';
const RECEIPT_TOKEN = deriveBuildEventReceiptToken(RECEIPT_ROOT_TOKEN, PRODUCER, PROJECT_SLUG);
const SHA = '1234567890abcdef1234567890abcdef12345678';
const NOW_MS = Date.parse('2026-08-18T21:00:00.000Z');

function runtimeEvent(overrides: Record<string, unknown> = {}) {
  return coverageEvent({
    eventId: `sekret-release:${SHA}`,
    ...overrides,
  });
}


function coverageEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: `sekret-coverage:${SHA}`,
    occurredAt: '2026-08-18T20:52:23.735Z',
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
      commitSha: SHA,
    },
    coverage: {
      service: 'sekret-bip-production',
      environment: 'production',
      releaseSha: SHA,
      windowStartedAt: '2026-08-18T20:35:00.000Z',
      windowEndedAt: '2026-08-18T20:50:00.000Z',
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
    },
    evidenceRefs: [`cloudflare-analytics:${SHA}`],
    ...overrides,
  };
}

function acceptedCoverageWitness(): PassedCoverageWitnessReader {
  return {
    verify: async () => ({
      status: 'verified',
      currentMainSha: SHA,
      deploymentSha: SHA,
      observedAt: new Date(NOW_MS).toISOString(),
    }),
  };
}

function appWith(
  disposition: BuildEventStoreDisposition = 'stored',
  env: NodeJS.ProcessEnv = {
    FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: MCP_TOKEN,
    FCR_BUILD_EVENT_RECEIPT_ROOT_TOKEN: RECEIPT_ROOT_TOKEN,
  },
  nowMs = NOW_MS,
  passedCoverageWitnessReader: PassedCoverageWitnessReader = acceptedCoverageWitness(),
  findProjectOverride?: (slug: string) => Promise<{
    id: string;
    slug: string;
    repoProvider: string | null;
    repoIdentifier: string | null;
  } | null>,
) {
  const app = express();
  const storedEvents: BuildEvent[] = [];
  let storeCalls = 0;
  const storeEvent = async (_projectId: string, event: BuildEvent): Promise<BuildEventStoreDisposition> => {
    storeCalls += 1;
    storedEvents.push(event);
    return disposition;
  };

  app.post(
    '/ingest/build-events/:slug',
    express.json(),
    createBuildEventReceiptIngestHandler({
      env,
      now: () => nowMs,
      findProject: findProjectOverride ?? (async (slug) => slug === PROJECT_SLUG
        ? { id: 'project-1', slug, repoProvider: 'github', repoIdentifier: 'jussray/Sekret-Bip' }
        : null),
      storeEvent,
      passedCoverageWitnessReader,
    }),
  );
  return {
    app,
    storedEvents,
    storeCalls: () => storeCalls,
  };
}

function authorized(req: request.Test) {
  return req
    .set('x-build-event-producer', PRODUCER)
    .set('x-build-event-receipt-token', RECEIPT_TOKEN);
}

describe('build-event receipt ingress', () => {
  it('accepts an exact-SHA observed coverage receipt and preserves the existing build-event contract', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      eventId: `sekret-release:${SHA}`,
      contract: 'fcr/build-event@v1',
    });
    expect(harness.storeCalls()).toBe(1);
    const stored = harness.storedEvents[0];
    expect(stored).toBeDefined();
    expect(stored?.repository?.commitSha).toBe(SHA);
    expect(stored?.coverage?.releaseSha).toBe(SHA);
    expect(stored?.runtime).toBeUndefined();
    expect(stored?.truth).toBe('verified');
    expect(stored?.authority).toBe('observed');
  });


  it('accepts policy-bound aggregate coverage without promoting it to runtime identity', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent());

    expect(response.status).toBe(201);
    expect(harness.storeCalls()).toBe(1);
    expect(harness.storedEvents[0]?.coverage?.releaseSha).toBe(SHA);
    expect(harness.storedEvents[0]?.runtime).toBeUndefined();
  });

  it('binds a producer credential and project lookup to the one enrolled project', async () => {
    const harness = appWith();
    const otherProject = await authorized(
      request(harness.app).post('/ingest/build-events/another-project'),
    ).send(runtimeEvent());
    expect(otherProject.status).toBe(403);
    expect(otherProject.body.error).toBe('producer_project_not_allowed');

    const wrongProvider = appWith(
      'stored',
      undefined,
      NOW_MS,
      acceptedCoverageWitness(),
      async (slug) => slug === PROJECT_SLUG
        ? {
            id: 'project-1',
            slug,
            repoProvider: 'gitlab',
            repoIdentifier: 'jussray/Sekret-Bip',
          }
        : null,
    );
    const providerMismatch = await authorized(
      request(wrongProvider.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent());
    expect(providerMismatch.status).toBe(403);
    expect(providerMismatch.body.error).toBe('producer_repository_provider_mismatch');
    expect(harness.storeCalls()).toBe(0);
    expect(wrongProvider.storeCalls()).toBe(0);
  });

  it('does not persist a passed coverage receipt without an independent current-main and provider witness', async () => {
    const harness = appWith('stored', undefined, NOW_MS, {
      verify: async () => ({ status: 'mismatch', code: 'coverage_witness_current_main_mismatch' }),
    });
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent());

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      accepted: false,
      error: 'coverage_witness_current_main_mismatch',
    });
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects non-passed coverage before it can bypass its independent witness', async () => {
    let witnessCalls = 0;
    const harness = appWith('stored', undefined, NOW_MS, {
      verify: async () => {
        witnessCalls += 1;
        return {
          status: 'verified' as const,
          currentMainSha: SHA,
          deploymentSha: SHA,
          observedAt: new Date(NOW_MS).toISOString(),
        };
      },
    });
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({ status: 'completed' }));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('coverage_receipt_requires_passed_status');
    expect(witnessCalls).toBe(0);
    expect(harness.storeCalls()).toBe(0);
  });

  it('does not let the coverage credential set founder control-plane intent', async () => {
    const harness = appWith();
    const injectedGoal = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({ goal: 'publish-now' }));
    const wrongPhase = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({ phase: 'deploy' }));
    const injectedRuntime = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      runtime: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: SHA,
      },
    }));
    const injectedAudit = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      repository: {
        name: 'jussray/Sekret-Bip',
        branch: 'main',
        refKind: 'branch-head',
        commitSha: SHA,
        auditedCommitSha: 'a'.repeat(40),
      },
    }));

    expect(injectedGoal.status).toBe(403);
    expect(injectedGoal.body.error).toBe('external_receipts_cannot_set_control_plane_intent');
    expect(wrongPhase.status).toBe(403);
    expect(wrongPhase.body.error).toBe('coverage_receipt_requires_observe_phase');
    expect(injectedRuntime.status).toBe(403);
    expect(injectedRuntime.body.error).toBe('coverage_receipt_contains_unallowed_control_fact');
    expect(injectedAudit.status).toBe(403);
    expect(injectedAudit.body.error).toBe('external_receipts_cannot_set_audited_identity');
    expect(harness.storeCalls()).toBe(0);
  });

  it('fails closed when independent coverage evidence cannot be read', async () => {
    const harness = appWith('stored', undefined, NOW_MS, {
      verify: async () => {
        throw new Error('provider_evidence_unavailable');
      },
    });
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent());

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Build-event receipt verification or store unavailable');
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects coverage that does not meet the predeclared observation policy', async () => {
    const harness = appWith();
    const insufficient = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: SHA,
        windowStartedAt: '2026-08-18T20:35:00.000Z',
        windowEndedAt: '2026-08-18T20:50:00.000Z',
        sampleSource: 'analytics-engine',
        requestCount: 24,
        currentReleaseRequestCount: 24,
        priorReleaseRequestCount: 0,
        unclassifiedRequestCount: 0,
        routeClasses: [{
          name: 'front-door',
          requestCount: 24,
          currentReleaseRequestCount: 24,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
        }],
      },
    }));
    expect(insufficient.status).toBe(403);
    expect(insufficient.body.error).toBe('coverage_minimum_request_count_not_met');

    const priorTail = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: SHA,
        windowStartedAt: '2026-08-18T20:35:00.000Z',
        windowEndedAt: '2026-08-18T20:50:00.000Z',
        sampleSource: 'analytics-engine',
        requestCount: 25,
        currentReleaseRequestCount: 23,
        priorReleaseRequestCount: 2,
        unclassifiedRequestCount: 0,
        routeClasses: [{
          name: 'front-door',
          requestCount: 25,
          currentReleaseRequestCount: 23,
          priorReleaseRequestCount: 2,
          unclassifiedRequestCount: 0,
        }],
        tailReasons: ['cached-edge-response'],
      },
    }));
    expect(priorTail.status).toBe(403);
    expect(priorTail.body.error).toBe('coverage_prior_release_share_above_policy');

    const unclassified = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: SHA,
        windowStartedAt: '2026-08-18T20:35:00.000Z',
        windowEndedAt: '2026-08-18T20:50:00.000Z',
        sampleSource: 'analytics-engine',
        requestCount: 25,
        currentReleaseRequestCount: 24,
        priorReleaseRequestCount: 0,
        unclassifiedRequestCount: 1,
        routeClasses: [{
          name: 'front-door',
          requestCount: 25,
          currentReleaseRequestCount: 24,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 1,
        }],
      },
    }));
    expect(unclassified.status).toBe(403);
    expect(unclassified.body.error).toBe('coverage_unclassified_requests_not_allowed');

    const unapprovedRoute = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: SHA,
        windowStartedAt: '2026-08-18T20:35:00.000Z',
        windowEndedAt: '2026-08-18T20:50:00.000Z',
        sampleSource: 'analytics-engine',
        requestCount: 25,
        currentReleaseRequestCount: 25,
        priorReleaseRequestCount: 0,
        unclassifiedRequestCount: 0,
        routeClasses: [{
          name: 'internal-admin',
          requestCount: 25,
          currentReleaseRequestCount: 25,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
        }],
      },
    }));
    expect(unapprovedRoute.status).toBe(403);
    expect(unapprovedRoute.body.error).toBe('coverage_route_class_not_allowed');

    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects a coverage receipt with mismatched release identity or synthetic proof', async () => {
    const harness = appWith();
    const mismatchedRelease = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
        windowStartedAt: '2026-08-18T20:35:00.000Z',
        windowEndedAt: '2026-08-18T20:50:00.000Z',
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
    }));
    expect(mismatchedRelease.status).toBe(403);
    expect(mismatchedRelease.body.error).toBe('coverage_release_sha_mismatch');

    const synthetic = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      source: 'playwright',
      coverage: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: SHA,
        windowStartedAt: '2026-08-18T20:35:00.000Z',
        windowEndedAt: '2026-08-18T20:50:00.000Z',
        sampleSource: 'synthetic-probe',
        requestCount: 1,
        currentReleaseRequestCount: 1,
        priorReleaseRequestCount: 0,
        unclassifiedRequestCount: 0,
        routeClasses: [{
          name: 'front-door',
          requestCount: 1,
          currentReleaseRequestCount: 1,
          priorReleaseRequestCount: 0,
          unclassifiedRequestCount: 0,
        }],
      },
    }));
    expect(synthetic.status).toBe(400);
    expect(synthetic.body.error).toBe('invalid_build_event');
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects stale, future-ending, and overly broad coverage windows', async () => {
    const harness = appWith();
    const stale = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        ...coverageEvent().coverage,
        windowStartedAt: '2026-08-18T18:30:00.000Z',
        windowEndedAt: '2026-08-18T18:45:00.000Z',
      },
    }));
    const delayedReceipt = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      occurredAt: '2026-08-17T22:01:00.000Z',
      coverage: {
        ...coverageEvent().coverage,
        windowStartedAt: '2026-08-17T21:45:00.000Z',
        windowEndedAt: '2026-08-17T22:00:00.000Z',
      },
    }));
    const futureEnding = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        ...coverageEvent().coverage,
        windowStartedAt: '2026-08-18T20:38:00.000Z',
        windowEndedAt: '2026-08-18T20:53:00.000Z',
      },
    }));
    const tooLong = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        ...coverageEvent().coverage,
        windowStartedAt: '2026-08-18T20:10:00.000Z',
        windowEndedAt: '2026-08-18T20:50:00.000Z',
      },
    }));

    expect(stale.status).toBe(403);
    expect(stale.body.error).toBe('coverage_window_too_old');
    expect(delayedReceipt.status).toBe(403);
    expect(delayedReceipt.body.error).toBe('coverage_window_too_old');
    expect(futureEnding.status).toBe(403);
    expect(futureEnding.body.error).toBe('coverage_window_ends_after_receipt');
    expect(tooLong.status).toBe(403);
    expect(tooLong.body.error).toBe('coverage_window_too_long');
    expect(harness.storeCalls()).toBe(0);
  });

  it('accepts coverage exactly at the declared maximum window and observation age', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      coverage: {
        ...coverageEvent().coverage,
        windowStartedAt: '2026-08-18T19:30:00.000Z',
        windowEndedAt: '2026-08-18T20:00:00.000Z',
      },
    }));

    expect(response.status).toBe(201);
    expect(harness.storeCalls()).toBe(1);
  });

  it('rejects a coverage window that ends after the receiver clock', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(coverageEvent({
      occurredAt: '2026-08-18T21:04:00.000Z',
      coverage: {
        ...coverageEvent().coverage,
        windowStartedAt: '2026-08-18T20:48:00.000Z',
        windowEndedAt: '2026-08-18T21:03:00.000Z',
      },
    }));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('coverage_window_ends_in_future');
    expect(harness.storeCalls()).toBe(0);
  });

  it('is idempotent when the store reports a duplicate', async () => {
    const harness = appWith('duplicate');
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent());

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
    expect(harness.storeCalls()).toBe(1);
  });

  it('fails closed on an event-id conflict', async () => {
    const harness = appWith('conflict');
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent());

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('event_id_conflict');
  });

  it('rejects missing or incorrect producer credentials', async () => {
    const harness = appWith();
    const missing = await request(harness.app)
      .post('/ingest/build-events/sekret-bip')
      .send(runtimeEvent());
    const wrong = await request(harness.app)
      .post('/ingest/build-events/sekret-bip')
      .set('x-build-event-producer', PRODUCER)
      .set('x-build-event-receipt-token', 'wrong')
      .send(runtimeEvent());

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(harness.storeCalls()).toBe(0);
  });

  it('does not let a remote MCP bearer derive build-observer authority', async () => {
    const harness = appWith();
    const tokenDerivedFromMcpBearer = deriveBuildEventReceiptToken(MCP_TOKEN, PRODUCER, PROJECT_SLUG);
    const response = await request(harness.app)
      .post('/ingest/build-events/sekret-bip')
      .set('x-build-event-producer', PRODUCER)
      .set('x-build-event-receipt-token', tokenDerivedFromMcpBearer)
      .send(runtimeEvent());

    expect(response.status).toBe(401);
    expect(harness.storeCalls()).toBe(0);
  });

  it('fails closed if build-receipt and remote-MCP credential roots are accidentally reused', async () => {
    const harness = appWith('stored', {
      FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: MCP_TOKEN,
      FCR_BUILD_EVENT_RECEIPT_ROOT_TOKEN: MCP_TOKEN,
    });
    const response = await request(harness.app)
      .post('/ingest/build-events/sekret-bip')
      .set('x-build-event-producer', PRODUCER)
      .set('x-build-event-receipt-token', deriveBuildEventReceiptToken(MCP_TOKEN, PRODUCER, PROJECT_SLUG))
      .send(runtimeEvent());

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Build-event receipt credential isolation is invalid');
    expect(harness.storeCalls()).toBe(0);
  });

  it('fails closed when the dedicated build-receipt root is not configured', async () => {
    const harness = appWith('stored', {
      FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: MCP_TOKEN,
    });
    const response = await request(harness.app)
      .post('/ingest/build-events/sekret-bip')
      .set('x-build-event-producer', PRODUCER)
      .set('x-build-event-receipt-token', RECEIPT_TOKEN)
      .send(runtimeEvent());

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('Build-event receipt ingest is not configured');
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects future-dated and expired receipts before they can poison current truth ordering', async () => {
    const harness = appWith();
    const future = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent({
      occurredAt: new Date(NOW_MS + 6 * 60 * 1_000).toISOString(),
    }));
    const expired = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent({
      occurredAt: new Date(NOW_MS - 24 * 60 * 60 * 1_000 - 1).toISOString(),
    }));

    expect(future.status).toBe(403);
    expect(future.body.error).toBe('event_occurred_at_too_far_in_future');
    expect(expired.status).toBe(403);
    expect(expired.body.error).toBe('event_receipt_expired');
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects external system impersonation and non-main production provenance', async () => {
    const harness = appWith();
    const systemSource = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent({ source: 'system' }));
    const proposalHead = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent({
      repository: {
        name: 'jussray/Sekret-Bip',
        branch: 'feature/test',
        refKind: 'proposal-head',
        commitSha: SHA,
      },
    }));

    expect(systemSource.status).toBe(403);
    expect(systemSource.body.error).toMatch(/external_receipts_cannot_impersonate_system|producer_source_not_allowed/);
    expect(proposalHead.status).toBe(403);
    expect(proposalHead.body.error).toBe('production_receipt_requires_main_branch_head');
    expect(harness.storeCalls()).toBe(0);
  });

  it('does not let the coverage credential self-label a runtime truth claim', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send({
      ...runtimeEvent(),
      category: 'runtime',
      coverage: undefined,
      runtime: {
        service: 'sekret-bip-production',
        environment: 'production',
        releaseSha: SHA,
      },
    }));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('producer_category_not_allowed');
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects repository mismatch even with valid credentials', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent({
      repository: {
        name: 'jussray/founder-control-room',
        branch: 'main',
        refKind: 'branch-head',
        commitSha: SHA,
      },
    }));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('event_repository_mismatch');
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects external attempts to manufacture founder authorization', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send({
      ...runtimeEvent(),
      source: 'founder',
      category: 'decision',
      authority: 'authorized',
      decision: { value: 'approved', scope: 'merge' },
      runtime: undefined,
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/external_receipts_cannot_authorize|external_receipts_cannot_impersonate_founder/);
    expect(harness.storeCalls()).toBe(0);
  });

  it('rejects verified events without evidence before persistence', async () => {
    const harness = appWith();
    const response = await authorized(
      request(harness.app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent({ evidenceRefs: [] }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_build_event');
    expect(harness.storeCalls()).toBe(0);
  });
});
