import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateFounderEditorialNovelty,
  type FounderEditorialHistoryRepository,
} from './founderEditorialNovelty.js';
// @ts-expect-error -- canonical founder-content authority is the provider-neutral CommonJS firewall contract.
import founderContentAuthorizationContract from '../../tools/founder-content-contracts/founder-content-authorization-contract.cjs';

type JsonRecord = Record<string, unknown>;

interface CanonicalFounderContentContract {
  authorizeFounderContentPublication(input: {
    proposal: JsonRecord;
    approval: JsonRecord;
    now: string;
  }): JsonRecord;
  canonicalChiefIdentity(proposal: JsonRecord): JsonRecord;
  hashPublicPayload(value: unknown): string;
}

const canonicalFounderContent = founderContentAuthorizationContract as CanonicalFounderContentContract;

export const FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT = 'fcr/founder-content-approval-store@v1' as const;
const MAX_APPROVAL_TTL_MS = 30 * 60 * 1000;

export interface FounderContentIssuedApproval {
  contract: typeof FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT;
  approvalId: string;
  proposalHash: string;
  publicPayloadHash: string;
  authorizationHash: string;
  platform: string;
  sourceRepo: string;
  sourceCommitSha: string;
  approvedAt: string;
  expiresAt: string;
  approval: JsonRecord;
}

export interface FounderContentApprovalClaim {
  ok: true;
  approval: JsonRecord;
  approvalId: string;
  authorizationHash: string;
  publicPayloadHash: string;
}

export interface FounderContentApprovalClaimFailure {
  ok: false;
  code: 'APPROVAL_NOT_FOUND' | 'APPROVAL_NOT_CURRENT' | 'APPROVAL_STORE_FAILED';
  reason: string;
}

