import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('n8n founder-content route', () => {
  it('rejects unauthenticated founder-content orchestration', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .send({});

    expect(res.status).toBe(401);
    expect(mockDispatchFounderContent).not.toHaveBeenCalled();
  });

  it('exposes bounded provider contracts separately from redacted runtime observation', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founderContent).toEqual(expect.objectContaining({
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      providerSelection: 'founder-authenticated-bounded-platform-compatible',
      providerContractRoutes: N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
      providerRuntimeConfiguration: {
        env: 'N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS',
        defaultEnabled: ['buffer'],
        rule: 'contract-capable-does-not-imply-runtime-enabled',
      },
      providerRuntimeReadback: {
        n8n: {
          configured: false,
          enabled: false,
        },
        providerAllowlist: {
          enabledProviders: ['buffer'],
          invalidProviderCount: 0,
          hasInvalidProviders: false,
        },
        adapterProof: 'not-observed',
        liveProbeRequired: true,
        providerOutcomeProofRequired: true,
        secretsExposed: false,
      },
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

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('webhookUrl');
    expect(serialized).not.toContain('bearerToken');
    expect(serialized).not.toContain('invalidProviders');
    expect(serialized).not.toContain('configured-at-runtime');
  });

  it('reports n8n and provider allowlist state without exposing runtime secrets', async () => {
    vi.stubEnv('N8N_FOUNDER_CONTENT_ENABLED', 'true');
    vi.stubEnv('N8N_FOUNDER_CONTENT_WEBHOOK_URL', 'https://n8n.example/webhook/founder-content');
    vi.stubEnv('N8N_FOUNDER_CONTENT_BEARER_TOKEN', 'configured-at-runtime');
    vi.stubEnv('N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS', 'buffer,meta,tiktok');

    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founderContent.providerRuntimeReadback).toEqual({
      n8n: {
        configured: true,
        enabled: true,
      },
      providerAllowlist: {
        enabledProviders: ['buffer', 'meta', 'tiktok'],
        invalidProviderCount: 0,
        hasInvalidProviders: false,
      },
      adapterProof: 'not-observed',
      liveProbeRequired: true,
      providerOutcomeProofRequired: true,
      secretsExposed: false,
    });

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('https://n8n.example/webhook/founder-content');
    expect(serialized).not.toContain('configured-at-runtime');
  });

  it('reports invalid provider presence without echoing credential-like values', async () => {
    const credentialLikeInvalidValue = 'sk-proj-super-secret-credential-material';
    vi.stubEnv(
      'N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS',
      `meta,${credentialLikeInvalidValue}`,
    );

    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founderContent.providerRuntimeReadback.providerAllowlist).toEqual({
      enabledProviders: ['meta'],
      invalidProviderCount: 1,
      hasInvalidProviders: true,
    });
    expect(res.body.founderContent.providerRuntimeReadback.adapterProof).toBe('not-observed');

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(credentialLikeInvalidValue);
    expect(serialized).not.toContain('invalidProviders');
  });

  it('binds execution identity to the authenticated founder and never trusts body identity', async () => {
    mockDispatchFounderContent.mockResolvedValue({
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      request: {
        orchestrationId: 'fcr-n8n-social-v2:test',
        providerRequest: { provider: 'meta' },
      },
      receipt: {
        orchestrationId: 'fcr-n8n-social-v2:test',
        provider: 'meta',
        state: 'scheduled',
        providerItemId: 'meta-post-1',
        providerRequestId: 'meta-request-1',
        truthState: 'provider_schedule_receipt_pending_readback',
        published: false,
        requiresProviderReadback: true,
      },
      reasons: [],
    });

    const envelope = {
      lane: 'first_party_founder_governed_schedule',
      authority: { authorization_mode: 'exact-current-you' },
      n8n_provider: 'meta',
      executedBy: 'attacker@example.com',
    };

    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send(envelope);

    expect(res.status).toBe(202);
    expect(mockDispatchFounderContent).toHaveBeenCalledWith(envelope, {
      executedBy: FOUNDER_EMAIL,
    });
    expect(res.body.contract).toBe(N8N_FOUNDER_CONTENT_CONTRACT);
    expect(res.body.founder).toEqual({ userId: 'founder-user-1' });
    expect(res.body.receipt.provider).toBe('meta');
    expect(res.body.receipt.published).toBe(false);
    expect(res.body.receipt.requiresProviderReadback).toBe(true);
    expect(res.body.finalPublishedTruth).toBe('fcr-provider-readback-only');
  });
});
