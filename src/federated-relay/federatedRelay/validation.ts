import {
  FEDERATED_AGENT_MEMBERS_V31,
  FEDERATED_AGENT_RELAY_V31,
  GENESIS_PROOF_COOKIE_V31,
  RELAY_V31_LIMITS,
  type FederatedAgentMemberV31,
  type FederatedAgentRelayEnvelopeV31,
  type RelayMemberIdentityV31,
  RelayV31Error,
} from './v31-types.js';
import { canonicalizeRelayJcsV31 } from './jcs.js';

const MEMBER_REPOSITORIES_V31: Readonly<Record<FederatedAgentMemberV31, string>> = {
  'founder-control-room': 'jussray/founder-control-room',
  'chief-ai-machine': 'jussray/chief-ai-machine',
  solcontinuity: 'jussray/solcontinuity',
  promptos: 'jussray/promptos',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40_RE = /^[0-9a-f]{40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RelayV31Error(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertNoUnsupportedKeys(record: Record<string, unknown>, allowed: readonly string[], code: string): void {
  const allowedSet = new Set(allowed);
  assert(Object.keys(record).every((key) => allowedSet.has(key)), code);
}

export function assertRelayUuidV31(value: unknown, code: string): asserts value is string {
  assert(typeof value === 'string' && UUID_RE.test(value), code);
}

function assertIsoTimestamp(value: unknown, code: string): asserts value is string {
  assert(typeof value === 'string', code);
  const ms = Date.parse(value);
  assert(Number.isFinite(ms) && new Date(ms).toISOString() === value, code);
}

function assertMemberIdentity(value: unknown, code: string): asserts value is RelayMemberIdentityV31 {
  assert(isPlainRecord(value), code);
  assert(typeof value.member === 'string' && FEDERATED_AGENT_MEMBERS_V31.includes(value.member as FederatedAgentMemberV31), `${code}_member`);
  const member = value.member as FederatedAgentMemberV31;
  assert(value.repository === MEMBER_REPOSITORIES_V31[member], `${code}_repository`);
  assert(typeof value.branch === 'string' && value.branch.length > 0 && value.branch.length <= 120, `${code}_branch`);
  assert(typeof value.headSha === 'string' && SHA40_RE.test(value.headSha), `${code}_head_sha`);
}

export function parseCanonicalRelayV31Json(raw: string): FederatedAgentRelayEnvelopeV31 {
  assert(Buffer.byteLength(raw, 'utf8') <= RELAY_V31_LIMITS.maxEnvelopeBytes, 'relay_envelope_too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new RelayV31Error('relay_json_invalid');
  }
  const canonical = canonicalizeRelayJcsV31(parsed);
  assert(raw === canonical, 'relay_transport_not_canonical_jcs');
  assertFederatedRelayEnvelopeV31(parsed);
  return parsed;
}

export function assertFederatedRelayEnvelopeV31(input: unknown): asserts input is FederatedAgentRelayEnvelopeV31 {
  assert(isPlainRecord(input), 'relay_shape');
  assertNoUnsupportedKeys(input, [
    'contract', 'messageId', 'replyToMessageId', 'ordering', 'source', 'target', 'issuedAt', 'expiresAt',
    'nonce', 'disposition', 'subject', 'payload', 'contextFingerprint', 'predecessorProofCookie', 'evidence',
    'supersedesMessageIds', 'signature',
  ], 'relay_unsupported_field');
  assert(input.contract === FEDERATED_AGENT_RELAY_V31, 'relay_contract');
  assertRelayUuidV31(input.messageId, 'relay_message_id');
  if (input.replyToMessageId !== undefined) assertRelayUuidV31(input.replyToMessageId, 'relay_reply_to_message_id');
  assertRelayUuidV31(input.nonce, 'relay_nonce');

  assert(isPlainRecord(input.ordering), 'relay_ordering');
  assertNoUnsupportedKeys(input.ordering, ['chainId', 'sourceSequence', 'chainPosition', 'logicalOperationId', 'relation'], 'relay_ordering_field');
  assertRelayUuidV31(input.ordering.chainId, 'relay_chain_id');
  assertRelayUuidV31(input.ordering.logicalOperationId, 'relay_logical_operation_id');
  assert(Number.isSafeInteger(input.ordering.sourceSequence) && (input.ordering.sourceSequence as number) >= 0, 'relay_source_sequence');
  assert(Number.isSafeInteger(input.ordering.chainPosition) && (input.ordering.chainPosition as number) >= 0, 'relay_chain_position');
  assert(isPlainRecord(input.ordering.relation), 'relay_relation');
  assert(typeof input.ordering.relation.type === 'string' && ['root', 'reply', 'revision', 'reconcile'].includes(input.ordering.relation.type), 'relay_relation_type');

  if (input.ordering.relation.type === 'root') {
    assertNoUnsupportedKeys(input.ordering.relation, ['type'], 'relay_root_relation_field');
    assert(input.ordering.chainPosition === 0, 'relay_root_chain_position');
    assert(input.replyToMessageId === undefined, 'relay_root_reply_to');
    assert(input.predecessorProofCookie === GENESIS_PROOF_COOKIE_V31, 'relay_root_cookie_not_genesis');
  } else {
    assertNoUnsupportedKeys(input.ordering.relation, ['type', 'parentMessageId'], 'relay_relation_field');
    assertRelayUuidV31(input.ordering.relation.parentMessageId, 'relay_parent_message_id');
    assert(input.ordering.chainPosition > 0, 'relay_nonroot_chain_position');
    if (input.ordering.relation.type === 'reply') {
      assert(input.replyToMessageId === input.ordering.relation.parentMessageId, 'relay_reply_parent_mismatch');
    } else {
      assert(input.replyToMessageId === undefined, 'relay_nonreply_reply_to');
    }
  }

  assertMemberIdentity(input.source, 'relay_source');
  assertMemberIdentity(input.target, 'relay_target');
  assert(input.source.member !== input.target.member, 'relay_self_target');
  assertIsoTimestamp(input.issuedAt, 'relay_issued_at');
  assertIsoTimestamp(input.expiresAt, 'relay_expires_at');
  assert(typeof input.disposition === 'string' && ['observe', 'reconcile', 'propose'].includes(input.disposition), 'relay_disposition');
  assert(typeof input.subject === 'string' && input.subject.length > 0 && input.subject.length <= RELAY_V31_LIMITS.maxSubjectChars, 'relay_subject');

  assert(isPlainRecord(input.payload), 'relay_payload');
  assertNoUnsupportedKeys(input.payload, ['contentType', 'body', 'sha256'], 'relay_payload_field');
  assert(typeof input.payload.contentType === 'string' && ['text/plain', 'application/json'].includes(input.payload.contentType), 'relay_payload_type');
  assert(typeof input.payload.body === 'string' && Buffer.byteLength(input.payload.body, 'utf8') <= RELAY_V31_LIMITS.maxPayloadBytes, 'relay_payload_body');
  assert(typeof input.payload.sha256 === 'string' && SHA256_RE.test(input.payload.sha256), 'relay_payload_sha');
  if (input.payload.contentType === 'application/json') parseBoundedJsonPayloadV31(input.payload.body);

  assert(typeof input.contextFingerprint === 'string' && SHA256_RE.test(input.contextFingerprint), 'relay_context_fingerprint');
  assert(typeof input.predecessorProofCookie === 'string' && input.predecessorProofCookie.length > 0 && input.predecessorProofCookie.length <= 300, 'relay_predecessor_cookie');

  assert(Array.isArray(input.evidence) && input.evidence.length <= RELAY_V31_LIMITS.maxEvidence, 'relay_evidence');
  for (const item of input.evidence) {
    assert(isPlainRecord(item), 'relay_evidence_item');
    assertNoUnsupportedKeys(item, ['locator', 'state', 'sha256', 'proofReceiptId'], 'relay_evidence_field');
    assert(isPlainRecord(item.locator), 'relay_evidence_locator');
    assertNoUnsupportedKeys(item.locator, ['provider', 'ref'], 'relay_evidence_locator_field');
    assert(typeof item.locator.provider === 'string' && ['github', 'cloudflare', 'supabase', 'juss-proof'].includes(item.locator.provider), 'relay_evidence_provider');
    assert(typeof item.locator.ref === 'string' && item.locator.ref.length > 0 && item.locator.ref.length <= 2_000, 'relay_evidence_ref');
    assert(typeof item.state === 'string' && ['verified', 'inferred', 'unknown', 'stale', 'blocked', 'failed'].includes(item.state), 'relay_evidence_state');
    if (item.sha256 !== undefined) assert(typeof item.sha256 === 'string' && SHA256_RE.test(item.sha256), 'relay_evidence_sha');
    if (item.proofReceiptId !== undefined) assert(typeof item.proofReceiptId === 'string' && item.proofReceiptId.length > 0 && item.proofReceiptId.length <= 300, 'relay_evidence_receipt_id');
  }

  assert(Array.isArray(input.supersedesMessageIds) && input.supersedesMessageIds.length <= RELAY_V31_LIMITS.maxSupersedes, 'relay_supersedes');
  const supersedes = new Set<string>();
  for (const id of input.supersedesMessageIds) {
    assertRelayUuidV31(id, 'relay_supersedes_message_id');
    assert(id !== input.messageId, 'relay_self_supersession');
    assert(!supersedes.has(id), 'relay_duplicate_supersession');
    supersedes.add(id);
  }
  if (input.ordering.relation.type === 'revision') {
    assert(input.supersedesMessageIds.length > 0, 'relay_revision_without_supersession');
  } else {
    assert(input.supersedesMessageIds.length === 0, 'relay_supersession_requires_revision');
  }

  assert(isPlainRecord(input.signature), 'relay_signature');
  assertNoUnsupportedKeys(input.signature, ['algorithm', 'keyId', 'valueBase64Url'], 'relay_signature_field');
  assert(input.signature.algorithm === 'Ed25519', 'relay_signature_algorithm');
  assert(typeof input.signature.keyId === 'string' && input.signature.keyId.length > 0 && input.signature.keyId.length <= 200, 'relay_signature_key_id');
  assert(typeof input.signature.valueBase64Url === 'string' && BASE64URL_RE.test(input.signature.valueBase64Url), 'relay_signature_value');
}

export function validateRelayFreshnessV31(envelope: FederatedAgentRelayEnvelopeV31, now = Date.now()): void {
  const issued = Date.parse(envelope.issuedAt);
  const expires = Date.parse(envelope.expiresAt);
  assert(expires > issued, 'relay_invalid_expiry');
  assert(expires - issued <= RELAY_V31_LIMITS.maxTtlMs, 'relay_ttl_too_long');
  assert(issued <= now + RELAY_V31_LIMITS.clockSkewMs, 'relay_issued_in_future');
  assert(now <= expires, 'relay_expired');
}

export function parseBoundedJsonPayloadV31(body: string, maxDepth = RELAY_V31_LIMITS.maxPayloadJsonDepth): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new RelayV31Error('relay_payload_not_json');
  }

  const stack: Array<{ value: unknown; depth: number }> = [{ value: parsed, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    assert(current.depth <= maxDepth, 'relay_payload_json_depth');
    if (current.value === null || typeof current.value !== 'object') continue;
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    for (const child of children) stack.push({ value: child, depth: current.depth + 1 });
  }

  return parsed;
}
