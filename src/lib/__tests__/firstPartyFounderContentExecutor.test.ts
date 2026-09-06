import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  FIRST_PARTY_FOUNDER_PUBLISH_ACTION,
  dispatchFirstPartyFounderContentPublishNow,
  type FounderContentExecutionStore,
  type FounderContentReservationInput,
  type FirstPartyFounderPublishInput,
} from '../firstPartyFounderContentExecutor.js';

const require = createRequire(import.meta.url);
const {
  authorizeFounderContentPublication,
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('../../../tools/zapier/founder-content-authorization-contract.cjs') as {
  authorizeFounderContentPublication: (input: Record<string, unknown>) => Record<string, any>;
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, any>;
  hashPublicPayload: (value: unknown) => string;
};

const SOURCE_SHA = 'a'.repeat(40);
const AUTHOR = 'urn:li:person:ray';
const POST_URN = 'urn:li:share:123456789';
const ACCESS_TOKEN = 'secret-test-token-never-emit';
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#quality-gate`;

function proposal() {
  const value: Record<string, any> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-17T14:00:00.000Z',
      expires_at: '2026-08-17T16:00:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text:
        'Built a small but important upgrade into my AI stack today. The system now preserves exact approved copy and only calls a LinkedIn post published after provider readback.',
      public_claims: [
        {
          claim_id: 'provider-readback',
          text: 'Published becomes true only after provider readback.',
          truth_state: 'verified',
          public_safe: true,
          evidence_ref: EVIDENCE_REF,
          evidence_scope: 'provider-receipt-boundary',
        },
      ],
      proof_link: null,
      proof_link_policy: 'editorial_optional',
    },
    internal_evidence: {
      verified: true,
      ref: EVIDENCE_REF,
      kind: 'github-exact-head-contract',
      digest: 'b'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/founder-control-room',
      source_commit_sha: SOURCE_SHA,
      proves: ['provider-receipt-boundary'],
      does_not_prove: ['provider-publication'],
    },
    sauce_guard: {
      scanner_version: 'sauce-guard-v1',
      private_implementation_removed: true,
      secret_material_removed: true,
      raw_diff_removed: true,
      private_metrics_removed: true,
      unreleased_roadmap_removed: true,
      customer_private_data_removed: true,
      security_sensitive_details_removed: true,
      public_claims_only: true,
      independent_scan_passed: true,
      blocked_categories: [],
      withheld_categories: ['private-implementation'],
    },
    authority: {
      proposal_only: true,
      publish_authorized: false,
      current_you_source: 'current_authenticated_founder',
      current_you_intent_id: 'founder-post-intent-1',
      current_you_intent_version: 7,
      current_you_observed_at: '2026-08-17T13:59:00.000Z',
      proposal_evaluated_at: '2026-08-17T14:00:00.000Z',
      future_you_advisory_only: true,
      historical_content_intent_authoritative: false,
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
  };
  value.proposal_hash = hashPublicPayload(canonicalChiefIdentity(value));
  return value;
}

function approval(proposalValue = proposal()) {
  const identity = canonicalChiefIdentity(proposalValue);
  return {
    approval_id: 'founder-post-approval-1',
    proposal_hash: proposalValue.proposal_hash,
    public_payload_hash: hashPublicPayload(identity.public_payload),
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'founder-post-intent-1',
      intent_version: 7,
      observed_at: '2026-08-17T15:00:00.000Z',
      supersedes_stale_content_intent: true,
    },
    channels: ['linkedin'],
    revoked: false,
    used: false,
    approved_at: '2026-08-17T15:00:00.000Z',
    expires_at: '2026-08-17T15:30:00.000Z',
  };
}

function input(overrides: Partial<FirstPartyFounderPublishInput> = {}): FirstPartyFounderPublishInput {
  const proposalValue = proposal();
  const approvalValue = approval(proposalValue);
  const canonical = authorizeFounderContentPublication({
    proposal: proposalValue,
    approval: approvalValue,
    now: '2026-08-17T15:05:00.000Z',
  });
  return {
    proposal: proposalValue,
    approval: approvalValue,
    confirmation: {
      confirm_publication: true,
      authorization_hash: canonical.authorization_hash,
      public_payload_hash: canonical.public_payload_hash,
    },
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'founder-post-intent-1',
      intent_version: 7,
      observed_at: '2026-08-17T15:04:00.000Z',
    },
    ...overrides,
  };
}

