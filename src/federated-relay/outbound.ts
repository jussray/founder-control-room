import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalizeRelayJcsV31 } from './federatedRelay/jcs.js';
import { relayDeliveryFingerprintV31, relaySemanticFingerprintV31, sha256HexV31 } from './federatedRelay/crypto.js';
import {
  FEDERATED_AGENT_RELAY_V31,
  type FederatedAgentRelayEnvelopeV31,
  type FederatedAgentRelayReceiptV31,
  type RelayDispositionV31,
  type RelayEvidenceV31,
  type RelayMemberIdentityV31,
  type RelayRelationTypeV31,
  type RelaySignatureV31,
  type RelaySignatureVerifierV31,
  RelayV31Error,
} from './federatedRelay/v31-types.js';
import { assertFederatedRelayEnvelopeV31 } from './federatedRelay/validation.js';
import { verifyFederatedRelayAcceptanceReceiptV31 } from './receipt.js';

export interface RelayEnvelopeSignerV31 {
  keyId: string;
  sign(input: { member: RelayMemberIdentityV31['member']; canonicalUnsignedBytes: Uint8Array }): Promise<RelaySignatureV31>;
}

export interface RelayOutboundTransportV31 {
  post(input: { target: RelayMemberIdentityV31; canonicalEnvelope: string }): Promise<{
    outcome: 'accepted' | 'duplicate';
    receipt: FederatedAgentRelayReceiptV31;
    currentState: 'accepted' | 'superseded' | 'revoked';
    supersededByMessageId: string | null;
  }>;
}

export interface SendFederatedRelayV31Input {
  source: RelayMemberIdentityV31;
  target: RelayMemberIdentityV31;
  chainId: string;
  logicalOperationId: string;
  relationType: RelayRelationTypeV31;
  disposition: RelayDispositionV31;
  subject: string;
  payload: { contentType: 'text/plain' | 'application/json'; body: string };
  contextFingerprint: string;
  evidence: RelayEvidenceV31[];
  supersedesMessageIds?: string[];
  ttlMs?: number;
  messageId?: string;
}

function singleRpcRow(data: unknown, code: string): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new RelayV31Error(code);
  return row as Record<string, unknown>;
}

function requireInteger(value: unknown, code: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new RelayV31Error(code);
  return number;
}

export function createHttpsRelayTransportV31(endpointForMember: (member: RelayMemberIdentityV31['member']) => string): RelayOutboundTransportV31 {
  return {
    async post({ target, canonicalEnvelope }) {
      const endpoint = new URL(endpointForMember(target.member));
      if (endpoint.protocol !== 'https:') throw new RelayV31Error('relay_transport_https_required');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: canonicalEnvelope,
        redirect: 'error',
      });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new RelayV31Error(typeof body.error === 'string' ? body.error : `relay_transport_http_${response.status}`);
      if (body.outcome !== 'accepted' && body.outcome !== 'duplicate') throw new RelayV31Error('relay_transport_result_invalid');
      if (body.currentState !== 'accepted' && body.currentState !== 'superseded' && body.currentState !== 'revoked') throw new RelayV31Error('relay_transport_state_invalid');
      return {
        outcome: body.outcome,
        receipt: body.receipt as FederatedAgentRelayReceiptV31,
        currentState: body.currentState,
        supersededByMessageId: typeof body.supersededByMessageId === 'string' ? body.supersededByMessageId : null,
      };
    },
  };
}

