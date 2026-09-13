import { canonicalizeRelayJsonV3, FederatedRelayV3Error, type FederatedAgentRelayEnvelopeV3, type FederatedAgentMemberV3, type FederatedRelayReceiptV3, type RelayPublicKeyRecordV3, type VerifiedRelayV3 } from '../founder-os-lab/federatedRelayV3.js';
import { supabaseAdmin } from './supabase.js';

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

export interface PersistRelayV3Result {
  outcome: 'accepted' | 'duplicate';
  receipt: FederatedRelayReceiptV3;
}

function relayDatabaseError(error: { message?: string } | null | undefined): FederatedRelayV3Error {
  const message = error?.message ?? 'relay_database_error';
  const match = message.match(/relay_[a-z0-9_]+/i);
  return new FederatedRelayV3Error(match?.[0] ?? 'relay_database_error', message);
}

function parseStoredReceipt(value: unknown): FederatedRelayReceiptV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FederatedRelayV3Error('relay_stored_receipt_invalid');
  }
  const receipt = value as Partial<FederatedRelayReceiptV3>;
  if (
    receipt.contract !== 'juss/federated-agent-relay@v3'
    || typeof receipt.messageId !== 'string'
    || typeof receipt.messageFingerprint !== 'string'
    || receipt.executionAuthorized !== false
    || receipt.authorityTransferred !== false
    || receipt.approvalCarriedForward !== false
  ) {
    throw new FederatedRelayV3Error('relay_stored_receipt_invalid');
  }
  return receipt as FederatedRelayReceiptV3;
}

export async function loadRelayPublicKeyV3(keyId: string): Promise<RelayPublicKeyRecordV3> {
  const { data, error } = await supabaseAdmin()
    .from('federated_relay_public_keys')
    .select('member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at')
    .eq('key_id', keyId)
    .maybeSingle<RelayKeyRow>();

  if (error) throw relayDatabaseError(error);
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

export async function ensureRelayPublicKeyV3(input: RelayPublicKeyRecordV3): Promise<void> {
  const client = supabaseAdmin();
  const { data, error } = await client
    .from('federated_relay_public_keys')
    .select('member,key_id,algorithm,public_key_jwk,state,valid_from,valid_until,revoked_at')
    .eq('key_id', input.keyId)
    .maybeSingle<RelayKeyRow>();

  if (error) throw relayDatabaseError(error);
  if (data) {
    const sameIdentity = data.member === input.member
      && data.algorithm === 'Ed25519'
      && canonicalizeRelayJsonV3(data.public_key_jwk) === canonicalizeRelayJsonV3(input.publicKeyJwk);
    if (!sameIdentity) throw new FederatedRelayV3Error('relay_key_id_collision');
    return;
  }

  const { error: insertError } = await client.from('federated_relay_public_keys').insert({
    member: input.member,
    key_id: input.keyId,
    algorithm: 'Ed25519',
    public_key_jwk: input.publicKeyJwk,
    state: input.state,
    valid_from: input.validFrom,
    valid_until: input.validUntil ?? null,
    revoked_at: input.revokedAt ?? null,
  });
  if (insertError) throw relayDatabaseError(insertError);
}

export async function reserveRelaySourceSequenceV3(member: FederatedAgentMemberV3, keyId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('federated_relay_reserve_sequence_v3', {
    p_member: member,
    p_key_id: keyId,
  });
  if (error) throw relayDatabaseError(error);
  const value = Array.isArray(data) ? data[0] : data;
  const sequence = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new FederatedRelayV3Error('relay_sequence_reservation_invalid');
  }
  return sequence;
}

export async function persistAcceptedRelayV3(
  verified: VerifiedRelayV3,
): Promise<PersistRelayV3Result> {
  const envelope = verified.envelope;
  const { data, error } = await supabaseAdmin().rpc('federated_relay_accept_v3', {
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
  if (!row || typeof row !== 'object') throw new FederatedRelayV3Error('relay_database_result_invalid');
  const outcome = (row as { outcome?: unknown }).outcome;
  if (outcome !== 'accepted' && outcome !== 'duplicate') {
    throw new FederatedRelayV3Error('relay_database_result_invalid');
  }
  return {
    outcome,
    receipt: parseStoredReceipt((row as { stored_receipt?: unknown }).stored_receipt),
  };
}

export async function readRelayMessageV3(messageId: string): Promise<FederatedAgentRelayEnvelopeV3 | null> {
  const { data, error } = await supabaseAdmin()
    .from('federated_relay_messages')
    .select('envelope')
    .eq('message_id', messageId)
    .maybeSingle<{ envelope: FederatedAgentRelayEnvelopeV3 }>();
  if (error) throw relayDatabaseError(error);
  return data?.envelope ?? null;
}
