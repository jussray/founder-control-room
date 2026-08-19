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
vi.mock('../../../lib/n8nProviderNeutralFounderContentOrchestrator.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/n8nProviderNeutralFounderContentOrchestrator.js')>(
    '../../../lib/n8nProviderNeutralFounderContentOrchestrator.js',
  );
  return {
    ...actual,
    dispatchProviderNeutralN8nFounderContent: mockDispatchFounderContent,
  };
});

import express from 'express';
import request from 'supertest';
import { n8nConveyorRouter } from '../n8nConveyor.js';
import {
  N8N_FOUNDER_CONTENT_CONTRACT,
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
} from '../../../lib/n8nProviderNeutralFounderContentOrchestrator.js';

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

  it('advertises n8n stage orchestration separately from disabled provider-write authority', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.authority).toEqual({
      advanceStage: true,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    });
    expect(res.body.founderContent).toEqual(expect.objectContaining({
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      enabled: false,
      blockedBy: 'L99_AUTHORITATIVE_APPROVAL_STORE_REQUIRED',
      providerSelection: 'founder-authenticated-bounded-platform-compatible',
      providerContractRoutes: N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
      providerRuntimeConfiguration: {
        env: 'N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS',
        defaultEnabled: ['buffer'],
        rule: 'contract-capable-does-not-imply-runtime-enabled',
      },
      finalPublishedTruth: 'fcr-provider-readback-only',
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      authority: {
        orchestrate: true,
        requestProviderWrite: false,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
        readPrivateEvidence: false,
      },
      directPublish: expect.objectContaining({
        enabled: false,
        blockedBy: 'L99_AUTHORITATIVE_APPROVAL_STORE_REQUIRED',
        authoritativeApprovalStoreReadbackRequired: true,
        callerSuppliedApprovalIsAuthority: false,
      }),
    }));
  });

  it('fail-closes direct external publication until an authoritative ApprovalStore readback exists', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/publish-now')
      .set('Authorization', BEARER)
      .send({
        proposal: { kind: 'chief-ai/founder-content-proposal' },
        approval: { approval_id: 'caller-supplied' },
        confirmation: { confirm_publication: true },
        current_you: { authenticated: true },
      });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe('L99_AUTHORITY_REQUIRED');
    expect(res.body.published).toBe(false);
    expect(res.body.authorityRequired).toBe('L99_AUTHORITATIVE_APPROVAL_STORE');
    expect(res.body.reasons.join(' ')).toContain('authoritative storage');
    expect(res.body.founder).toEqual({ userId: 'founder-user-1' });
  });

  it('fail-closes scheduled/provider-write orchestration until authoritative approval readback exists', async () => {
    const envelope = {
      lane: 'first_party_founder_governed_schedule',
      authority: { authorization_mode: 'exact-current-you' },
      n8n_provider: 'meta',
      approval: { approval_id: 'caller-supplied' },
      executedBy: 'attacker@example.com',
    };

    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send(envelope);

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe('L99_AUTHORITY_REQUIRED');
    expect(res.body.published).toBe(false);
    expect(res.body.authorityRequired).toBe('L99_AUTHORITATIVE_APPROVAL_STORE');
    expect(res.body.founder).toEqual({ userId: 'founder-user-1' });
    expect(mockDispatchFounderContent).not.toHaveBeenCalled();
  });
});
