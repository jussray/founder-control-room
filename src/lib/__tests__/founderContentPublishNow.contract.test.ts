import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

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
const {
  authorizeFounderContentPublishNow,
  buildFounderContentProviderWriteEnvelope,
  recordFounderContentProviderReceipt,
} = require('../../../tools/zapier/founder-content-publish-now-contract.cjs') as {
  authorizeFounderContentPublishNow: (input: Record<string, unknown>) => Record<string, any>;
  buildFounderContentProviderWriteEnvelope: (input: Record<string, unknown>) => Record<string, any>;
  recordFounderContentProviderReceipt: (input: Record<string, unknown>) => Record<string, any>;
};

const SOURCE_SHA = 'a'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE_SHA}#quality-gate`;
const PROVIDER_ACCOUNT = 'tenant-a1c32d2a-4041-7073-ceaf-462823f89b0c-linkedin-person-ni4D3mp9lr';

function makeProposal() {
  const proposal: Record<string, any> = {
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
      draft_text: 'Built a small but important upgrade into my AI stack today. Building in public. Keeping the sauce private.',
      public_claims: [
        {
          claim_id: 'publish-truth-boundary',
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
  proposal.proposal_hash = hashPublicPayload(canonicalChiefIdentity(proposal));
  return proposal;
}

function makeApproval(proposal = makeProposal()) {
  const identity = canonicalChiefIdentity(proposal);
  return {
    approval_id: 'founder-post-approval-1',
    proposal_hash: proposal.proposal_hash,
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

function makeCurrentYou(overrides: Record<string, unknown> = {}) {
  return {
    authenticated: true,
    source: 'current_authenticated_founder',
    intent_id: 'founder-post-intent-1',
    intent_version: 7,
    observed_at: '2026-08-17T15:04:00.000Z',
    ...overrides,
  };
}

function makePublishAuthorization(overrides: Record<string, unknown> = {}) {
  const proposal = makeProposal();
  const approval = makeApproval(proposal);
  const canonical = authorizeFounderContentPublication({ proposal, approval, now: '2026-08-17T15:05:00.000Z' });
  return authorizeFounderContentPublishNow({
    proposal,
    approval,
    confirmation: {
      confirm_publication: true,
      authorization_hash: canonical.authorization_hash,
      public_payload_hash: canonical.public_payload_hash,
    },
    provider: 'cambiante',
    provider_account_id: PROVIDER_ACCOUNT,
    channel: 'linkedin',
    current_you: makeCurrentYou(),
    now: '2026-08-17T15:05:00.000Z',
    ...overrides,
  });
}

describe('founder content publish-now contract', () => {
  it('keeps scheduled review as the canonical default and adds publish-now only after exact confirmation', () => {
    const proposal = makeProposal();
    const approval = makeApproval(proposal);
    const canonical = authorizeFounderContentPublication({ proposal, approval, now: '2026-08-17T15:05:00.000Z' });

    expect(canonical.state).toBe('authorized-for-scheduled-review');
    expect(canonical.authority.execution_mode).toBe('schedule_review_window');
    expect(canonical.authority.share_now_allowed).toBe(false);

    const publishNow = makePublishAuthorization();
    expect(publishNow.state).toBe('authorized-for-publish');
    expect(publishNow.execution_mode).toBe('publish_now');
    expect(publishNow.authority.share_now_authorized).toBe(true);
    expect(publishNow.authority.external_write_authorized).toBe(true);
    expect(publishNow.authority.provider_receipt_required).toBe(true);
    expect(publishNow.authority.one_shot).toBe(true);
  });

  it('rejects publish-now without explicit publication confirmation', () => {
    const proposal = makeProposal();
    const approval = makeApproval(proposal);
    const canonical = authorizeFounderContentPublication({ proposal, approval, now: '2026-08-17T15:05:00.000Z' });

    expect(() => authorizeFounderContentPublishNow({
      proposal,
      approval,
      confirmation: {
        confirm_publication: false,
        authorization_hash: canonical.authorization_hash,
        public_payload_hash: canonical.public_payload_hash,
      },
      provider: 'cambiante',
      provider_account_id: PROVIDER_ACCOUNT,
      channel: 'linkedin',
      current_you: makeCurrentYou(),
      now: '2026-08-17T15:05:00.000Z',
    })).toThrow(/confirm_publication must be true/);
  });

  it('rejects FutureYou, changed intent, stale/future intent, and an observation older than approval', () => {
    for (const current_you of [
      makeCurrentYou({ source: 'future_you' }),
      makeCurrentYou({ intent_id: 'different-intent' }),
      makeCurrentYou({ intent_version: 8 }),
      makeCurrentYou({ observed_at: '2026-08-16T14:00:00.000Z' }),
      makeCurrentYou({ observed_at: '2026-08-17T15:20:00.000Z' }),
      makeCurrentYou({ observed_at: '2026-08-17T14:59:00.000Z' }),
    ]) {
      const proposal = makeProposal();
      const approval = makeApproval(proposal);
      const canonical = authorizeFounderContentPublication({ proposal, approval, now: '2026-08-17T15:05:00.000Z' });
      expect(() => authorizeFounderContentPublishNow({
        proposal,
        approval,
        confirmation: {
          confirm_publication: true,
          authorization_hash: canonical.authorization_hash,
          public_payload_hash: canonical.public_payload_hash,
        },
        provider: 'cambiante',
        provider_account_id: PROVIDER_ACCOUNT,
        channel: 'linkedin',
        current_you,
        now: '2026-08-17T15:05:00.000Z',
      })).toThrow();
    }
  });

  it('rejects changed copy and mismatched exact approval hashes', () => {
    const proposal = makeProposal();
    const approval = makeApproval(proposal);
    const canonical = authorizeFounderContentPublication({ proposal, approval, now: '2026-08-17T15:05:00.000Z' });

    expect(() => authorizeFounderContentPublishNow({
      proposal: {
        ...proposal,
        public_payload: { ...proposal.public_payload, draft_text: `${proposal.public_payload.draft_text} MUTATED` },
      },
      approval,
      confirmation: {
        confirm_publication: true,
        authorization_hash: canonical.authorization_hash,
        public_payload_hash: canonical.public_payload_hash,
      },
      provider: 'cambiante',
      provider_account_id: PROVIDER_ACCOUNT,
      channel: 'linkedin',
      current_you: makeCurrentYou(),
      now: '2026-08-17T15:05:00.000Z',
    })).toThrow(/proposal_hash does not match canonical Chief v1 proposal identity/);

    expect(() => authorizeFounderContentPublishNow({
      proposal,
      approval,
      confirmation: {
        confirm_publication: true,
        authorization_hash: 'c'.repeat(64),
        public_payload_hash: canonical.public_payload_hash,
      },
      provider: 'cambiante',
      provider_account_id: PROVIDER_ACCOUNT,
      channel: 'linkedin',
      current_you: makeCurrentYou(),
      now: '2026-08-17T15:05:00.000Z',
    })).toThrow(/confirmation authorization_hash must match/);
  });

  it('binds the publish authorization to exact provider, account, channel, and copy', () => {
    const publishNow = makePublishAuthorization();
    expect(publishNow.destination).toEqual({
      provider: 'cambiante',
      provider_account_id: PROVIDER_ACCOUNT,
      channel: 'linkedin',
    });
    expect(publishNow.idempotency_key).toMatch(/^[0-9a-f]{64}$/);

    for (const tampered of [
      { ...publishNow, destination: { ...publishNow.destination, provider: 'buffer' } },
      { ...publishNow, destination: { ...publishNow.destination, provider_account_id: 'different-account' } },
      { ...publishNow, content: { ...publishNow.content, text: `${publishNow.content.text} changed` } },
    ]) {
      expect(() => buildFounderContentProviderWriteEnvelope({
        publish_authorization: tampered,
        now: '2026-08-17T15:06:00.000Z',
      })).toThrow(/mutated|idempotency_key/);
    }
  });

  it('builds a public-only one-shot provider write envelope and blocks replay', () => {
    const publishNow = makePublishAuthorization();
    const envelope = buildFounderContentProviderWriteEnvelope({
      publish_authorization: publishNow,
      now: '2026-08-17T15:06:00.000Z',
    });

    expect(envelope.operation).toBe('publish_now');
    expect(envelope.destination.provider_account_id).toBe(PROVIDER_ACCOUNT);
    expect(envelope.public_payload.text).toBe(publishNow.content.text);
    expect(envelope.authority.one_shot).toBe(true);
    expect(envelope.authority.provider_readback_required).toBe(true);
    expect(envelope.privacy.includes_private_lineage).toBe(false);
    expect(envelope.privacy.includes_credentials).toBe(false);
    expect(envelope.write_envelope_hash).toMatch(/^[0-9a-f]{64}$/);

    expect(() => buildFounderContentProviderWriteEnvelope({
      publish_authorization: publishNow,
      now: '2026-08-17T15:06:00.000Z',
      consumed_idempotency_keys: [publishNow.idempotency_key],
    })).toThrow(/replay is blocked/);
  });

  it('fails closed on expired or revoked authorization', () => {
    const proposal = makeProposal();
    const revokedApproval = { ...makeApproval(proposal), revoked: true };
    expect(() => authorizeFounderContentPublishNow({
      proposal,
      approval: revokedApproval,
      confirmation: { confirm_publication: true },
      provider: 'cambiante',
      provider_account_id: PROVIDER_ACCOUNT,
      channel: 'linkedin',
      current_you: makeCurrentYou(),
      now: '2026-08-17T15:05:00.000Z',
    })).toThrow(/approval is revoked/);

    const approval = makeApproval(proposal);
    expect(() => authorizeFounderContentPublishNow({
      proposal,
      approval,
      confirmation: { confirm_publication: true },
      provider: 'cambiante',
      provider_account_id: PROVIDER_ACCOUNT,
      channel: 'linkedin',
      current_you: makeCurrentYou({ observed_at: '2026-08-17T15:31:00.000Z' }),
      now: '2026-08-17T15:31:00.000Z',
    })).toThrow(/approval is stale|authorization is expired/);
  });

  it('returns FAILED for provider 4xx/5xx and UNKNOWN when readback is missing', () => {
    const publishNow = makePublishAuthorization();
    const envelope = buildFounderContentProviderWriteEnvelope({
      publish_authorization: publishNow,
      now: '2026-08-17T15:06:00.000Z',
    });

    const quotaFailure = recordFounderContentProviderReceipt({
      write_envelope: envelope,
      provider_result: {
        provider: 'cambiante',
        provider_account_id: PROVIDER_ACCOUNT,
        write_succeeded: false,
        readback_verified: false,
        status: 'failed',
        http_status: 402,
      },
      observed_at: '2026-08-17T15:07:00.000Z',
    });
    expect(quotaFailure.truth.published).toBe(false);
    expect(quotaFailure.truth.state).toBe('failed');

    const missingReadback = recordFounderContentProviderReceipt({
      write_envelope: envelope,
      provider_result: {
        provider: 'cambiante',
        provider_account_id: PROVIDER_ACCOUNT,
        write_succeeded: true,
        readback_verified: false,
        status: 'accepted',
        http_status: 202,
      },
      observed_at: '2026-08-17T15:07:00.000Z',
    });
    expect(missingReadback.truth.published).toBe(false);
    expect(missingReadback.truth.state).toBe('UNKNOWN');
    expect(missingReadback.truth.external_write_occurred).toBe(true);
  });

  it('marks published only after matching provider readback includes a post id and public URL', () => {
    const publishNow = makePublishAuthorization();
    const envelope = buildFounderContentProviderWriteEnvelope({
      publish_authorization: publishNow,
      now: '2026-08-17T15:06:00.000Z',
    });
    const receipt = recordFounderContentProviderReceipt({
      write_envelope: envelope,
      provider_result: {
        provider: 'cambiante',
        provider_account_id: PROVIDER_ACCOUNT,
        write_succeeded: true,
        readback_verified: true,
        status: 'published',
        http_status: 200,
        provider_post_id: 'linkedin-post-123',
        public_url: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
      },
      observed_at: '2026-08-17T15:07:00.000Z',
    });

    expect(receipt.truth.published).toBe(true);
    expect(receipt.truth.state).toBe('published');
    expect(receipt.truth.provider_readback_verified).toBe(true);
    expect(receipt.provider_post_id).toBe('linkedin-post-123');
    expect(receipt.public_url).toContain('linkedin.com');
  });

  it('rejects mutated write envelopes and mismatched provider receipts', () => {
    const publishNow = makePublishAuthorization();
    const envelope = buildFounderContentProviderWriteEnvelope({
      publish_authorization: publishNow,
      now: '2026-08-17T15:06:00.000Z',
    });

    expect(() => recordFounderContentProviderReceipt({
      write_envelope: { ...envelope, destination: { ...envelope.destination, provider_account_id: 'tampered-account' } },
      provider_result: {},
      observed_at: '2026-08-17T15:07:00.000Z',
    })).toThrow(/write envelope identity has been mutated/);

    expect(() => recordFounderContentProviderReceipt({
      write_envelope: envelope,
      provider_result: {
        provider: 'buffer',
        provider_account_id: PROVIDER_ACCOUNT,
        write_succeeded: true,
        readback_verified: true,
        status: 'published',
        provider_post_id: 'post-1',
        public_url: 'https://example.com/post/1',
      },
      observed_at: '2026-08-17T15:07:00.000Z',
    })).toThrow(/provider result does not match authorized provider/);
  });
});
