import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import type { FounderContentApprovalRepository } from '../founderContentApprovalStore.js';
import type { N8nFounderContentDispatchResult } from '../n8nFounderContentOrchestrator.js';
import type {
  PreparedProviderNeutralN8nFounderContent,
  PrepareProviderNeutralN8nFounderContentResult,
} from '../n8nProviderNeutralFounderContentPreparation.js';
import { dispatchAuthoritativeN8nFounderContent } from '../authoritativeN8nFounderContentPublisher.js';

const require = createRequire(import.meta.url);
const {
  authorizeFounderContentPublication,
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('../../../tools/zapier/founder-content-authorization-contract.cjs') as {
  authorizeFounderContentPublication: (input: Record<string, unknown>) => Record<string, unknown>;
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, any>;
  hashPublicPayload: (value: unknown) => string;
};

const SOURCE_SHA = 'd'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#quality-gate`;
const NOW = '2026-08-18T01:30:00.000Z';

function proposal(): Record<string, unknown> {
  const value: Record<string, unknown> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE_SHA },
    freshness: {
      issued_at: '2026-08-18T01:00:00.000Z',
      expires_at: '2026-08-18T02:30:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'Verified founder progress from an exact historical repository version without exposing private implementation details.',
      public_claims: [{
        claim_id: 'linkedin-proof-bound',
        text: 'The LinkedIn founder update was bound to a verified historical repository version.',
        truth_state: 'verified',
        public_safe: true,
        evidence_ref: EVIDENCE_REF,
        evidence_scope: 'provider-neutral-social-contract',
        temporal_class: 'historical_version',
        temporal_version: SOURCE_SHA,
      }],
      proof_link: null,
      proof_link_policy: 'editorial_optional',
    },
    internal_evidence: {
      verified: true,
      ref: EVIDENCE_REF,
      kind: 'github-exact-head-contract',
      digest: 'e'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/founder-control-room',
      source_commit_sha: SOURCE_SHA,
      proves: ['provider-neutral-social-contract'],
      does_not_prove: ['provider-runtime', 'publication', 'traction'],
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
      current_you_intent_id: 'founder-content-current',
      current_you_intent_version: 9,
      current_you_observed_at: '2026-08-18T01:05:00.000Z',
      proposal_evaluated_at: '2026-08-18T01:10:00.000Z',
      future_you_advisory_only: true,
      historical_content_intent_authoritative: false,
      analytics_feedback_authority: 'observation-only',
      analytics_can_authorize_publish: false,
      external_feedback_trusted_for_authority: false,
    },
  };
  value.proposal_hash = hashPublicPayload(canonicalChiefIdentity(value));
  return value;
}

function approval(proposed: Record<string, unknown>) {
  const publicPayload = proposed.public_payload as Record<string, unknown>;
  return {
    approval_id: 'fca:buffer-test-1',
    proposal_hash: proposed.proposal_hash,
    public_payload_hash: hashPublicPayload(publicPayload),
    channels: ['linkedin'],
    approved_at: '2026-08-18T01:20:00.000Z',
    expires_at: '2026-08-18T02:10:00.000Z',
    revoked: false,
    used: false,
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'publish-linkedin-current',
      intent_version: 10,
      observed_at: '2026-08-18T01:19:00.000Z',
      supersedes_stale_content_intent: true,
    },
  };
}

const TEST_PROPOSAL = proposal();
const STORED_APPROVAL = approval(TEST_PROPOSAL);
const CANONICAL_AUTHORIZATION = authorizeFounderContentPublication({
  proposal: TEST_PROPOSAL,
  approval: STORED_APPROVAL,
  now: NOW,
});
const PROPOSAL_HASH = String(TEST_PROPOSAL.proposal_hash);
const PUBLIC_PAYLOAD_HASH = String(STORED_APPROVAL.public_payload_hash);
const AUTHORIZATION_HASH = String(CANONICAL_AUTHORIZATION.authorization_hash);

