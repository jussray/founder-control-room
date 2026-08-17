import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  buildTemporalClaimTruthContextFromCanonical,
  temporalClaimTruthContextHash,
  type CanonicalPublicClaim,
} from '../../governance/temporalClaimTruth.js';
import {
  dispatchTemporallyGovernedFounderContentPublishNow,
  type TemporallyGovernedFounderPublishInput,
} from '../temporallyGovernedFounderContentExecutor.js';

const require = createRequire(import.meta.url);
const {
  canonicalChiefIdentity,
  hashPublicPayload,
} = require('../../../tools/zapier/founder-content-authorization-contract.cjs') as {
  canonicalChiefIdentity: (proposal: Record<string, unknown>) => Record<string, any>;
  hashPublicPayload: (value: unknown) => string;
};

const SOURCE = 'a'.repeat(40);
const NEWER = 'b'.repeat(40);
const EVIDENCE_REF = `github:founder-control-room@${SOURCE}#quality-gate`;

function proposal(temporalClass: 'current_repo_state' | 'historical_version' | null = 'current_repo_state') {
  const claim: Record<string, unknown> = {
    claim_id: 'repo-progress',
    text: temporalClass === 'historical_version'
      ? 'Built the governed publication boundary at this exact version.'
      : 'The repository state is current at the verified source version.',
    truth_state: 'verified',
    public_safe: true,
    evidence_ref: EVIDENCE_REF,
    evidence_scope: 'implementation-shipped',
  };
  if (temporalClass) {
    claim.temporal_class = temporalClass;
    claim.temporal_version = SOURCE;
  }

  const value: Record<string, any> = {
    version: 1,
    kind: 'chief-ai/founder-content-proposal',
    source: { repo: 'jussray/founder-control-room', commit_sha: SOURCE },
    freshness: {
      issued_at: '2026-08-17T14:00:00.000Z',
      expires_at: '2026-08-17T16:00:00.000Z',
    },
    public_payload: {
      platform: 'linkedin',
      story_type: 'founder-progress',
      draft_text: 'Built a governed publishing layer that keeps exact approved copy separate from private implementation details.',
      public_claims: [claim],
      proof_link: null,
      proof_link_policy: 'editorial_optional',
    },
    internal_evidence: {
      verified: true,
      ref: EVIDENCE_REF,
      kind: 'github-exact-head-contract',
      digest: 'c'.repeat(64),
      not_for_publication: true,
      source_repo: 'jussray/founder-control-room',
      source_commit_sha: SOURCE,
      proves: ['implementation-shipped'],
      does_not_prove: ['runtime-health'],
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

function buildInput(temporalClass: 'current_repo_state' | 'historical_version' | null = 'current_repo_state') {
  const proposalValue = proposal(temporalClass);
  const identity = canonicalChiefIdentity(proposalValue);
  const publicPayloadHash = hashPublicPayload(identity.public_payload);
  const approval = {
    approval_id: 'founder-post-approval-1',
    proposal_hash: proposalValue.proposal_hash,
    public_payload_hash: publicPayloadHash,
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

  const canonicalClaim = identity.public_payload.public_claims[0];
  let truthContextHash = '0'.repeat(64);
  if (canonicalClaim.temporal_class) {
    const claims: CanonicalPublicClaim[] = [{
      claimId: canonicalClaim.claim_id,
      text: canonicalClaim.text,
      evidenceRef: canonicalClaim.evidence_ref,
      evidenceScope: canonicalClaim.evidence_scope,
      temporalClass: canonicalClaim.temporal_class,
      temporalVersion: canonicalClaim.temporal_version,
    }];
    truthContextHash = temporalClaimTruthContextHash(
      buildTemporalClaimTruthContextFromCanonical({
        proposalHash: proposalValue.proposal_hash,
        publicPayloadHash,
        claims,
      }),
    );
  }

  return {
    proposal: proposalValue,
    approval,
    confirmation: {
      confirm_publication: true,
      authorization_hash: '',
      public_payload_hash: publicPayloadHash,
      truth_context_hash: truthContextHash,
    },
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: 'founder-post-intent-1',
      intent_version: 7,
      observed_at: '2026-08-17T15:04:00.000Z',
    },
  } as TemporallyGovernedFounderPublishInput;
}

function bindAuthorizationHash(input: TemporallyGovernedFounderPublishInput) {
  const contract = require('../../../tools/zapier/founder-content-authorization-contract.cjs') as {
    authorizeFounderContentPublication: (input: Record<string, unknown>) => Record<string, any>;
  };
  const authorization = contract.authorizeFounderContentPublication({
    proposal: input.proposal,
    approval: input.approval,
    now: '2026-08-17T15:05:00.000Z',
  });
  input.confirmation.authorization_hash = authorization.authorization_hash;
  return input;
}

describe('temporally governed founder publication', () => {
  it('ignores caller relabeling and blocks a canonical current claim after main moves', async () => {
    const input = bindAuthorizationHash(buildInput('current_repo_state')) as TemporallyGovernedFounderPublishInput & {
      truth_context?: Record<string, unknown>;
    };
    input.truth_context = {
      contract: 'fcr/temporal-public-claim-truth@v1',
      proposalHash: input.proposal.proposal_hash,
      publicPayloadHash: input.confirmation.public_payload_hash,
      claims: [{
        claimId: 'repo-progress',
        claimClass: 'historical_version',
        evidenceRef: EVIDENCE_REF,
        evidenceScope: 'implementation-shipped',
        exactVersion: SOURCE,
      }],
    };

    const result = await dispatchTemporallyGovernedFounderContentPublishNow(input, {
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      env: {},
      truthResolver: { currentVersion: vi.fn().mockResolvedValue(NEWER) },
    });

    expect(result.truthState).toBe('BLOCKED');
    expect(result.temporalTruth?.claims[0].state).toBe('SUPERSEDED');
    expect(result.temporalAnalytics?.staleTruthPrevented).toBe(true);
  });

  it('blocks direct publication when canonical proposal omitted temporal semantics', async () => {
    const input = bindAuthorizationHash(buildInput(null));
    const result = await dispatchTemporallyGovernedFounderContentPublishNow(input, {
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      env: {},
      truthResolver: { currentVersion: vi.fn() },
    });
    expect(result.truthState).toBe('BLOCKED');
    expect(result.reasons.join(' ')).toContain('canonical temporal_class is required');
  });

  it('allows historical truth to pass temporal gate while still requiring provider credentials', async () => {
    const input = bindAuthorizationHash(buildInput('historical_version'));
    const result = await dispatchTemporallyGovernedFounderContentPublishNow(input, {
      now: '2026-08-17T15:05:00.000Z',
      executedBy: 'founder@example.com',
      env: {},
      truthResolver: { currentVersion: vi.fn().mockResolvedValue(NEWER) },
    });
    expect(result.temporalTruth?.claims[0].state).toBe('HISTORICAL_VERIFIED');
    expect(result.code).toBe('LINKEDIN_NOT_CONFIGURED');
  });

  it('makes temporal class part of proposal and public-payload hashes', () => {
    const currentProposal = proposal('current_repo_state');
    const historicalProposal = proposal('historical_version');
    const currentIdentity = canonicalChiefIdentity(currentProposal);
    const historicalIdentity = canonicalChiefIdentity(historicalProposal);

    expect(currentProposal.proposal_hash).not.toBe(historicalProposal.proposal_hash);
    expect(hashPublicPayload(currentIdentity.public_payload)).not.toBe(
      hashPublicPayload(historicalIdentity.public_payload),
    );
  });

  it('rejects changing temporal class after Current You approved the original proposal', () => {
    const input = buildInput('current_repo_state');
    const mutated = structuredClone(input.proposal) as Record<string, any>;
    mutated.public_payload.public_claims[0].temporal_class = 'historical_version';
    mutated.public_payload.public_claims[0].text = 'Built the repository state at this version.';

    expect(() => bindAuthorizationHash({ ...input, proposal: mutated })).toThrow(
      /proposal_hash does not match canonical Chief v1 proposal identity/,
    );
  });
});
