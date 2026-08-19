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

function repository(result: Awaited<ReturnType<FounderContentApprovalRepository['claim']>>): FounderContentApprovalRepository {
  return {
    issue: vi.fn(async () => true),
    claim: vi.fn(async () => result),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockTemporalPublish.mockResolvedValue({
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
  });
});

describe('authoritative founder-content publisher', () => {
  it('injects only the approval claimed from FCR authority storage', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });
    const forged = {
      ...request(),
      approval: { approval_id: 'forged-caller-object', publish_anything: true },
    } as ReturnType<typeof request> & { approval: Record<string, unknown> };

    const result = await dispatchAuthoritativeFounderContentPublishNow(forged, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: '2026-08-19T07:40:00.000Z',
      approvalRepository: store,
    });

    expect(result.published).toBe(true);
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
      consumedBy: 'founder@example.com',
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
    }));
    expect(JSON.stringify(mockTemporalPublish.mock.calls)).not.toContain('forged-caller-object');
  });

  it('stops before the provider executor when authoritative approval cannot be claimed', async () => {
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
    expect(mockTemporalPublish).not.toHaveBeenCalled();
  });

  it('rejects missing exact-copy confirmation before claiming authority', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });

    const result = await dispatchAuthoritativeFounderContentPublishNow({
      ...request(),
      confirmation: { ...request().confirmation, confirm_publication: false },
    }, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      approvalRepository: store,
    });

    expect(result.ok).toBe(false);
    expect(store.claim).not.toHaveBeenCalled();
    expect(mockTemporalPublish).not.toHaveBeenCalled();
  });

  it('rejects a mistyped copy hash before the approval repository is touched', async () => {
    const store = repository({
      ok: true,
      approval: STORED_APPROVAL,
      approvalId: 'fca:approval-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    });

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
    expect(store.claim).not.toHaveBeenCalled();
    expect(mockTemporalPublish).not.toHaveBeenCalled();
  });
});