function env(): NodeJS.ProcessEnv {
  return {
    LINKEDIN_ACCESS_TOKEN: ACCESS_TOKEN,
    LINKEDIN_AUTHOR_URN: AUTHOR,
    LINKEDIN_API_VERSION: '202607',
  };
}

class MemoryStore implements FounderContentExecutionStore {
  reservations = new Map<string, { executionId: string; request: Record<string, unknown> }>();
  finalized: Array<{
    executionId: string;
    status: 'succeeded' | 'failed';
    result: Record<string, unknown>;
    success: boolean;
  }> = [];
  finalizeSucceeds = true;

  async reserve(request: FounderContentReservationInput) {
    if (this.reservations.has(request.idempotencyKey)) {
      return {
        ok: false as const,
        code: 'ACTION_ALREADY_RESERVED' as const,
        reason: 'already reserved',
      };
    }
    const executionId = `execution-${this.reservations.size + 1}`;
    this.reservations.set(request.idempotencyKey, { executionId, request: request.request });
    return { ok: true as const, executionId, projectId: 'project-1' };
  }

  async finalize(
    executionId: string,
    status: 'succeeded' | 'failed',
    result: Record<string, unknown>,
    success: boolean,
  ) {
    this.finalized.push({ executionId, status, result, success });
    return this.finalizeSucceeds;
  }
}

function successFetch(expectedCopy: string) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { 'x-restli-id': POST_URN, 'x-restli-request-id': 'request-1' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: POST_URN,
          author: AUTHOR,
          commentary: expectedCopy,
          lifecycleState: 'PUBLISHED',
          visibility: 'PUBLIC',
          publishedAt: 1_786_990_000_000,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
}

