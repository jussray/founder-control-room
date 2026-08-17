import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDispatchFounderContent,
  mockGetUser,
  supabaseMock,
} = vi.hoisted(() => ({
  mockDispatchFounderContent: vi.fn(),
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/n8nFounderContentOrchestrator.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/n8nFounderContentOrchestrator.js')>(
    '../../../lib/n8nFounderContentOrchestrator.js',
  );
  return {
    ...actual,
    dispatchN8nFounderContent: mockDispatchFounderContent,
  };
});

import express from 'express';
import request from 'supertest';
import { n8nConveyorRouter } from '../n8nConveyor.js';
import { N8N_FOUNDER_CONTENT_CONTRACT } from '../../../lib/n8nFounderContentOrchestrator.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/automation/conveyor', n8nConveyorRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'founder-user-1', email: FOUNDER_EMAIL } },
    error: null,
  });
  supabaseMock.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: { email: FOUNDER_EMAIL },
          error: null,
        }),
      }),
    }),
  }));
});

describe('n8n founder-content route', () => {
  it('rejects unauthenticated founder-content orchestration', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .send({});

    expect(res.status).toBe(401);
    expect(mockDispatchFounderContent).not.toHaveBeenCalled();
  });

  it('exposes the bounded founder-content orchestration contract to an authenticated founder', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founderContent).toEqual(expect.objectContaining({
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      finalPublishedTruth: 'fcr-provider-readback-only',
      authority: {
        orchestrate: true,
        requestProviderWrite: true,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
        readPrivateEvidence: false,
      },
    }));
  });

  it('dispatches through FCR and never upgrades n8n acknowledgement to published truth', async () => {
    mockDispatchFounderContent.mockResolvedValue({
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      request: { orchestrationId: 'fcr-n8n-social-v1:test' },
      receipt: {
        orchestrationId: 'fcr-n8n-social-v1:test',
        provider: 'buffer',
        state: 'scheduled',
        providerItemId: 'buffer-post-1',
        providerRequestId: 'buffer-request-1',
        truthState: 'provider_schedule_receipt_pending_readback',
        published: false,
        requiresProviderReadback: true,
      },
      reasons: [],
    });

    const envelope = {
      lane: 'first_party_founder_governed_schedule',
      authority: { authorization_mode: 'exact-current-you' },
    };

    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send(envelope);

    expect(res.status).toBe(202);
    expect(mockDispatchFounderContent).toHaveBeenCalledWith(envelope);
    expect(res.body.contract).toBe(N8N_FOUNDER_CONTENT_CONTRACT);
    expect(res.body.founder).toEqual({ userId: 'founder-user-1' });
    expect(res.body.receipt.published).toBe(false);
    expect(res.body.receipt.requiresProviderReadback).toBe(true);
    expect(res.body.finalPublishedTruth).toBe('fcr-provider-readback-only');
  });
});
