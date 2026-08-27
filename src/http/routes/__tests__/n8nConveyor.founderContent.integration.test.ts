import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDispatchFounderContent,
  mockAuthoritativePublish,
  mockIssueApproval,
  mockGetUser,
  supabaseMock,
} = vi.hoisted(() => ({
  mockDispatchFounderContent: vi.fn(),
  mockAuthoritativePublish: vi.fn(),
  mockIssueApproval: vi.fn(),
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
vi.mock('../../../lib/authoritativeFounderContentPublisher.js', () => ({
  dispatchAuthoritativeFounderContentPublishNow: mockAuthoritativePublish,
}));
vi.mock('../../../lib/founderContentApprovalStore.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/founderContentApprovalStore.js')>(
    '../../../lib/founderContentApprovalStore.js',
  );
  return {
    ...actual,
    issueFounderContentApproval: mockIssueApproval,
  };
});

import express from 'express';
import request from 'supertest';
import { n8nConveyorRouter } from '../n8nConveyor.js';
import {
  N8N_FOUNDER_CONTENT_CONTRACT,
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
} from '../../../lib/n8nProviderNeutralFounderContentOrchestrator.js';
import { FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT } from '../../../lib/firstPartyFounderContentExecutor.js';
import { FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT } from '../../../lib/founderContentApprovalStore.js';

const FOUNDER_EMAIL = 'founder@example.com';
const BEARER = 'Bearer test-token';
const PROPOSAL_HASH = 'a'.repeat(64);
const PAYLOAD_HASH = 'b'.repeat(64);
const AUTHORIZATION_HASH = 'c'.repeat(64);

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
  mockIssueApproval.mockResolvedValue({
    contract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
    approvalId: 'fca:approval-1',
    proposalHash: PROPOSAL_HASH,
    publicPayloadHash: PAYLOAD_HASH,
    authorizationHash: AUTHORIZATION_HASH,
    platform: 'linkedin',
    sourceRepo: 'jussray/founder-control-room',
    sourceCommitSha: 'd'.repeat(40),
    approvedAt: '2026-08-19T07:30:00.000Z',
    expiresAt: '2026-08-19T08:00:00.000Z',
    approval: {},
  });
  mockAuthoritativePublish.mockResolvedValue({
    ok: true,
    code: 'PUBLISHED',
    status: 200,
    contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
    truthState: 'PUBLISHED',
    published: true,
    retrySafe: false,
    freshApprovalMayRetry: false,
    executionId: 'execution-1',
    receipt: { externalPostId: 'urn:li:share:1' },
    providerEvidence: {},
    reasons: [],
    temporalTruth: {},
    temporalAnalytics: {},
  });
});

