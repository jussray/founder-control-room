import type { Request, RequestHandler, Response } from 'express';
import { makeSupabaseClient } from '../../lib/supabaseClient.js';
import {
  FEDERATED_AGENT_RELAY_V3,
  FederatedRelayV3Error,
  assertRelayTargetV3,
  canonicalizeRelayJsonV3,
  parseFederatedAgentRelayEnvelopeV3,
  sha256HexV3,
  verifyRelayEnvelopeV3,
  type FederatedAgentRelayEnvelopeV3,
  type RelayPublicKeyRecordV3,
  type FederatedRelayReceiptV3,
} from '../../founder-os-lab/federatedRelayV3.js';

const FCR_MEMBER = 'founder-control-room' as const;
const FCR_REPOSITORY = 'jussray/founder-control-room';
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;

interface StoredRelayMessage {
  message_fingerprint: string;
  receipt: unknown;
}

interface DurableRelayResult {
  outcome: 'accepted' | 'duplicate';
  receipt: FederatedRelayReceiptV3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validStoredReceipt(value: unknown): value is FederatedRelayReceiptV3 {
  return isRecord(value)
    && value.contract === FEDERATED_AGENT_RELAY_V3
    && value.status === 'accepted'
    && typeof value.messageId === 'string'
    && typeof value.messageFingerprint === 'string'
    && typeof value.successorProofCookie === 'string'
    && value.executionAuthorized === false
    && value.authorityTransferred === false
    && value.approvalCarriedForward === false;
}

function statusFor(error: FederatedRelayV3Error): number {
  if (error.code.includes('_missing') || error.code === 'relay_runtime_identity_unavailable') return 503;
  if (
    error.code === 'relay_signing_key_unknown'
    || error.code === 'relay_signature_invalid'
    || error.code === 'relay_signing_key_revoked'
  ) return 401;
  if (
    error.code === 'relay_target_identity_stale'
    || error.code === 'relay_expired'
    || error.code === 'relay_issued_in_future'
  ) return 409;
  if (/sequence|nonce|collision|chain_|supersession|reply_/.test(error.code)) return 409;
  if (error.code.startsWith('relay_database_')) return 503;
  return 400;
}

function relayDatabaseError(error: unknown): FederatedRelayV3Error {
  const message = isRecord(error) && typeof error.message === 'string'
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error);
  const matched = message.match(/relay_[a-z0-9_]+/i)?.[0];
  return new FederatedRelayV3Error(matched ?? 'relay_database_error', message.slice(0, 1_000));
}

async function loadPublicKey(keyId: string): Promise<RelayPublicKeyRecordV3> {
  const admin = makeSupabaseClient();
  const { data, error } = await admin
    .from('federated_relay_public_keys')
    .select('member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at')
    .eq('key_id', keyId)
    .limit(1)
    .maybeSingle();

  if (error) throw relayDatabaseError(error);
  if (!data) throw new FederatedRelayV3Error('relay_signing_key_unknown');
  if (data.algorithm !== 'Ed25519') throw new FederatedRelayV3Error('relay_signature_algorithm_rejected');

  return {
    member: data.member,
    keyId: data.key_id,
    publicKeyJwk: data.public_key_jwk,
    state: data.state,
    validFrom: data.valid_from,
    validUntil: data.valid_until,
    revokedAt: data.revoked_at,
  } as RelayPublicKeyRecordV3;
}

async function findStoredMessage(messageId: string): Promise<StoredRelayMessage | null> {
  const admin = makeSupabaseClient();
  const { data, error } = await admin
    .from('federated_relay_messages')
    .select('message_fingerprint,receipt')
    .eq('message_id', messageId)
    .limit(1)
    .maybeSingle();

  if (error) throw relayDatabaseError(error);
  if (!data) return null;
  return {
    message_fingerprint: String(data.message_fingerprint),
    receipt: data.receipt,
  };
}

