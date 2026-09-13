import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  FederatedRelayV3Error,
  assertRelayTargetV3,
  canonicalizeRelayJsonV3,
  parseFederatedAgentRelayEnvelopeV3,
  sha256HexV3,
  verifyRelayEnvelopeV3,
  type FederatedAgentMemberV3,
  type FederatedRelayReceiptV3,
  type RelayPublicKeyRecordV3,
} from '../founder-os-lab/federatedRelayV3.js';

export interface FederatedRelayV3WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GIT_SHA?: string;
}

interface RelayKeyRow {
  member: string;
  key_id: string;
  algorithm: string;
  public_key_jwk: JsonWebKey;
  state: 'active' | 'retiring' | 'revoked';
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function databaseError(error: { message?: string } | null | undefined): FederatedRelayV3Error {
  const message = error?.message ?? 'relay_database_error';
  const match = message.match(/relay_[a-z0-9_]+/i);
  return new FederatedRelayV3Error(match?.[0] ?? 'relay_database_error', message);
}

function statusFor(error: FederatedRelayV3Error): number {
  if (error.code === 'relay_runtime_identity_unavailable') return 503;
  if (error.code === 'relay_signing_key_unknown' || error.code === 'relay_signature_invalid' || error.code === 'relay_signing_key_revoked') return 401;
  if (error.code === 'relay_target_identity_stale' || error.code === 'relay_expired' || error.code === 'relay_issued_in_future') return 409;
  if (/sequence|nonce|collision|chain_|supersession/.test(error.code)) return 409;
  if (error.code === 'relay_database_error') return 503;
  return 400;
}

async function loadKey(client: SupabaseClient, keyId: string): Promise<RelayPublicKeyRecordV3> {
  const { data, error } = await client
    .from('federated_relay_public_keys')
    .select('member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at')
    .eq('key_id', keyId)
    .maybeSingle<RelayKeyRow>();
  if (error) throw databaseError(error);
  if (!data) throw new FederatedRelayV3Error('relay_signing_key_unknown');
  if (data.algorithm !== 'Ed25519') throw new FederatedRelayV3Error('relay_signature_algorithm_rejected');
  return {
    member: data.member as FederatedAgentMemberV3,
    keyId: data.key_id,
    publicKeyJwk: data.public_key_jwk,
    state: data.state,
    validFrom: data.valid_from,
    validUntil: data.valid_until,
    revokedAt: data.revoked_at,
  };
}

function storedReceipt(value: unknown): FederatedRelayReceiptV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FederatedRelayV3Error('relay_stored_receipt_invalid');
  }
  const receipt = value as Partial<FederatedRelayReceiptV3>;
  if (
    receipt.contract !== 'juss/federated-agent-relay@v3'
    || typeof receipt.messageFingerprint !== 'string'
    || receipt.executionAuthorized !== false
    || receipt.authorityTransferred !== false
    || receipt.approvalCarriedForward !== false
  ) throw new FederatedRelayV3Error('relay_stored_receipt_invalid');
  return receipt as FederatedRelayReceiptV3;
}

async function findStoredMessage(client: SupabaseClient, messageId: string) {
  const { data, error } = await client
    .from('federated_relay_messages')
    .select('message_fingerprint,receipt')
    .eq('message_id', messageId)
    .maybeSingle<{ message_fingerprint: string; receipt: unknown }>();
  if (error) throw databaseError(error);
  return data ?? null;
}

export async function handleFederatedRelayV3WorkerRequest(
  request: Request,
  env: FederatedRelayV3WorkerEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const runtimeSha = (env.GIT_SHA ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(runtimeSha)) throw new FederatedRelayV3Error('relay_runtime_identity_unavailable');
    const input = await request.json();
    const envelope = parseFederatedAgentRelayEnvelopeV3(input);
    const expectedTarget = {
      member: 'founder-control-room' as const,
      repository: 'jussray/founder-control-room',
      branch: 'main',
      headSha: runtimeSha,
    };
    assertRelayTargetV3(envelope, expectedTarget);
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Exact signed retries are idempotent for the same exact receiver identity.
    // They return historical evidence only and never reacquire authority.
    // Once the receiver SHA moves, the old packet is stale and must be rebound.
    const fingerprint = await sha256HexV3(canonicalizeRelayJsonV3(envelope));
    const existing = await findStoredMessage(client, envelope.messageId);
    if (existing) {
      if (existing.message_fingerprint !== fingerprint) throw new FederatedRelayV3Error('relay_message_id_collision');
      return jsonResponse({
        contract: envelope.contract,
        outcome: 'duplicate',
        receipt: storedReceipt(existing.receipt),
      });
    }

    const key = await loadKey(client, envelope.signature.keyId);
    const verified = await verifyRelayEnvelopeV3({
      envelope,
      key,
      expectedTarget,
    });

    const { data, error } = await client.rpc('federated_relay_accept_v3', {
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
    if (error) throw databaseError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || (row.outcome !== 'accepted' && row.outcome !== 'duplicate')) {
      throw new FederatedRelayV3Error('relay_database_result_invalid');
    }
    return jsonResponse({
      contract: envelope.contract,
      outcome: row.outcome,
      receipt: storedReceipt(row.stored_receipt),
    }, row.outcome === 'accepted' ? 201 : 200);
  } catch (error) {
    const relayError = error instanceof FederatedRelayV3Error
      ? error
      : new FederatedRelayV3Error('relay_internal_error', error instanceof Error ? error.message : String(error));
    return jsonResponse({
      error: relayError.code,
      detail: relayError.message,
      executionAuthorized: false,
      authorityTransferred: false,
      approvalCarriedForward: false,
    }, statusFor(relayError));
  }
}
