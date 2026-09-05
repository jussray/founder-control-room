import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FounderContentApprovalRepository } from '../founderContentApprovalStore.js';

const require = createRequire(import.meta.url);
const { canonicalChiefIdentity, hashPublicPayload } = require('../../../tools/zapier/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, any>;
  hashPublicPayload: (value: unknown) => string;
};

const { mockTemporalPublish } = vi.hoisted(() => ({ mockTemporalPublish: vi.fn() }));
vi.mock('../temporallyGovernedFounderContentExecutor.js', () => ({
  dispatchTemporallyGovernedFounderContentPublishNow: mockTemporalPublish,
}));

import { dispatchAuthoritativeFounderContentPublishNow } from '../authoritativeFounderContentPublisher.js';

const PROPOSAL_HASH = 'a'.repeat(64);
const AUTHORIZATION_HASH = 'c'.repeat(64);
const TEST_PROPOSAL = {
  proposal_hash: PROPOSAL_HASH,
  public_payload: { platform: 'linkedin', draft_text: 'Exact approved copy.' },
};
const PUBLIC_PAYLOAD_HASH = hashPublicPayload(canonicalChiefIdentity(TEST_PROPOSAL).public_payload);
const STORED_APPROVAL = {
  approval_id: 'fca:approval-1',
  proposal_hash: PROPOSAL_HASH,
  public_payload_hash: PUBLIC_PAYLOAD_HASH,
  current_you: {
    authenticated: true,
    source: 'current_authenticated_founder',
    intent_id: 'intent-1',
    intent_version: 3,
    observed_at: '2026-08-19T07:30:00.000Z',
    supersedes_stale_content_intent: true,
  },
};

type ApprovalResult = Awaited<ReturnType<FounderContentApprovalRepository['claim']>>;

function repository(
  readResult: ApprovalResult,
  claimResult: ApprovalResult = readResult,
): FounderContentApprovalRepository {
  return {
    issue: vi.fn(async () => true),
    readCurrent: vi.fn(async () => readResult),
    claim: vi.fn(async () => claimResult),
  };
}

function request() {
  return {
    proposal: TEST_PROPOSAL,
    approval_id: 'fca:approval-1',
    confirmation: {
      confirm_publication: true,
      authorization_hash: AUTHORIZATION_HASH,
      public_payload_hash: PUBLIC_PAYLOAD_HASH,
      truth_context_hash: 'd'.repeat(64),
    },
  };
}

function publishedResult() {
  return {
    ok: true,
    code: 'PUBLISHED',
    status: 200,
    contract: 'fcr/first-party-founder-content-publish@v1',
    truthState: 'PUBLISHED',
    published: true,
    retrySafe: false,
    freshApprovalMayRetry: false,
    executionId: 'execution-1',
    receipt: {},
    providerEvidence: {},
    reasons: [],
    temporalTruth: {},
    temporalAnalytics: {},
  };
}

function preflightBlockedResult() {
  return {
    ...publishedResult(),
    ok: false,
    code: 'INVALID_AUTHORIZATION',
    status: 409,
    truthState: 'BLOCKED',
    published: false,
    freshApprovalMayRetry: true,
    executionId: null,
    receipt: null,
    reasons: ['temporal preflight failed'],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTemporalPublish.mockResolvedValue(publishedResult());
});