async function persistVerified(
  verified: Awaited<ReturnType<typeof verifyRelayEnvelopeV3>>,
): Promise<DurableRelayResult> {
  const admin = makeSupabaseClient();
  const envelope = verified.envelope;
  const { data, error } = await admin.rpc('federated_relay_accept_v3', {
    p_contract: envelope.contract,
    p_message_id: envelope.messageId,
    p_message_fingerprint: verified.messageFingerprint,
    p_chain_id: envelope.ordering.chainId,
    p_chain_position: envelope.ordering.chainPosition,
    p_logical_operation_id: envelope.ordering.logicalOperationId,
    p_source_member: envelope.source.member,
    p_source_repository: envelope.source.repository,
    p_source_branch: envelope.source.branch,
    p_source_head_sha: envelope.source.headSha,
    p_source_key_id: envelope.signature.keyId,
    p_source_sequence: envelope.ordering.sourceSequence,
    p_target_member: envelope.target.member,
    p_target_repository: envelope.target.repository,
    p_target_branch: envelope.target.branch,
    p_target_head_sha: envelope.target.headSha,
    p_nonce: envelope.nonce,
    p_predecessor_message_id: envelope.ordering.predecessorMessageId ?? null,
    p_reply_to_message_id: envelope.replyToMessageId ?? null,
    p_predecessor_proof_cookie: envelope.predecessorProofCookie,
    p_successor_proof_cookie: verified.successorProofCookie,
    p_payload_sha256: envelope.payload.sha256,
    p_evidence_digest: verified.evidenceDigest,
    p_issued_at: envelope.issuedAt,
    p_expires_at: envelope.expiresAt,
    p_envelope: envelope,
    p_receipt: verified.receipt,
    p_supersedes_message_ids: envelope.supersedesMessageIds,
  });

  if (error) throw relayDatabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) throw new FederatedRelayV3Error('relay_database_result_invalid');
  const outcome = row.outcome;
  if (outcome !== 'accepted' && outcome !== 'duplicate') {
    throw new FederatedRelayV3Error('relay_database_result_invalid');
  }
  if (!validStoredReceipt(row.stored_receipt)) {
    throw new FederatedRelayV3Error('relay_database_result_invalid');
  }
  return { outcome, receipt: row.stored_receipt };
}

export function expectedFcrRelayTarget(runtimeSha: string) {
  return {
    member: FCR_MEMBER,
    repository: FCR_REPOSITORY,
    branch: 'main',
    headSha: runtimeSha.toLowerCase(),
  } as const;
}

export const handleFederatedRelayV3: RequestHandler = async function handleFederatedRelayV3(
  req: Request,
  res: Response,
) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });

  try {
    const runtimeSha = process.env.GIT_SHA?.trim().toLowerCase() ?? '';
    if (!EXACT_COMMIT_SHA.test(runtimeSha)) {
      throw new FederatedRelayV3Error('relay_runtime_identity_unavailable');
    }

    const envelope: FederatedAgentRelayEnvelopeV3 = parseFederatedAgentRelayEnvelopeV3(req.body);
    const expectedTarget = expectedFcrRelayTarget(runtimeSha);

    // Exact target binding is checked before any duplicate shortcut. A stored
    // message can never authorize replay against a newer FCR runtime.
    assertRelayTargetV3(envelope, expectedTarget);

    const incomingFingerprint = await sha256HexV3(canonicalizeRelayJsonV3(envelope));
    const stored = await findStoredMessage(envelope.messageId);
    let durable: DurableRelayResult;

    if (stored) {
      if (stored.message_fingerprint !== incomingFingerprint) {
        throw new FederatedRelayV3Error('relay_message_id_collision');
      }
      if (!validStoredReceipt(stored.receipt)) {
        throw new FederatedRelayV3Error('relay_stored_receipt_invalid');
      }
      durable = { outcome: 'duplicate', receipt: stored.receipt };
    } else {
      const sourceKey = await loadPublicKey(envelope.signature.keyId);
      const verified = await verifyRelayEnvelopeV3({
        envelope,
        key: sourceKey,
        expectedTarget,
      });
      durable = await persistVerified(verified);
    }

    return res.status(durable.outcome === 'accepted' ? 201 : 200).json({
      contract: FEDERATED_AGENT_RELAY_V3,
      outcome: durable.outcome,
      receipt: durable.receipt,
      executionAuthorized: false,
      authorityTransferred: false,
      approvalCarriedForward: false,
    });
  } catch (error) {
    const relayError = error instanceof FederatedRelayV3Error
      ? error
      : relayDatabaseError(error);
    return res.status(statusFor(relayError)).json({
      error: relayError.code,
      detail: relayError.message,
      executionAuthorized: false,
      authorityTransferred: false,
      approvalCarriedForward: false,
    });
  }
};
