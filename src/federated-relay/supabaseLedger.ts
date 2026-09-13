import type { SupabaseClient } from '@supabase/supabase-js';
import type { FederatedAgentRelayReceiptV31, RelayLedgerAcceptInputV31, RelayLedgerAcceptResultV31, RelayLedgerV31, StoredRelayDeliveryV31 } from '../founder-os-lab/federatedRelay/v31-types.js';

export class RelayTransientErrorV31 extends Error {
  constructor(public readonly code: 'relay_deadlock_retry' | 'relay_serialization_retry') { super(code); this.name = 'RelayTransientErrorV31'; }
}

function mapPostgresError(error: { code?: string; message?: string }): never {
  if (error.code === '40P01') throw new RelayTransientErrorV31('relay_deadlock_retry');
  if (error.code === '40001') throw new RelayTransientErrorV31('relay_serialization_retry');
  throw new Error(error.message || error.code || 'relay_database_error');
}

function relationParentMessageId(input: RelayLedgerAcceptInputV31): string | null {
  const relation = input.envelope.ordering.relation;
  return relation.type === 'root' ? null : relation.parentMessageId;
}

export function createSupabaseRelayLedgerV31(client: SupabaseClient): RelayLedgerV31 {
  return {
    async findByMessageId(messageId: string): Promise<StoredRelayDeliveryV31 | null> {
      const { data, error } = await client.from('federated_relay_messages').select('message_id,semantic_fingerprint,delivery_fingerprint,receipt,status,superseded_by_message_id').eq('message_id', messageId).maybeSingle();
      if (error) mapPostgresError(error);
      if (!data) return null;
      return { messageId: data.message_id as string, semanticFingerprint: data.semantic_fingerprint as string, deliveryFingerprint: data.delivery_fingerprint as string, receipt: data.receipt as FederatedAgentRelayReceiptV31, currentState: data.status as StoredRelayDeliveryV31['currentState'], supersededByMessageId: (data.superseded_by_message_id as string | null) ?? null };
    },
    async accept(input: RelayLedgerAcceptInputV31): Promise<RelayLedgerAcceptResultV31> {
      const envelope = input.envelope;
      const relation = envelope.ordering.relation;
      const { data, error } = await client.rpc('federated_relay_accept_v31', {
        p_contract: envelope.contract, p_message_id: envelope.messageId, p_semantic_fingerprint: input.semanticFingerprint, p_delivery_fingerprint: input.deliveryFingerprint, p_receipt_id: input.receipt.receiptId,
        p_chain_id: envelope.ordering.chainId, p_chain_position: envelope.ordering.chainPosition, p_relation_type: relation.type, p_parent_message_id: relationParentMessageId(input), p_logical_operation_id: envelope.ordering.logicalOperationId,
        p_source_member: envelope.source.member, p_source_repository: envelope.source.repository, p_source_branch: envelope.source.branch, p_source_head_sha: envelope.source.headSha, p_source_key_id: envelope.signature.keyId, p_source_sequence: envelope.ordering.sourceSequence,
        p_target_member: envelope.target.member, p_target_repository: envelope.target.repository, p_target_branch: envelope.target.branch, p_target_head_sha: envelope.target.headSha,
        p_nonce: envelope.nonce, p_reply_to_message_id: envelope.replyToMessageId ?? null, p_predecessor_proof_cookie: envelope.predecessorProofCookie, p_successor_proof_cookie: input.successorProofCookie,
        p_payload_sha256: envelope.payload.sha256, p_evidence_digest: input.evidenceDigest, p_accepted_key_state: input.receipt.acceptedKeyState, p_issued_at: envelope.issuedAt, p_expires_at: envelope.expiresAt,
        p_envelope: envelope, p_receipt: input.receipt, p_supersedes_message_ids: envelope.supersedesMessageIds,
      });
      if (error) mapPostgresError(error);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || (row.outcome !== 'accepted' && row.outcome !== 'duplicate') || !row.stored_receipt) throw new Error('relay_database_result_invalid');
      return { outcome: row.outcome, receipt: row.stored_receipt as FederatedAgentRelayReceiptV31, currentState: row.current_state as RelayLedgerAcceptResultV31['currentState'], supersededByMessageId: (row.superseded_by_message_id as string | null) ?? null };
    },
  };
}