describe('n8n founder-content route', () => {
  it('rejects unauthenticated founder-content orchestration', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .send({});

    expect(res.status).toBe(401);
    expect(mockDispatchFounderContent).not.toHaveBeenCalled();
    expect(mockAuthoritativePublish).not.toHaveBeenCalled();
    expect(mockIssueApproval).not.toHaveBeenCalled();
  });

  it('advertises route implementation without pretending direct publication is runtime-ready', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founderContent).toEqual(expect.objectContaining({
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      enabled: false,
      blockedBy: 'L99_PROVIDER_NEUTRAL_AUTHORITATIVE_APPROVAL_ADAPTER_REQUIRED',
      providerSelection: 'founder-authenticated-bounded-platform-compatible',
      providerContractRoutes: N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
      authority: expect.objectContaining({
        orchestrate: false,
        requestProviderWrite: false,
        authorizePublication: false,
      }),
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      finalPublishedTruth: 'fcr-provider-readback-only',
      directPublish: expect.objectContaining({
        contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
        route: '/founder-content/publish-now',
        approvalRoute: '/founder-content/approvals',
        approvalStoreContract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
        provider: 'linkedin',
        routeImplemented: true,
        executionReadiness: 'unknown-until-live-preflight',
        runtimeReadyClaimAllowed: false,
        approvalObjectAcceptedFromCaller: false,
        callerSuppliedApprovalIsAuthority: false,
        oneShotApprovalClaimRequired: true,
        providerReadbackRequired: true,
      }),
    }));
    expect(res.body.founderContent.directPublish).not.toHaveProperty('enabled');
    expect(res.body.founderContent.directPublish.nextRuntimeGate).toContain('approval-store migration state');
    expect(res.body.founderContent.readiness).not.toHaveProperty('webhookUrl');
    expect(res.body.founderContent.readiness).not.toHaveProperty('bearerToken');
  });

  it('keeps provider-neutral orchestration fail-closed', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send({ approval_id: 'fca:approval-1' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({
      ok: false,
      code: 'L99_AUTHORITY_REQUIRED',
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      authorityRequired: 'L99_PROVIDER_NEUTRAL_AUTHORITATIVE_APPROVAL_ADAPTER',
    }));
    expect(mockDispatchFounderContent).not.toHaveBeenCalled();
  });

  it('requires explicit exact-copy confirmation before FCR issues authority', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/approvals')
      .set('Authorization', BEARER)
      .send({ proposal: { proposal_hash: PROPOSAL_HASH } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EXACT_COPY_CONFIRMATION_REQUIRED');
    expect(mockIssueApproval).not.toHaveBeenCalled();
  });

  it('forbids caller-supplied approval objects at issuance and publication', async () => {
    const issue = await request(buildApp())
      .post('/automation/conveyor/founder-content/approvals')
      .set('Authorization', BEARER)
      .send({ proposal: {}, confirm_exact_copy: true, approval: { approval_id: 'forged' } });
    expect(issue.status).toBe(400);
    expect(issue.body.code).toBe('CALLER_APPROVAL_OBJECT_FORBIDDEN');

    const publish = await request(buildApp())
      .post('/automation/conveyor/founder-content/publish-now')
      .set('Authorization', BEARER)
      .send({ proposal: {}, approval_id: 'fca:approval-1', approval: { approval_id: 'forged' } });
    expect(publish.status).toBe(400);
    expect(publish.body.code).toBe('CALLER_APPROVAL_OBJECT_FORBIDDEN');
    expect(mockAuthoritativePublish).not.toHaveBeenCalled();
  });

  it('issues an FCR-owned one-shot approval bound to the authenticated founder', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/approvals')
      .set('Authorization', BEARER)
      .send({ proposal: { proposal_hash: PROPOSAL_HASH }, confirm_exact_copy: true });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      contract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
      approval_id: 'fca:approval-1',
      proposal_hash: PROPOSAL_HASH,
      public_payload_hash: PAYLOAD_HASH,
      authorization_hash: AUTHORIZATION_HASH,
      one_shot: true,
      caller_supplied_approval_is_authority: false,
    }));
    expect(mockIssueApproval).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      proposal: { proposal_hash: PROPOSAL_HASH },
    }));
  });

  it('publishes only through the authoritative approval-id membrane', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/publish-now')
      .set('Authorization', BEARER)
      .send({
        proposal: { proposal_hash: PROPOSAL_HASH },
        approval_id: 'fca:approval-1',
        confirmation: {
          confirm_publication: true,
          authorization_hash: AUTHORIZATION_HASH,
          public_payload_hash: PAYLOAD_HASH,
          truth_context_hash: 'e'.repeat(64),
        },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true, published: true, code: 'PUBLISHED' }));
    expect(mockAuthoritativePublish).toHaveBeenCalledWith(expect.objectContaining({
      approval_id: 'fca:approval-1',
      confirmation: expect.objectContaining({ authorization_hash: AUTHORIZATION_HASH }),
    }), {
      founderUserId: 'founder-user-1',
      founderIdentity: FOUNDER_EMAIL,
    });
  });
});
