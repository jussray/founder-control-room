import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createBuildEventReceiptIngestHandler,
  deriveBuildEventReceiptToken,
} from '../buildEventReceipts.js';
import type { BuildEvent } from '../../../buildEvents/buildEvent.js';

const MCP_TOKEN = 'founder-signal-test-token';
const PRODUCER = 'sekret-bip-release-observer';
const RECEIPT_TOKEN = deriveBuildEventReceiptToken(MCP_TOKEN, PRODUCER);
const SHA = '1234567890abcdef1234567890abcdef12345678';

function runtimeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: `sekret-release:${SHA}`,
    occurredAt: '2026-08-18T20:52:23.735Z',
    source: 'cloudflare',
    category: 'runtime',
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
    runtime: {
      service: 'sekret-bip-production',
      environment: 'production',
      releaseSha: SHA,
    },
    evidenceRefs: [`github-actions:release:${SHA}`],
    ...overrides,
  };
}

function appWith(storeEvent = vi.fn(async () => 'stored' as const)) {
  const app = express();
  app.post(
    '/ingest/build-events/:slug',
    express.json(),
    createBuildEventReceiptIngestHandler({
      env: { FOUNDER_SIGNAL_ENGINE_MCP_TOKEN: MCP_TOKEN },
      findProject: async (slug) => slug === 'sekret-bip'
        ? { id: 'project-1', slug, repoIdentifier: 'jussray/Sekret-Bip' }
        : null,
      storeEvent,
    }),
  );
  return { app, storeEvent };
}

function authorized(req: request.Test) {
  return req
    .set('x-build-event-producer', PRODUCER)
    .set('x-build-event-receipt-token', RECEIPT_TOKEN);
}

describe('build-event receipt ingress', () => {
  it('accepts an exact-SHA observed production receipt and preserves the existing build-event contract', async () => {
    const { app, storeEvent } = appWith();
    const response = await authorized(
      request(app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      accepted: true,
      duplicate: false,
      eventId: `sekret-release:${SHA}`,
      contract: 'fcr/build-event@v1',
    });
    expect(storeEvent).toHaveBeenCalledTimes(1);
    const stored = storeEvent.mock.calls[0]?.[1] as BuildEvent;
    expect(stored.repository?.commitSha).toBe(SHA);
    expect(stored.runtime?.releaseSha).toBe(SHA);
    expect(stored.truth).toBe('verified');
    expect(stored.authority).toBe('observed');
  });

  it('is idempotent when the store reports a duplicate', async () => {
    const { app, storeEvent } = appWith(vi.fn(async () => 'duplicate' as const));
    const response = await authorized(
      request(app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent());

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
    expect(storeEvent).toHaveBeenCalledTimes(1);
  });

  it('fails closed on an event-id conflict', async () => {
    const { app } = appWith(vi.fn(async () => 'conflict' as const));
    const response = await authorized(
      request(app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent());

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('event_id_conflict');
  });

  it('rejects missing or incorrect producer credentials', async () => {
    const { app, storeEvent } = appWith();
    const missing = await request(app)
      .post('/ingest/build-events/sekret-bip')
      .send(runtimeEvent());
    const wrong = await request(app)
      .post('/ingest/build-events/sekret-bip')
      .set('x-build-event-producer', PRODUCER)
      .set('x-build-event-receipt-token', 'wrong')
      .send(runtimeEvent());

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(storeEvent).not.toHaveBeenCalled();
  });

  it('rejects repository mismatch even with valid credentials', async () => {
    const { app, storeEvent } = appWith();
    const response = await authorized(
      request(app).post('/ingest/build-events/sekret-bip'),
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
    expect(storeEvent).not.toHaveBeenCalled();
  });

  it('rejects external attempts to manufacture founder authorization', async () => {
    const { app, storeEvent } = appWith();
    const response = await authorized(
      request(app).post('/ingest/build-events/sekret-bip'),
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
    expect(storeEvent).not.toHaveBeenCalled();
  });

  it('rejects verified events without evidence before persistence', async () => {
    const { app, storeEvent } = appWith();
    const response = await authorized(
      request(app).post('/ingest/build-events/sekret-bip'),
    ).send(runtimeEvent({ evidenceRefs: [] }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_build_event');
    expect(storeEvent).not.toHaveBeenCalled();
  });
});