const READY_ENV = {
  N8N_FOUNDER_CONTENT_ENABLED: 'true',
  N8N_FOUNDER_CONTENT_WEBHOOK_URL: 'https://n8n.example/webhook/founder-content',
  N8N_FOUNDER_CONTENT_BEARER_TOKEN: 'server-only-test-token',
  N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer',
};

type ApprovalResult = Awaited<ReturnType<FounderContentApprovalRepository['claim']>>;

function repository(claimResult: ApprovalResult, readResult: ApprovalResult = claimResult): FounderContentApprovalRepository {
  return {
    issue: vi.fn(async () => true),
    readCurrent: vi.fn(async () => readResult),
    claim: vi.fn(async () => claimResult),
  };
}

function currentApproval(): ApprovalResult {
  return {
    ok: true,
    approval: STORED_APPROVAL,
    approvalId: 'fca:buffer-test-1',
    authorizationHash: AUTHORIZATION_HASH,
    publicPayloadHash: PUBLIC_PAYLOAD_HASH,
  };
}

function request() {
  return {
    proposal: TEST_PROPOSAL,
    approval_id: 'fca:buffer-test-1',
    n8n_provider: 'buffer',
    confirmation: {
      confirm_publication: true,
      authorization_hash: AUTHORIZATION_HASH,
      public_payload_hash: PUBLIC_PAYLOAD_HASH,
    },
  };
}

function dispatched(): N8nFounderContentDispatchResult {
  return {
    ok: true,
    code: 'DISPATCHED',
    status: 202,
    request: null,
    receipt: null,
    reasons: [],
  };
}

function preparedHarness(result: N8nFounderContentDispatchResult = dispatched()) {
  const dispatch = vi.fn(async () => result);
  const abort = vi.fn(async () => true);
  const prepared: PreparedProviderNeutralN8nFounderContent = {
    prepared: true,
    request: null as never,
    executionId: '22222222-2222-4222-8222-222222222222',
    dispatch,
    abort,
  };
  const prepare = vi.fn(async (): Promise<PrepareProviderNeutralN8nFounderContentResult> => prepared);
  return { prepare, dispatch, abort };
}

function preparationFailure(
  code: N8nFounderContentDispatchResult['code'],
): PrepareProviderNeutralN8nFounderContentResult {
  return {
    prepared: false,
    result: {
      ok: false,
      code,
      status: code === 'INVALID_ENVELOPE' ? 400 : 503,
      request: null,
      receipt: null,
      reasons: [`synthetic ${code} preparation failure`],
    },
  };
}