export async function sendFederatedRelayV31(input: SendFederatedRelayV31Input, deps: {
  client: SupabaseClient;
  signer: RelayEnvelopeSignerV31;
  receiptVerifier: RelaySignatureVerifierV31;
  transport: RelayOutboundTransportV31;
  now?: number;
}): Promise<{ envelope: FederatedAgentRelayEnvelopeV31; receipt: FederatedAgentRelayReceiptV31 }> {
  const now = deps.now ?? Date.now();
  const ttlMs = input.ttlMs ?? 4 * 60 * 1_000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 5 * 60 * 1_000) throw new RelayV31Error('relay_ttl_invalid');
  const messageId = input.messageId ?? randomUUID();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();

  const { data: reservationData, error: reservationError } = await deps.client.rpc('federated_relay_reserve_outbound_v31', {
    p_message_id: messageId,
    p_chain_id: input.chainId,
    p_relation_type: input.relationType,
    p_logical_operation_id: input.logicalOperationId,
    p_source_member: input.source.member,
    p_source_repository: input.source.repository,
    p_source_branch: input.source.branch,
    p_source_key_id: deps.signer.keyId,
    p_target_member: input.target.member,
    p_target_repository: input.target.repository,
    p_target_branch: input.target.branch,
    p_expires_at: expiresAt,
  });
  if (reservationError) throw new RelayV31Error(reservationError.message || 'relay_outbox_reservation_failed');
  const reservation = singleRpcRow(reservationData, 'relay_outbox_reservation_invalid');
  const sourceSequence = requireInteger(reservation.source_sequence, 'relay_outbox_source_sequence_invalid');
  const chainPosition = requireInteger(reservation.chain_position, 'relay_outbox_chain_position_invalid');
  const parentMessageId = typeof reservation.parent_message_id === 'string' ? reservation.parent_message_id : null;
  const predecessorProofCookie = typeof reservation.predecessor_proof_cookie === 'string' ? reservation.predecessor_proof_cookie : '';
  if (!predecessorProofCookie) throw new RelayV31Error('relay_outbox_predecessor_cookie_invalid');

  const relation = input.relationType === 'root'
    ? { type: 'root' as const }
    : { type: input.relationType as Exclude<RelayRelationTypeV31, 'root'>, parentMessageId: parentMessageId ?? '' };
  if (input.relationType !== 'root' && !parentMessageId) throw new RelayV31Error('relay_outbox_parent_missing');
  const payloadSha256 = sha256HexV31(input.payload.body);
  const unsignedEnvelope = {
    contract: FEDERATED_AGENT_RELAY_V31,
    messageId,
    ...(input.relationType === 'reply' ? { replyToMessageId: parentMessageId ?? undefined } : {}),
    ordering: { chainId: input.chainId, sourceSequence, chainPosition, logicalOperationId: input.logicalOperationId, relation },
    source: input.source,
    target: input.target,
    issuedAt,
    expiresAt,
    nonce: randomUUID(),
    disposition: input.disposition,
    subject: input.subject,
    payload: { contentType: input.payload.contentType, body: input.payload.body, sha256: payloadSha256 },
    contextFingerprint: input.contextFingerprint,
    predecessorProofCookie,
    evidence: input.evidence,
    supersedesMessageIds: input.supersedesMessageIds ?? [],
  };
  const signature = await deps.signer.sign({
    member: input.source.member,
    canonicalUnsignedBytes: new TextEncoder().encode(canonicalizeRelayJcsV31(unsignedEnvelope)),
  });
  const envelope = { ...unsignedEnvelope, signature } as FederatedAgentRelayEnvelopeV31;
  assertFederatedRelayEnvelopeV31(envelope);
  const semanticFingerprint = relaySemanticFingerprintV31(envelope);
  const deliveryFingerprint = relayDeliveryFingerprintV31(envelope);

  const { error: finalizeError } = await deps.client.rpc('federated_relay_finalize_outbound_v31', {
    p_message_id: messageId,
    p_semantic_fingerprint: semanticFingerprint,
    p_delivery_fingerprint: deliveryFingerprint,
    p_envelope: envelope,
  });
  if (finalizeError) throw new RelayV31Error(finalizeError.message || 'relay_outbox_finalize_failed');

  const canonicalEnvelope = canonicalizeRelayJcsV31(envelope);
  const remote = await deps.transport.post({ target: input.target, canonicalEnvelope });
  const receipt = await verifyFederatedRelayAcceptanceReceiptV31({ envelope, receipt: remote.receipt, verifier: deps.receiptVerifier });
  if (remote.currentState !== 'accepted') throw new RelayV31Error('relay_remote_acceptance_not_active');

  const { error: recordError } = await deps.client.rpc('federated_relay_record_outbound_acceptance_v31', {
    p_message_id: messageId,
    p_receipt: receipt,
    p_receiver_current_state: remote.currentState,
  });
  if (recordError) throw new RelayV31Error(recordError.message || 'relay_outbox_receipt_record_failed');
  return { envelope, receipt };
}