describe('authoritative founder-content publisher', () => {
  it('uses only current FCR approval state and claims it at the provider boundary', async () => {
    const successfulApproval: ApprovalResult = {
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    };
    const store = repository(successfulApproval);
    const providerFetch = vi.fn(async () => new Response(null, { status: 200 }));
    mockTemporalPublish.mockImplementationOnce(async (
      _input: unknown,
      executorOptions: { fetchImpl?: typeof fetch },
    ) => {
      await executorOptions.fetchImpl?.('https://api.linkedin.com/rest/posts', { method: 'POST' });
      return publishedResult();
    });
    const forged = {
      ...request(),
      approval: { approval_id: 'forged-caller-object', publish_anything: true },
    } as ReturnType<typeof request> & { approval: Record<string, unknown> };

    const result = await dispatchAuthoritativeFounderContentPublishNow(forged, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: '2026-08-19T07:40:00.000Z',
      claimNow: '2026-08-19T07:40:01.000Z',
      approvalRepository: store,
      fetchImpl: providerFetch as unknown as typeof fetch,
    });

    const readCurrentMock = vi.mocked(store.readCurrent!);
    const claimMock = vi.mocked(store.claim);
    expect(result.published).toBe(true);
    expect(readCurrentMock).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    }));
    expect(claimMock).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
      consumedBy: 'founder@example.com',
      now: '2026-08-19T07:40:01.000Z',
    }));
    expect(mockTemporalPublish).toHaveBeenCalledWith(expect.objectContaining({
      approval: STORED_APPROVAL,
      current_you: expect.objectContaining({
        authenticated: true,
        source: 'current_authenticated_founder',
        intent_id: 'intent-1',
        intent_version: 3,
      }),
    }), expect.objectContaining({
      executedBy: 'founder@example.com',
      fetchImpl: expect.any(Function),
    }));
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(readCurrentMock.mock.invocationCallOrder[0]).toBeLessThan(mockTemporalPublish.mock.invocationCallOrder[0]);
    expect(mockTemporalPublish.mock.invocationCallOrder[0]).toBeLessThan(claimMock.mock.invocationCallOrder[0]);
    expect(claimMock.mock.invocationCallOrder[0]).toBeLessThan(providerFetch.mock.invocationCallOrder[0]);
    expect(JSON.stringify(mockTemporalPublish.mock.calls)).not.toContain('forged-caller-object');
  });

  it('stops before temporal/provider execution when authoritative approval is not current', async () => {
    const store = repository({
      ok: false,
      code: 'APPROVAL_NOT_CURRENT',
      reason: 'authoritative approval is already consumed',
    });

    const result = await dispatchAuthoritativeFounderContentPublishNow(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: '2026-08-19T07:40:00.000Z',
      approvalRepository: store,
    });

    expect(result.ok).toBe(false);
    expect(result.truthState).toBe('BLOCKED');
    expect(result.freshApprovalMayRetry).toBe(true);
    expect(store.readCurrent).toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(mockTemporalPublish).not.toHaveBeenCalled();
  });

  it('rejects missing exact-copy confirmation before reading or claiming authority', async () => {
    const successfulApproval: ApprovalResult = {
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    };
    const store = repository(successfulApproval);

    const result = await dispatchAuthoritativeFounderContentPublishNow({
      ...request(),
      confirmation: { ...request().confirmation, confirm_publication: false },
    }, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      approvalRepository: store,
    });

    expect(result.ok).toBe(false);
    expect(store.readCurrent).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(mockTemporalPublish).not.toHaveBeenCalled();
  });

  it('rejects a mistyped copy hash before the approval repository is touched', async () => {
    const successfulApproval: ApprovalResult = {
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    };
    const store = repository(successfulApproval);

    const result = await dispatchAuthoritativeFounderContentPublishNow({
      ...request(),
      confirmation: { ...request().confirmation, public_payload_hash: 'f'.repeat(64) },
    }, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      approvalRepository: store,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('public payload confirmation does not match');
    expect(store.readCurrent).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(mockTemporalPublish).not.toHaveBeenCalled();
  });

  it('does not consume approval when temporal or downstream preflight blocks before provider fetch', async () => {
    const successfulApproval: ApprovalResult = {
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    };
    const store = repository(successfulApproval);
    const providerFetch = vi.fn();
    mockTemporalPublish.mockResolvedValueOnce(preflightBlockedResult());

    const result = await dispatchAuthoritativeFounderContentPublishNow(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: '2026-08-19T07:40:00.000Z',
      claimNow: '2026-08-19T07:40:01.000Z',
      approvalRepository: store,
      fetchImpl: providerFetch as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(store.readCurrent).toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('blocks with zero provider requests if the final atomic claim fails after preflight', async () => {
    const preview: ApprovalResult = {
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    };
    const store = repository(preview, {
      ok: false,
      code: 'APPROVAL_NOT_CURRENT',
      reason: 'approval was revoked concurrently',
    });
    const providerFetch = vi.fn();
    mockTemporalPublish.mockImplementationOnce(async (
      _input: unknown,
      executorOptions: { fetchImpl?: typeof fetch },
    ) => {
      try {
        await executorOptions.fetchImpl?.('https://api.linkedin.com/rest/posts', { method: 'POST' });
      } catch {
        // The real first-party executor catches this boundary failure and finalizes its reservation as failed.
      }
      return {
        ...publishedResult(),
        ok: false,
        code: 'PROVIDER_REJECTED',
        status: 502,
        truthState: 'FAILED',
        published: false,
        freshApprovalMayRetry: true,
        receipt: null,
        providerEvidence: { auditPersisted: true },
        reasons: ['first-party publication failed'],
      };
    });

    const result = await dispatchAuthoritativeFounderContentPublishNow(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: '2026-08-19T07:40:00.000Z',
      claimNow: '2026-08-19T07:40:01.000Z',
      approvalRepository: store,
      fetchImpl: providerFetch as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_AUTHORIZATION');
    expect(result.truthState).toBe('BLOCKED');
    expect(result.published).toBe(false);
    expect(result.executionId).toBe('execution-1');
    expect(result.providerEvidence).toMatchObject({
      auditPersisted: true,
      providerWriteAttempted: false,
      finalApprovalClaimed: false,
    });
    expect(store.claim).toHaveBeenCalledTimes(1);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
