import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDispatchFounderContent,
  mockDirectPublish,
  mockGetUser,
  supabaseMock,
} = vi.hoisted(() => ({
  mockDispatchFounderContent: vi.fn(),
  mockDirectPublish: vi.fn(),
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
vi.mock('../../../lib/temporallyGovernedFounderContentExecutor.js', () => ({
  dispatchTemporallyGovernedFounderContentPublishNow: mockDirectPublish,
}));

import express from 'express';
import request from 'supertest';
import { n8nConveyorRouter } from '../n8nConveyor.js';
import {
  N8N_FOUNDER_CONTENT_CONTRACT,
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
} from '../../../lib/n8nProviderNeutralFounderContentOrchestrator.js';
import { FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT } from '../../../lib/firstPartyFounderContentExecutor.js';

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
    expect(mockDirectPublish).not.toHaveBeenCalled();
  });

  it('exposes readiness without advertising external mutation authority', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
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
      readiness: expect.objectContaining({
        liveProbeRequired: true,
        liveVerified: false,
        secretValuesExposed: false,
      }),
      authority: {
        orchestrate: false,
        requestProviderWrite: false,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
        readPrivateEvidence: false,
      },
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      finalPublishedTruth: 'fcr-provider-readback-only',
      directPublish: expect.objectContaining({
        contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
        enabled: false,
        blockedBy: 'L99_AUTHORITATIVE_APPROVAL_STORE_REQUIRED',
        authoritativeApprovalStoreReadbackRequired: true,
        callerSuppliedApprovalIsAuthority: false,
      }),
    }));
    expect(res.body.founderContent.readiness).not.toHaveProperty('webhookUrl');
    expect(res.body.founderContent.readiness).not.toHaveProperty('bearerToken');
  });

  it('rejects caller-supplied approval evidence before provider-neutral orchestration', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send({
        lane: 'first_party_founder_governed_schedule',
        authority: { authorization_mode: 'exact-current-you' },
        approval: { approval_id: 'caller-supplied' },
        n8n_provider: 'buffer',
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({
      ok: false,
      code: 'L99_AUTHORITY_REQUIRED',
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      published: false,
      authorityRequired: 'L99_AUTHORITATIVE_APPROVAL_STORE',
      operation: 'orchestrate',
      founder: { userId: 'founder-user-1' },
      finalPublishedTruth: 'fcr-provider-readback-only',
    }));
    expect(res.body.reasons.join(' ')).toContain('authoritative storage');
    expect(mockDispatchFounderContent).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied approval evidence before direct publication', async () => {
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
    expect(res.body).toEqual(expect.objectContaining({
      ok: false,
      code: 'L99_AUTHORITY_REQUIRED',
      contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
      published: false,
      authorityRequired: 'L99_AUTHORITATIVE_APPROVAL_STORE',
      operation: 'publish',
      founder: { userId: 'founder-user-1' },
      finalPublishedTruth: 'fcr-provider-readback-only',
    }));
    expect(res.body.reasons.join(' ')).toContain('authoritative storage');
    expect(mockDirectPublish).not.toHaveBeenCalled();
  });
});