export interface FounderContentApprovalRepository {
  issue(input: FounderContentIssuedApproval & {
    founderUserId: string;
    editorialPatternFingerprint: string;
  }): Promise<boolean>;
  readCurrent?(input: {
    founderUserId: string;
    approvalId: string;
    proposalHash: string;
    publicPayloadHash: string;
    authorizationHash: string;
    now: string;
  }): Promise<FounderContentApprovalClaim | FounderContentApprovalClaimFailure>;
  claim(input: {
    founderUserId: string;
    approvalId: string;
    proposalHash: string;
    publicPayloadHash: string;
    authorizationHash: string;
    consumedBy: string;
    now: string;
  }): Promise<FounderContentApprovalClaim | FounderContentApprovalClaimFailure>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function parseTime(value: unknown, label: string): number {
  const raw = text(value);
  const ms = Date.parse(raw);
  if (!raw || Number.isNaN(ms)) throw new Error(`${label} must be a valid timestamp`);
  return ms;
}

function deterministicApprovalId({
  founderUserId,
  platform,
  publicCopyFingerprint,
  approvedAt,
}: {
  founderUserId: string;
  platform: string;
  publicCopyFingerprint: string;
  approvedAt: string;
}): string {
  // The canonical public-copy fingerprint remains the content identity, but
  // approval rows are immutable historical one-shot records. A later fresh
  // approval for unchanged copy must therefore receive a new row identity once
  // the previous editorial-pattern lease is inactive instead of colliding with
  // the old primary key forever. The server-observed issuance timestamp versions
  // that row identity. Concurrent or near-concurrent duplicate authority is
  // still serialized by the database-owned founder/platform/editorial-pattern
  // reservation, so changing the row id does not weaken the active duplicate
  // publication boundary. Current You intent id/version remain recorded on the
  // authorization itself and are intentionally excluded from this identity.
  const digest = createHash('sha256')
    .update(JSON.stringify({
      contract: 'fcr/founder-content-approval-reservation@v5',
      founderUserId: text(founderUserId),
      platform: text(platform).toLowerCase(),
      publicCopyFingerprint: text(publicCopyFingerprint).toLowerCase(),
      approvedAt: new Date(parseTime(approvedAt, 'approval issuance time')).toISOString(),
    }))
    .digest('hex');
  return `fca:${digest}`;
}

function canonicalIssue({
  proposal,
  founderUserId,
  now,
  approvalId: requestedApprovalId,
}: {
  proposal: JsonRecord;
  founderUserId: string;
  now: string;
  approvalId?: string;
}): FounderContentIssuedApproval {
  if (!text(founderUserId)) throw new Error('authenticated founder user id is required');
  const nowMs = parseTime(now, 'now');
  const identity = canonicalFounderContent.canonicalChiefIdentity(proposal);
  const source = record(identity.source);
  const payload = record(identity.public_payload);
  const currentYou = record(identity.current_you);
  const freshness = record(identity.freshness);
  const proposalExpiresMs = parseTime(freshness.expires_at, 'proposal expiry');
  const expiresMs = Math.min(nowMs + MAX_APPROVAL_TTL_MS, proposalExpiresMs);
  if (expiresMs <= nowMs) throw new Error('proposal is already expired');

  const approvalId = text(requestedApprovalId) || `fca:${randomUUID()}`;
  const proposalHash = text(proposal.proposal_hash).toLowerCase();
  const publicPayloadHash = canonicalFounderContent.hashPublicPayload(payload).toLowerCase();
  const platform = text(payload.platform).toLowerCase();
  const approvedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(expiresMs).toISOString();
  const approval: JsonRecord = {
    approval_id: approvalId,
    proposal_hash: proposalHash,
    public_payload_hash: publicPayloadHash,
    current_you: {
      authenticated: true,
      source: 'current_authenticated_founder',
      intent_id: text(currentYou.intent_id),
      intent_version: currentYou.intent_version,
      observed_at: approvedAt,
      supersedes_stale_content_intent: true,
    },
    channels: [platform],
    revoked: false,
    used: false,
    approved_at: approvedAt,
    expires_at: expiresAt,
  };

  const authorization = canonicalFounderContent.authorizeFounderContentPublication({
    proposal,
    approval,
    now: approvedAt,
  });
  const authorizationHash = text(authorization.authorization_hash).toLowerCase();

  return Object.freeze({
    contract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
    approvalId,
    proposalHash,
    publicPayloadHash,
    authorizationHash,
    platform,
    sourceRepo: text(source.repo),
    sourceCommitSha: text(source.commit_sha).toLowerCase(),
    approvedAt,
    expiresAt,
    approval: Object.freeze(approval),
  });
}

export function buildFounderContentIssuedApproval(input: {
  proposal: JsonRecord;
  founderUserId: string;
  now: string;
}): FounderContentIssuedApproval {
  return canonicalIssue(input);
}

function normalizeStoredApproval(data: Record<string, unknown>): FounderContentApprovalClaim {
  return {
    ok: true,
    approval: record(data.approval),
    approvalId: text(data.approval_id),
    authorizationHash: text(data.authorization_hash).toLowerCase(),
    publicPayloadHash: text(data.public_payload_hash).toLowerCase(),
  };
}

function supabaseRepository(client: SupabaseClient): FounderContentApprovalRepository {
  return {
    async issue(input) {
      const { data, error } = await client.rpc(
        'issue_founder_content_approval_with_pattern_reservation',
        {
          p_approval_id: input.approvalId,
          p_founder_user_id: input.founderUserId,
          p_proposal_hash: input.proposalHash,
          p_public_payload_hash: input.publicPayloadHash,
          p_authorization_hash: input.authorizationHash,
          p_platform: input.platform,
          p_source_repo: input.sourceRepo,
          p_source_commit_sha: input.sourceCommitSha,
          p_approval: input.approval,
          p_approved_at: input.approvedAt,
          p_expires_at: input.expiresAt,
          p_pattern_fingerprint: input.editorialPatternFingerprint,
        },
      );
      return !error && data === true;
    },

    async readCurrent(input) {
      const { data, error } = await client
        .from('founder_content_approvals')
        .select('approval, approval_id, authorization_hash, public_payload_hash')
        .eq('approval_id', input.approvalId)
        .eq('founder_user_id', input.founderUserId)
        .eq('proposal_hash', input.proposalHash)
        .eq('public_payload_hash', input.publicPayloadHash)
        .eq('authorization_hash', input.authorizationHash)
        .is('revoked_at', null)
        .is('consumed_at', null)
        .gt('expires_at', input.now)
        .maybeSingle();

      if (error) {
        return { ok: false, code: 'APPROVAL_STORE_FAILED', reason: error.message } as const;
      }
      if (!data) {
        const { data: existing, error: lookupError } = await client
          .from('founder_content_approvals')
          .select('approval_id')
          .eq('approval_id', input.approvalId)
          .eq('founder_user_id', input.founderUserId)
          .maybeSingle();
        if (lookupError) {
          return { ok: false, code: 'APPROVAL_STORE_FAILED', reason: lookupError.message } as const;
        }
        return existing
          ? { ok: false, code: 'APPROVAL_NOT_CURRENT', reason: 'authoritative approval is expired, revoked, consumed, or no longer matches the exact proposal/copy' } as const
          : { ok: false, code: 'APPROVAL_NOT_FOUND', reason: 'authoritative approval was not issued to this founder' } as const;
      }

      return normalizeStoredApproval(data);
    },

    async claim(input) {
      const { data, error } = await client
        .from('founder_content_approvals')
        .update({
          consumed_at: input.now,
          consumed_by: input.consumedBy,
        })
        .eq('approval_id', input.approvalId)
        .eq('founder_user_id', input.founderUserId)
        .eq('proposal_hash', input.proposalHash)
        .eq('public_payload_hash', input.publicPayloadHash)
        .eq('authorization_hash', input.authorizationHash)
        .is('revoked_at', null)
        .is('consumed_at', null)
        .gt('expires_at', input.now)
        .select('approval, approval_id, authorization_hash, public_payload_hash')
        .maybeSingle();

      if (error) {
        return { ok: false, code: 'APPROVAL_STORE_FAILED', reason: error.message } as const;
      }
      if (!data) {
        const { data: existing, error: lookupError } = await client
          .from('founder_content_approvals')
          .select('approval_id')
          .eq('approval_id', input.approvalId)
          .eq('founder_user_id', input.founderUserId)
          .maybeSingle();
        if (lookupError) {
          return { ok: false, code: 'APPROVAL_STORE_FAILED', reason: lookupError.message } as const;
        }
        return existing
          ? { ok: false, code: 'APPROVAL_NOT_CURRENT', reason: 'authoritative approval is expired, revoked, consumed, or no longer matches the exact proposal/copy' } as const
          : { ok: false, code: 'APPROVAL_NOT_FOUND', reason: 'authoritative approval was not issued to this founder' } as const;
      }

      return normalizeStoredApproval(data);
    },
  };
}

async function defaultRepository(): Promise<FounderContentApprovalRepository> {
  const { supabase } = await import('./supabaseClient.js');
  return supabaseRepository(supabase);
}

function approvalLookupInput({
  proposal,
  founderUserId,
  approvalId,
  authorizationHash,
  expectedPublicPayloadHash,
  now,
}: {
  proposal: JsonRecord;
  founderUserId: string;
  approvalId: string;
  authorizationHash: string;
  expectedPublicPayloadHash?: string;
  now: string;
}) {
  const identity = canonicalFounderContent.canonicalChiefIdentity(proposal);
  const publicPayloadHash = canonicalFounderContent.hashPublicPayload(record(identity.public_payload)).toLowerCase();
  const expected = text(expectedPublicPayloadHash).toLowerCase();
  if (expected && expected !== publicPayloadHash) {
    return {
      ok: false as const,
      failure: {
        ok: false,
        code: 'APPROVAL_NOT_CURRENT',
        reason: 'public payload confirmation does not match the exact proposal copy',
      } as FounderContentApprovalClaimFailure,
    };
  }
  return {
    ok: true as const,
    input: {
      founderUserId: text(founderUserId),
      approvalId: text(approvalId).toLowerCase(),
      proposalHash: text(proposal.proposal_hash).toLowerCase(),
      publicPayloadHash,
      authorizationHash: text(authorizationHash).toLowerCase(),
      now,
    },
  };
}

export async function issueFounderContentApproval({
  proposal,
  founderUserId,
  now = new Date().toISOString(),
  repository,
  historyRepository,
}: {
  proposal: JsonRecord;
  founderUserId: string;
  now?: string;
  repository?: FounderContentApprovalRepository;
  historyRepository?: FounderEditorialHistoryRepository;
}): Promise<FounderContentIssuedApproval> {
  const canonicalIdentity = canonicalFounderContent.canonicalChiefIdentity(proposal);
  const platform = text(record(canonicalIdentity.public_payload).platform).toLowerCase();
  // Validate the proposal's canonical authorization contract (proposal_hash,
  // evidence binding, Sauce Guard state, Current You freshness, ...) before
  // any history lookup. canonicalIssue() also performs this validation, but
  // running it here first — with a throwaway approval id, discarded below —
  // rejects a malformed proposal before evaluateFounderEditorialNovelty()
  // reads history for it. Without this, an invalid proposal could be
  // misreported as a repetition hold or history-read failure instead of
  // being rejected for its invalid authority contract.
  canonicalIssue({ proposal, founderUserId, now });
  const novelty = await evaluateFounderEditorialNovelty({ proposal, historyRepository });
  if (!novelty.allowed) {
    throw new Error(
      `FOUNDER_EDITORIAL_REPETITION_BLOCKED: story=${novelty.storyFingerprint} closest=${novelty.closestMatchId ?? 'unknown'} similarity=${novelty.closestSimilarity}`,
    );
  }
  const approvedAt = new Date(parseTime(now, 'now')).toISOString();
  const approvalId = deterministicApprovalId({
    founderUserId,
    platform,
    publicCopyFingerprint: novelty.publicCopyFingerprint,
    approvedAt,
  });
  const issued = canonicalIssue({ proposal, founderUserId, now: approvedAt, approvalId });
  const store = repository ?? await defaultRepository();
  const persisted = await store.issue({
    ...issued,
    founderUserId,
    editorialPatternFingerprint: novelty.promptOsPatternFingerprint,
  });
  if (!persisted) {
    throw new Error('authoritative founder-content approval could not be persisted; active editorial pattern is already reserved, the exact issuance row already exists, or the store rejected issuance');
  }
  return issued;
}

export async function readCurrentFounderContentApproval({
  proposal,
  founderUserId,
  approvalId,
  authorizationHash,
  expectedPublicPayloadHash,
  now = new Date().toISOString(),
  repository,
}: {
  proposal: JsonRecord;
  founderUserId: string;
  approvalId: string;
  authorizationHash: string;
  expectedPublicPayloadHash?: string;
  now?: string;
  repository?: FounderContentApprovalRepository;
}): Promise<FounderContentApprovalClaim | FounderContentApprovalClaimFailure> {
  const lookup = approvalLookupInput({
    proposal,
    founderUserId,
    approvalId,
    authorizationHash,
    expectedPublicPayloadHash,
    now,
  });
  if (!lookup.ok) return lookup.failure;

  const store = repository ?? await defaultRepository();
  if (!store.readCurrent) {
    return {
      ok: false,
      code: 'APPROVAL_STORE_FAILED',
      reason: 'authoritative approval repository does not support non-consuming current readback',
    };
  }
  return store.readCurrent(lookup.input);
}

export async function claimFounderContentApproval({
  proposal,
  founderUserId,
  approvalId,
  authorizationHash,
  expectedPublicPayloadHash,
  consumedBy,
  now = new Date().toISOString(),
  repository,
}: {
  proposal: JsonRecord;
  founderUserId: string;
  approvalId: string;
  authorizationHash: string;
  expectedPublicPayloadHash?: string;
  consumedBy: string;
  now?: string;
  repository?: FounderContentApprovalRepository;
}): Promise<FounderContentApprovalClaim | FounderContentApprovalClaimFailure> {
  const lookup = approvalLookupInput({
    proposal,
    founderUserId,
    approvalId,
    authorizationHash,
    expectedPublicPayloadHash,
    now,
  });
  if (!lookup.ok) return lookup.failure;

  const store = repository ?? await defaultRepository();
  return store.claim({
    ...lookup.input,
    consumedBy: text(consumedBy),
  });
}
