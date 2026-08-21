import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuthoritativeBufferSchedule,
  mockIssueApproval,
  mockGetUser,
  supabaseMock,
} = vi.hoisted(() => ({
  mockAuthoritativeBufferSchedule: vi.fn(),
  mockIssueApproval: vi.fn(),
  mockGetUser: vi.fn(),
  supabaseMock: { from: vi.fn() },
}));

vi.mock('../../../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: supabaseMock }));
vi.mock('../../../lib/authoritativeBufferFounderContentScheduler.js', () => ({
  AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT: 'fcr/authoritative-buffer-founder-content@v1',
  dispatchAuthoritativeBufferFounderContentSchedule: mockAuthoritativeBufferSchedule,
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
import { AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT } from '../../../lib/authoritativeBufferFounderContentScheduler.js';
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
    approvedAt: '2026-08-20T20:00:00.000Z',
    expiresAt: '2026-08-20T20:30:00.000Z',
    approval: {},
  });
  mockAuthoritativeBufferSchedule.mockResolvedValue({
    ok: true,
    code: 'BUFFER_SCHEDULE_ACCEPTED',
    status: 202,
    contract: AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT,
    transport: 'buffer',
    published: false,
    approvalConsumed: true,
    freshApprovalRequiredForRetry: false,
    request: { orchestrationId: 'buffer-op-1' },
    receipt: { provider: 'buffer', state: 'scheduled', published: false },
    reasons: ['Buffer accepted the governed schedule request'],
  });
});

describe('founder-content Buffer route', () => {
  it('rejects unauthenticated founder-content orchestration', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .send({});

    expect(res.status).toBe(401);
    expect(mockAuthoritativeBufferSchedule).not.toHaveBeenCalled();
    expect(mockIssueApproval).not.toHaveBeenCalled();
  });

  it('advertises Chief -> FCR -> Buffer as the only active transport', async () => {
    const res = await request(buildApp())
      .get('/automation/conveyor')
      .set('Authorization', BEARER);

    expect(res.status).toBe(200);
    expect(res.body.founderContent).toEqual(expect.objectContaining({
      contract: AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      approvalRoute: '/founder-content/approvals',
      routeImplemented: true,
      canonicalAuthority: 'founder-control-room',
      storyBrain: 'chief-ai-machine',
      activeTransport: 'buffer',
      transportPolicy: 'buffer-only',
      authority: expect.objectContaining({
        orchestrate: true,
        requestProviderWrite: true,
        authorizePublication: false,
        markPublished: false,
      }),
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      finalPublishedTruth: 'buffer-provider-readback-only',
      directLinkedIn: expect.objectContaining({
        active: false,
        code: 'DIRECT_LINKEDIN_TRANSPORT_INACTIVE',
      }),
    }));
    expect(res.body.founderContent.providerRuntimeConfiguration).toEqual(expect.objectContaining({
      defaultEnabled: ['buffer'],
      permitted: ['buffer'],
    }));
    expect(res.body.founderContent.providerRuntimeConfiguration.rejected).toContain('cambiante');
    expect(res.body.founderContent.providerRuntimeConfiguration.rejected).toContain('linkedin-direct');
    expect(res.body.founderContent.readiness).not.toHaveProperty('webhookUrl');
    expect(res.body.founderContent.readiness).not.toHaveProperty('bearerToken');
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

  it('forbids caller-supplied approval objects at issuance and Buffer scheduling', async () => {
    const issue = await request(buildApp())
      .post('/automation/conveyor/founder-content/approvals')
      .set('Authorization', BEARER)
      .send({ proposal: {}, confirm_exact_copy: true, approval: { approval_id: 'forged' } });
    expect(issue.status).toBe(400);
    expect(issue.body.code).toBe('CALLER_APPROVAL_OBJECT_FORBIDDEN');

    const schedule = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send({ proposal: {}, approval_id: 'fca:approval-1', approval: { approval_id: 'forged' } });
    expect(schedule.status).toBe(400);
    expect(schedule.body.code).toBe('CALLER_APPROVAL_OBJECT_FORBIDDEN');
    expect(mockAuthoritativeBufferSchedule).not.toHaveBeenCalled();
  });

  it('issues an FCR-owned one-shot approval for the Buffer schedule lane', async () => {
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
      active_transport: 'buffer',
    }));
    expect(mockIssueApproval).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      proposal: { proposal_hash: PROPOSAL_HASH },
    }));
  });

  it('schedules only through the authoritative Buffer approval-id membrane', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content')
      .set('Authorization', BEARER)
      .send({
        proposal: { proposal_hash: PROPOSAL_HASH },
        approval_id: 'fca:approval-1',
        confirmation: {
          confirm_schedule: true,
          authorization_hash: AUTHORIZATION_HASH,
          public_payload_hash: PAYLOAD_HASH,
        },
      });

    expect(res.status).toBe(202);
    expect(res.body).toEqual(expect.objectContaining({
      ok: true,
      transport: 'buffer',
      published: false,
      code: 'BUFFER_SCHEDULE_ACCEPTED',
    }));
    expect(mockAuthoritativeBufferSchedule).toHaveBeenCalledWith(expect.objectContaining({
      approval_id: 'fca:approval-1',
      confirmation: expect.objectContaining({
        confirm_schedule: true,
        authorization_hash: AUTHORIZATION_HASH,
        public_payload_hash: PAYLOAD_HASH,
      }),
    }), {
      founderUserId: 'founder-user-1',
      founderIdentity: FOUNDER_EMAIL,
    });
  });

  it('keeps direct LinkedIn execution inactive instead of silently falling back', async () => {
    const res = await request(buildApp())
      .post('/automation/conveyor/founder-content/publish-now')
      .set('Authorization', BEARER)
      .send({ proposal: {}, approval_id: 'fca:approval-1' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(expect.objectContaining({
      ok: false,
      code: 'DIRECT_LINKEDIN_TRANSPORT_INACTIVE',
      activeTransport: 'buffer',
      published: false,
    }));
    expect(mockAuthoritativeBufferSchedule).not.toHaveBeenCalled();
  });
});
