import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuthoritativeN8n,
  mockAuthoritativePublish,
  mockIssueApproval,
  mockGetUser,
  supabaseMock,
} = vi.hoisted(() => ({
  mockAuthoritativeN8n: vi.fn(),
  mockAuthoritativePublish: vi.fn(),
  mockIssueApproval: vi.fn(),
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/authoritativeN8nFounderContentPublisher.js', () => ({
  dispatchAuthoritativeN8nFounderContent: mockAuthoritativeN8n,
}));
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
  mockAuthoritativeN8n.mockResolvedValue({
    ok: false,
    code: 'ORCHESTRATION_DISABLED',
    status: 503,
    request: null,
    receipt: null,
    reasons: ['n8n founder-content orchestration is disabled'],
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
    expect(mockAuthoritativeN8n).not.toHaveBeenCalled();
    expect(mockAuthoritativePublish).not.toHaveBeenCalled();
    expect(mockIssueApproval).not.toHaveBeenCalled();
  });

  it('advertises the authority adapter without pretending provider runtime is configured or proven', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founderContent).toEqual(expect.objectContaining({
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      routeImplemented: true,
      enabled: false,
      blockedBy: 'N8N_FOUNDER_CONTENT_RUNTIME_CONFIGURATION_REQUIRED',
      inputAuthority: 'fcr-issued-one-shot-approval-id-plus-exact-copy-confirmation',
      providerSelection: 'founder-authenticated-bounded-platform-compatible',
      providerContractRoutes: N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
      controlledProbeAllowed: false,
      authority: expect.objectContaining({
        orchestrate: true,
        requestProviderWrite: true,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
      }),
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      oneShotApprovalClaimRequired: true,
      providerReadbackRequired: true,
      blindRetryAllowed: false,
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

  it('routes provider-neutral orchestration through the FCR authority adapter and keeps publication truth pending readback', async () => {
    mockAuthoritativeN8n.mockResolvedValueOnce({
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      request: { orchestrationId: 'fcr-n8n-social-v2:test' },
      receipt: {
        orchestrationId: 'fcr-n8n-social-v2:test',
        provider: 'buffer',
        state: 'scheduled',
        providerItemId: 'buffer-item-1',
        providerRequestId: 'buffer-request-1',
        truthState: 'provider_schedule_receipt_pending_readback',
        published: false,
        requiresProviderReadback: true,
      },
      reasons: [],
    });

    const proposal = {
      proposal_hash: PROPOSAL_HASH,
      public_payload: { platform: 'linkedin', draft_text: 'Exact approved Buffer test copy.' },
    };
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send({
        proposal,
        approval_id: 'fca:approval-1',
        n8n_provider: 'buffer',
        confirmation: {
          confirm_publication: true,
          authorization_hash: AUTHORIZATION_HASH,
          public_payload_hash: PAYLOAD_HASH,
        },
      });

    expect(res.status).toBe(202);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      code: 'DISPATCHED',
      published: false,
      finalPublishedTruth: 'fcr-provider-readback-only',
    }));
    expect(mockAuthoritativeN8n).toHaveBeenCalledWith({
      proposal,
      approval_id: 'fca:approval-1',
      n8n_provider: 'buffer',
      confirmation: {
        confirm_publication: true,
        authorization_hash: AUTHORIZATION_HASH,
        public_payload_hash: PAYLOAD_HASH,
      },
    }, {
      founderUserId: 'founder-user-1',
      founderIdentity: FOUNDER_EMAIL,
    });
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

  it('forbids caller-supplied approval objects at issuance and both execution routes', async () => {
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

    const orchestrate = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send({ proposal: {}, approval_id: 'fca:approval-1', approval: { approval_id: 'forged' } });
    expect(orchestrate.status).toBe(400);
    expect(orchestrate.body.code).toBe('CALLER_APPROVAL_OBJECT_FORBIDDEN');

    expect(mockAuthoritativePublish).not.toHaveBeenCalled();
    expect(mockAuthoritativeN8n).not.toHaveBeenCalled();
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