describe('authoritative n8n founder-content publisher', () => {
  it('reserves downstream state before atomically claiming approval, then dispatches only after the claim succeeds', async () => {
    const store = repository(currentApproval());
    const prepared = preparedHarness();

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      env: READY_ENV,
      approvalRepository: store,
      prepare: prepared.prepare,
    });

    expect(result.ok).toBe(true);
    expect(store.readCurrent).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      approvalId: 'fca:buffer-test-1',
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
    }));
    expect(prepared.prepare).toHaveBeenCalledWith({
      n8n_provider: 'buffer',
      proposal: TEST_PROPOSAL,
      approval: STORED_APPROVAL,
      now: NOW,
    }, expect.objectContaining({
      env: READY_ENV,
      executedBy: 'founder@example.com',
    }));
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-user-1',
      approvalId: 'fca:buffer-test-1',
      proposalHash: PROPOSAL_HASH,
      authorizationHash: AUTHORIZATION_HASH,
      publicPayloadHash: PUBLIC_PAYLOAD_HASH,
      consumedBy: 'founder@example.com',
    }));
    expect(prepared.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      (store.claim as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
    expect((store.claim as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]).toBeLessThan(
      prepared.dispatch.mock.invocationCallOrder[0],
    );
    expect(prepared.abort).not.toHaveBeenCalled();
    expect(prepared.dispatch).toHaveBeenCalledTimes(1);
  });

  it('fails an invalid server-owned envelope without consuming one-shot approval', async () => {
    const store = repository(currentApproval());
    const prepare = vi.fn(async () => preparationFailure('INVALID_ENVELOPE'));

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      env: READY_ENV,
      approvalRepository: store,
      prepare,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_ENVELOPE');
    expect(result.reasons.join(' ')).toContain('did not consume the one-shot approval');
    expect(store.readCurrent).toHaveBeenCalledTimes(1);
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('does not consume approval when cadence or execution reservation preparation fails', async () => {
    const store = repository(currentApproval());
    const prepare = vi.fn(async () => preparationFailure('ACTION_RESERVATION_FAILED'));

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      env: READY_ENV,
      approvalRepository: store,
      prepare,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('ACTION_RESERVATION_FAILED');
    expect(result.reasons.join(' ')).toContain('did not consume the one-shot approval');
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('aborts the prepared execution without provider dispatch when the atomic approval claim loses the race', async () => {
    const store = repository({
      ok: false,
      code: 'APPROVAL_NOT_CURRENT',
      reason: 'authoritative approval is expired, revoked, or already consumed',
    }, currentApproval());
    const prepared = preparedHarness();

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      env: READY_ENV,
      approvalRepository: store,
      prepare: prepared.prepare,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_AUTHORIZATION');
    expect(prepared.abort).toHaveBeenCalledTimes(1);
    expect(prepared.dispatch).not.toHaveBeenCalled();
  });

  it('rejects caller-supplied approval JSON before the authority store is touched', async () => {
    const store = repository(currentApproval());
    const prepared = preparedHarness();
    const forged = {
      ...request(),
      approval: { approval_id: 'caller-forged', publish_anything: true },
    };

    const result = await dispatchAuthoritativeN8nFounderContent(forged, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      env: READY_ENV,
      approvalRepository: store,
      prepare: prepared.prepare,
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('caller-supplied approval objects are forbidden');
    expect(store.readCurrent).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(prepared.prepare).not.toHaveBeenCalled();
  });

  it('does not burn one-shot authority when n8n transport is disabled', async () => {
    const store = repository(currentApproval());
    const prepared = preparedHarness();

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      env: {},
      approvalRepository: store,
      prepare: prepared.prepare,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('ORCHESTRATION_DISABLED');
    expect(result.reasons.join(' ')).toContain('did not consume the one-shot approval');
    expect(store.readCurrent).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(prepared.prepare).not.toHaveBeenCalled();
  });

  it('does not consume approval for a provider/platform mismatch', async () => {
    const store = repository(currentApproval());
    const prepared = preparedHarness();

    const result = await dispatchAuthoritativeN8nFounderContent({
      ...request(),
      n8n_provider: 'tiktok',
    }, {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      env: { ...READY_ENV, N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS: 'buffer,tiktok' },
      approvalRepository: store,
      prepare: prepared.prepare,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_ENVELOPE');
    expect(store.readCurrent).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(prepared.prepare).not.toHaveBeenCalled();
  });

  it('rechecks atomically after downstream preparation and stops before n8n when approval changes or is consumed', async () => {
    const store = repository({
      ok: false,
      code: 'APPROVAL_NOT_CURRENT',
      reason: 'authoritative approval is expired, revoked, or already consumed',
    }, currentApproval());
    const prepared = preparedHarness();

    const result = await dispatchAuthoritativeN8nFounderContent(request(), {
      founderUserId: 'founder-user-1',
      founderIdentity: 'founder@example.com',
      now: NOW,
      env: READY_ENV,
      approvalRepository: store,
      prepare: prepared.prepare,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_AUTHORIZATION');
    expect(store.readCurrent).toHaveBeenCalledTimes(1);
    expect(prepared.prepare).toHaveBeenCalledTimes(1);
    expect(store.claim).toHaveBeenCalledTimes(1);
    expect(prepared.abort).toHaveBeenCalledTimes(1);
    expect(prepared.dispatch).not.toHaveBeenCalled();
  });
});
