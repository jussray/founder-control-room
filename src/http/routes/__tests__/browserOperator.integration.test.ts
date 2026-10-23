import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, supabaseMock } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));

import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { browserOperatorRouter } from '../browserOperator.js';
import { previewFounderBrowserIntent } from '../../../lib/browserOperatorPlan.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function app() {
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use('/browser-operator', browserOperatorRouter);
  return expressApp;
}

function authorizeFounder(allowed = true) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-fixture-id', email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== 'founder_users') throw new Error('Unexpected auth table');
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: allowed ? { email: FOUNDER_EMAIL } : null,
            error: null,
          }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FCR founder-only browser planner', () => {
  it('returns 401 to unauthenticated preview requests', async () => {
    const result = await request(app()).post('/browser-operator/preview')
      .send({ request: 'Test the Sync Party game journey' });
    expect(result.status).toBe(401);
    expect(result.body.status).not.toBe('REQUIRES_FOUNDER_RUN_APPROVAL');
  });

  it('returns 403 for authenticated non-allowlisted users', async () => {
    authorizeFounder(false);
    const result = await request(app())
      .post('/browser-operator/preview')
      .set('Authorization', BEARER)
      .send({ request: 'Test the Sync Party game journey' });
    expect(result.status).toBe(403);
    expect(result.body.status).not.toBe('REQUIRES_FOUNDER_RUN_APPROVAL');
  });

  it('returns only a non-executing reviewed plan for the allowlisted founder', async () => {
    authorizeFounder();
    const result = await request(app())
      .post('/browser-operator/preview')
      .set('Authorization', BEARER)
      .send({ request: 'Test the complete Sync Party new user journey on games.jussco.company' });
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(result.body).toMatchObject({
      contract: 'fcr/browser-operator-preview@v1',
      status: 'REQUIRES_FOUNDER_RUN_APPROVAL',
      project: 'sync-party-game',
      targetOrigin: 'https://games.jussco.company',
      manifest: 'config/browser-journeys/sync-party.json',
      actorCount: 2,
      stepCount: 53,
      browserExecuted: false,
      approvalIssued: false,
      mergeAuthorized: false,
      deployAuthorized: false,
      writeAuthorization: false,
    });
    expect(JSON.stringify(result.body)).not.toContain(FOUNDER_EMAIL);
  });

  it('fails closed on unsafe, unsupported, or additional project intent', async () => {
    authorizeFounder();
    const requests = [
      'Test Sync Party and deploy changes',
      'Check Sync Party admin login',
      'Test games.jussco.company and chief.foundercontrolroom.org',
      'Test Sync Party then delete data',
      'Test Sync Party and email results',
      'Open private parent portal on sekretbip.net',
      'Test another-domain.example',
    ];
    for (const input of requests) {
      const result = await request(app())
        .post('/browser-operator/preview')
        .set('Authorization', BEARER)
        .send({ request: input });
      expect(result.status).toBe(422);
      expect(result.body.status).toBe('REJECTED');
      expect(result.body.browserExecuted).toBe(false);
    }
  });

  it('rejects malformed JSON bodies without echoing them', async () => {
    authorizeFounder();
    for (const body of [[], {}, { request: 42 }, { request: '' }]) {
      const result = await request(app())
        .post('/browser-operator/preview')
        .set('Authorization', BEARER)
        .send(body);
      expect([400, 422]).toContain(result.status);
      expect(result.body.status).toBe('REJECTED');
    }
  });

  it('matches its preview scope to the checked-in reviewed manifest', () => {
    const manifest = JSON.parse(readFileSync('config/browser-journeys/sync-party.json', 'utf8'));
    const result = previewFounderBrowserIntent('Test Sync Party');
    expect(result.status).toBe('REQUIRES_FOUNDER_RUN_APPROVAL');
    if (result.status !== 'REQUIRES_FOUNDER_RUN_APPROVAL') throw new Error('No route');
    expect(result.stepCount).toBe(manifest.steps.length);
    expect(result.actorCount).toBe(Object.keys(manifest.actors).length);
    expect(result.targetOrigin).toBe(new URL(manifest.target).origin);
    expect(result.manifest).toBe('config/browser-journeys/sync-party.json');
  });
});