describe('direct first-party founder LinkedIn execution', () => {
  it('preserves exact approved copy, allows editorially optional proof, reserves once, and records publication only after readback', async () => {
    const request = input();
    const exactCopy = (request.proposal.public_payload as Record<string, string>).draft_text;
    const store = new MemoryStore();
    const fetchMock = successFetch(exactCopy);

    const result = await dispatchFirstPartyFounderContentPublishNow(request, {
      env: env(),
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
      store,
    });

    expect(result.ok).toBe(true);
    expect(result.code).toBe('PUBLISHED');
    expect(result.published).toBe(true);
    expect(result.truthState).toBe('PUBLISHED');
    expect(result.receipt?.externalPostId).toBe(POST_URN);
    expect(result.receipt?.proofUrls).toEqual([]);
    expect(store.reservations.size).toBe(1);
    expect(store.finalized).toHaveLength(1);
    expect(store.finalized[0]).toMatchObject({ status: 'succeeded', success: true });
    expect(store.finalized[0].result).toMatchObject({ published: true, truthState: 'PUBLISHED' });

    const [, writeInit] = fetchMock.mock.calls[0];
    const writeBody = JSON.parse(writeInit.body);
    expect(writeBody.commentary).toBe(exactCopy);
    expect(writeBody.commentary).not.toContain('https://');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(store.finalized)).not.toContain(ACCESS_TOKEN);
  });

  it('blocks a second dispatch of the same exact approval before another provider call', async () => {
    const request = input();
    const exactCopy = (request.proposal.public_payload as Record<string, string>).draft_text;
    const store = new MemoryStore();
    const firstFetch = successFetch(exactCopy);

    const first = await dispatchFirstPartyFounderContentPublishNow(request, {
      env: env(),
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: firstFetch as unknown as typeof fetch,
      store,
    });
    expect(first.published).toBe(true);

    const secondFetch = vi.fn();
    const second = await dispatchFirstPartyFounderContentPublishNow(request, {
      env: env(),
      now: '2026-08-17T15:06:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: secondFetch as unknown as typeof fetch,
      store,
    });

    expect(second.code).toBe('ACTION_ALREADY_RESERVED');
    expect(second.published).toBe(false);
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('rejects changed confirmation, stale Current You, and incomplete LinkedIn configuration before reservation', async () => {
    const cases: Array<{
      request: FirstPartyFounderPublishInput;
      testEnv: NodeJS.ProcessEnv;
      expected: string;
    }> = [
      {
        request: input({ confirmation: { confirm_publication: true, authorization_hash: 'c'.repeat(64), public_payload_hash: 'd'.repeat(64) } }),
        testEnv: env(),
        expected: 'INVALID_AUTHORIZATION',
      },
      {
        request: input({ current_you: { authenticated: true, source: 'current_authenticated_founder', intent_id: 'founder-post-intent-1', intent_version: 7, observed_at: '2026-08-16T10:00:00.000Z' } }),
        testEnv: env(),
        expected: 'INVALID_AUTHORIZATION',
      },
      {
        request: input(),
        testEnv: { LINKEDIN_AUTHOR_URN: AUTHOR },
        expected: 'LINKEDIN_NOT_CONFIGURED',
      },
      {
        request: input(),
        testEnv: {
          LINKEDIN_ACCESS_TOKEN: ACCESS_TOKEN,
          LINKEDIN_AUTHOR_URN: AUTHOR,
          LINKEDIN_API_VERSION: '2026-07',
        },
        expected: 'LINKEDIN_NOT_CONFIGURED',
      },
    ];

    for (const testCase of cases) {
      const store = new MemoryStore();
      const fetchMock = vi.fn();
      const result = await dispatchFirstPartyFounderContentPublishNow(testCase.request, {
        env: testCase.testEnv,
        now: '2026-08-17T15:05:00.000Z',
        executedBy: 'founder@example.com',
        fetchImpl: fetchMock as unknown as typeof fetch,
        store,
      });
      expect(result.code).toBe(testCase.expected);
      expect(store.reservations.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('consumes the durable reservation and returns UNKNOWN after a 201 write whose readback is denied', async () => {
    const request = input();
    const store = new MemoryStore();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { 'x-restli-id': POST_URN } }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    const result = await dispatchFirstPartyFounderContentPublishNow(request, {
      env: env(),
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
      store,
    });

    expect(result.code).toBe('PROVIDER_OUTCOME_UNKNOWN');
    expect(result.truthState).toBe('UNKNOWN');
    expect(result.published).toBe(false);
    expect(result.retrySafe).toBe(false);
    expect(result.providerEvidence).toMatchObject({ postUrn: POST_URN, httpStatus: 403 });
    expect(store.finalized[0]).toMatchObject({ status: 'failed', success: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const retryFetch = vi.fn();
    const retry = await dispatchFirstPartyFounderContentPublishNow(request, {
      env: env(),
      now: '2026-08-17T15:06:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: retryFetch as unknown as typeof fetch,
      store,
    });
    expect(retry.code).toBe('ACTION_ALREADY_RESERVED');
    expect(retryFetch).not.toHaveBeenCalled();
  });

  it('returns UNKNOWN after provider 5xx without a blind second write', async () => {
    const store = new MemoryStore();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }));

    const result = await dispatchFirstPartyFounderContentPublishNow(input(), {
      env: env(),
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
      store,
    });

    expect(result.truthState).toBe('UNKNOWN');
    expect(result.retrySafe).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.finalized[0]).toMatchObject({ status: 'failed', success: false });
  });

  it('records explicit provider rejection as FAILED and requires a fresh approval', async () => {
    const store = new MemoryStore();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 }));

    const result = await dispatchFirstPartyFounderContentPublishNow(input(), {
      env: env(),
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
      store,
    });

    expect(result.code).toBe('PROVIDER_REJECTED');
    expect(result.truthState).toBe('FAILED');
    expect(result.freshApprovalMayRetry).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it('keeps provider truth PUBLISHED if durable final receipt persistence fails and blocks retry', async () => {
    const request = input();
    const exactCopy = (request.proposal.public_payload as Record<string, string>).draft_text;
    const store = new MemoryStore();
    store.finalizeSucceeds = false;
    const fetchMock = successFetch(exactCopy);

    const result = await dispatchFirstPartyFounderContentPublishNow(request, {
      env: env(),
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      fetchImpl: fetchMock as unknown as typeof fetch,
      store,
    });

    expect(result.code).toBe('ACTION_AUDIT_INCOMPLETE');
    expect(result.truthState).toBe('PUBLISHED');
    expect(result.published).toBe(true);
    expect(result.retrySafe).toBe(false);
    expect(result.receipt?.externalPostId).toBe(POST_URN);
  });

  it('uses a distinct durable action type for direct publication', () => {
    expect(FIRST_PARTY_FOUNDER_PUBLISH_ACTION).toBe('publish_founder_content');
  });
});
