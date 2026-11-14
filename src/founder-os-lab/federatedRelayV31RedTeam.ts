import type { FederatedAgentRelayEnvelopeV31 } from './federatedRelayV31.js';

export interface RelayAttackMutationV31 {
  name: string;
  apply(envelope: FederatedAgentRelayEnvelopeV31 & Record<string, unknown>): void;
}

const clone = <T>(value: T): T => structuredClone(value);

export const RELAY_V31_MUTATIONS: readonly RelayAttackMutationV31[] = [
  { name: 'contract_invalid', apply: (e) => { e.contract = 'juss/federated-agent-relay@evil' as never; } },
  { name: 'message_id_invalid', apply: (e) => { e.messageId = 'not-a-uuid'; } },
  { name: 'nonce_invalid', apply: (e) => { e.nonce = 'not-a-uuid'; } },
  { name: 'chain_id_invalid', apply: (e) => { e.ordering.chainId = 'bad'; } },
  { name: 'logical_operation_invalid', apply: (e) => { e.ordering.logicalOperationId = 'bad'; } },
  { name: 'source_sequence_negative', apply: (e) => { e.ordering.sourceSequence = -1; } },
  { name: 'chain_position_negative', apply: (e) => { e.ordering.chainPosition = -1; } },
  { name: 'root_position_nonzero', apply: (e) => { e.ordering.chainPosition = 1; } },
  { name: 'root_cookie_not_genesis', apply: (e) => { e.predecessorProofCookie = 'Q4R:v3.1:forged'; } },
  { name: 'root_reply_to_present', apply: (e) => { e.replyToMessageId = '55555555-5555-4555-8555-555555555555'; } },
  { name: 'relation_type_invalid', apply: (e) => { (e.ordering.relation as { type: string }).type = 'execute'; } },
  { name: 'self_target', apply: (e) => { e.target = clone(e.source); } },
  { name: 'source_repo_mismatch', apply: (e) => { e.source.repository = 'attacker/repo'; } },
  { name: 'target_repo_mismatch', apply: (e) => { e.target.repository = 'attacker/repo'; } },
  { name: 'source_sha_invalid', apply: (e) => { e.source.headSha = 'xyz'; } },
  { name: 'target_sha_invalid', apply: (e) => { e.target.headSha = 'xyz'; } },
  { name: 'issued_at_invalid', apply: (e) => { e.issuedAt = 'not-a-time'; } },
  { name: 'expires_at_invalid', apply: (e) => { e.expiresAt = 'not-a-time'; } },
  { name: 'issued_in_future', apply: (e) => {
    e.issuedAt = '2099-01-01T00:00:00.000Z';
    e.expiresAt = '2099-01-01T00:04:00.000Z';
  } },
  { name: 'expired', apply: (e) => {
    e.issuedAt = '2026-09-13T14:00:00.000Z';
    e.expiresAt = '2026-09-13T14:04:00.000Z';
  } },
  { name: 'ttl_too_long', apply: (e) => {
    e.issuedAt = '2026-09-13T15:00:00.000Z';
    e.expiresAt = '2026-09-13T15:10:00.000Z';
  } },
  { name: 'disposition_invalid', apply: (e) => { e.disposition = 'execute' as never; } },
  { name: 'subject_oversize', apply: (e) => { e.subject = 'x'.repeat(513); } },
  { name: 'payload_type_invalid', apply: (e) => { e.payload.contentType = 'text/html' as never; } },
  { name: 'payload_json_invalid', apply: (e) => { e.payload.body = '{'; } },
  { name: 'context_fingerprint_invalid', apply: (e) => { e.contextFingerprint = 'stale'; } },
  { name: 'evidence_provider_invalid', apply: (e) => {
    const first = e.evidence[0];
    if (first) first.locator.provider = 'internet' as never;
  } },
  { name: 'evidence_state_invalid', apply: (e) => {
    const first = e.evidence[0];
    if (first) first.state = 'believed' as never;
  } },
  { name: 'supersedes_id_invalid', apply: (e) => { e.supersedesMessageIds = ['not-a-uuid']; } },
  { name: 'signature_algorithm_invalid', apply: (e) => { e.signature.algorithm = 'RSA' as never; } },
  { name: 'signature_key_blank', apply: (e) => { e.signature.keyId = ''; } },
  { name: 'unsupported_top_level_field', apply: (e) => { e.executionAuthorized = true; } },
] as const;

export interface RelayAttackCaseV31 {
  name: string;
  envelope: FederatedAgentRelayEnvelopeV31;
}

export function* generateRelayAttack6000V31(
  base: FederatedAgentRelayEnvelopeV31,
): Generator<RelayAttackCaseV31> {
  const mutations = RELAY_V31_MUTATIONS;
  let emitted = 0;
  const emit = (indices: readonly number[]): RelayAttackCaseV31 => {
    const envelope = clone(base) as FederatedAgentRelayEnvelopeV31 & Record<string, unknown>;
    for (const index of indices) mutations[index]!.apply(envelope);
    return {
      name: indices.map((index) => mutations[index]!.name).join('+'),
      envelope,
    };
  };

  for (let i = 0; i < mutations.length && emitted < 6000; i += 1) {
    emitted += 1;
    yield emit([i]);
  }
  for (let i = 0; i < mutations.length && emitted < 6000; i += 1) {
    for (let j = i + 1; j < mutations.length && emitted < 6000; j += 1) {
      emitted += 1;
      yield emit([i, j]);
    }
  }
  for (let i = 0; i < mutations.length && emitted < 6000; i += 1) {
    for (let j = i + 1; j < mutations.length && emitted < 6000; j += 1) {
      for (let k = j + 1; k < mutations.length && emitted < 6000; k += 1) {
        emitted += 1;
        yield emit([i, j, k]);
      }
    }
  }
  for (let i = 0; i < mutations.length && emitted < 6000; i += 1) {
    for (let j = i + 1; j < mutations.length && emitted < 6000; j += 1) {
      for (let k = j + 1; k < mutations.length && emitted < 6000; k += 1) {
        for (let l = k + 1; l < mutations.length && emitted < 6000; l += 1) {
          emitted += 1;
          yield emit([i, j, k, l]);
        }
      }
    }
  }

  if (emitted !== 6000) throw new Error(`relay_attack_generator_count:${emitted}`);
}
