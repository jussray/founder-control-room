/**
 * GitHub webhook handler — unit tests
 *
 * Verifies that:
 *   - HMAC verification rejects tampered bodies
 *   - JSON is parsed from the Buffer AFTER signature verification
 *   - A correctly signed pull_request event is accepted and processed
 *   - Unknown events return 200 with accepted:false
 *   - Missing repository returns 200 with accepted:false
 *
 * Run: npx vitest run src/http/webhooks/__tests__/github.webhook.test.ts
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHmac } from 'crypto';

const WEBHOOK_SECRET = 'test-webhook-secret';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { project_id: 'proj-1' } }),
      insert: vi.fn().mockResolvedValue({ data: { id: 'event-uuid-1' }, error: null }),
      single: vi.fn().mockResolvedValue({ data: { id: 'event-uuid-1' }, error: null }),
    })),
  },
}));

vi.mock('../../../events/inbox.js', () => ({
  persistProviderEvent: vi.fn().mockResolvedValue({ id: 'event-uuid-1', isDuplicate: false }),
}));

vi.mock('../../../events/outbox.js', () => ({
  enqueueReconcile: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

import { handleGitHubWebhook } from '../github.js';

function makeApp() {
  const app = express();
  app.post('/webhooks/github', express.raw({ type: 'application/json' }), handleGitHubWebhook);
  return app;
}

function sign(body: string): string {
  return `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(body)).digest('hex')}`;
}

const prPayload = JSON.stringify({
  action: 'opened',
  pull_request: {
    number: 42,
    title: 'Add feature',
    state: 'open',
    merged: false,
    merge_commit_sha: null,
    html_url: 'https://github.com/jussray/Sekret-Bip/pull/42',
    head: { sha: 'abc123', ref: 'feature/test' },
    base: { ref: 'main' },
    user: { login: 'jussray' },
    updated_at: '2026-07-11T00:00:00Z',
  },
  repository: { full_name: 'jussray/Sekret-Bip' },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHub webhook handler', () => {
  beforeAll(() => {
    process.env['GITHUB_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
  });

  it('returns 401 for missing signature', async () => {
    const res = await request(makeApp())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'delivery-001')
      .send(Buffer.from(prPayload));
    expect(res.status).toBe(401);
  });

  it('returns 401 for incorrect signature', async () => {
    const res = await request(makeApp())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'delivery-002')
      .set('x-hub-signature-256', 'sha256=badhash')
      .send(Buffer.from(prPayload));
    expect(res.status).toBe(401);
  });

  it('accepts a correctly signed pull_request event', async () => {
    const res = await request(makeApp())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'delivery-003')
      .set('x-hub-signature-256', sign(prPayload))
      .send(Buffer.from(prPayload));
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.eventId).toBe('event-uuid-1');
  });

  it('returns 200 accepted:false for unsupported event type', async () => {
    const body = JSON.stringify({ repository: { full_name: 'jussray/Sekret-Bip' } });
    const res = await request(makeApp())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'star')
      .set('x-github-delivery', 'delivery-004')
      .set('x-hub-signature-256', sign(body))
      .send(Buffer.from(body));
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(false);
    expect(res.body.reason).toBe('unsupported event type');
  });

  it('returns 200 accepted:false when repository is missing', async () => {
    const body = JSON.stringify({ action: 'opened', pull_request: { number: 1 } });
    const res = await request(makeApp())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'delivery-005')
      .set('x-hub-signature-256', sign(body))
      .send(Buffer.from(body));
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(false);
    expect(res.body.reason).toBe('no repository in payload');
  });

  it('returns 400 for non-JSON body', async () => {
    const body = Buffer.from('not json at all');
    const sig = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;
    const res = await request(makeApp())
      .post('/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'delivery-006')
      .set('x-hub-signature-256', sig)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON body');
  });
});
