export const FEDERATED_AGENT_RELAY_V31 = 'juss/federated-agent-relay@v3.1' as const;
export const FEDERATED_AGENT_RELAY_RECEIPT_V31 = 'juss/federated-agent-relay-receipt@v3.1' as const;
export const FEDERATED_RELAY_KEY_QUERY_V31 = 'juss/federated-agent-relay-key-query@v3.1' as const;
export const FEDERATED_RELAY_GENESIS_COOKIE_V31 = 'Q4R:v3.1:genesis' as const;

export const FEDERATED_RELAY_V31_MEMBER_REPOSITORIES = {
  'founder-control-room': 'jussray/founder-control-room',
  'chief-ai-machine': 'jussray/chief-ai-machine',
  solcontinuity: 'jussray/solcontinuity',
  promptos: 'jussray/promptos',
} as const;

export type FederatedRelayMemberV31 = keyof typeof FEDERATED_RELAY_V31_MEMBER_REPOSITORIES;
export type FederatedRelayEvidenceStateV31 = 'verified' | 'inferred' | 'unknown' | 'stale' | 'blocked' | 'failed';
export type FederatedRelayDispositionV31 = 'observe' | 'reconcile' | 'propose';
export type FederatedRelayRelationTypeV31 = 'root' | 'reply' | 'revision' | 'reconcile';
export type FederatedRelayKeyStateV31 = 'active' | 'retiring' | 'revoked';

export interface FederatedRelayIdentityV31 {
  member: FederatedRelayMemberV31;
  repository: string;
  branch: string;
  headSha: string;
}

export interface FederatedRelayRelationV31 {
  type: FederatedRelayRelationTypeV31;
  parentMessageId?: string;
}

export interface FederatedRelayOrderingV31 {
  chainId: string;
  sourceSequence: number;
  chainPosition: number;
  logicalOperationId: string;
  relation: FederatedRelayRelationV31;
}

export interface FederatedRelayEvidenceV31 {
  locator: {
    provider: 'github' | 'cloudflare' | 'supabase' | 'juss-proof';
    ref: string;
  };
  state: FederatedRelayEvidenceStateV31;
  sha256?: string;
  proofReceiptId?: string;
}

export interface FederatedRelaySignatureV31 {
  algorithm: 'Ed25519';
  keyId: string;
  valueBase64Url: string;
}

export interface FederatedAgentRelayEnvelopeV31 {
  contract: typeof FEDERATED_AGENT_RELAY_V31;
  messageId: string;
  replyToMessageId?: string;
  ordering: FederatedRelayOrderingV31;
  source: FederatedRelayIdentityV31;
  target: FederatedRelayIdentityV31;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  disposition: FederatedRelayDispositionV31;
  subject: string;
  payload: {
    contentType: 'text/plain' | 'application/json';
    body: string;
    sha256: string;
  };
  contextFingerprint: string;
  predecessorProofCookie: string;
  evidence: FederatedRelayEvidenceV31[];
  supersedesMessageIds: string[];
  signature: FederatedRelaySignatureV31;
}

export interface FederatedRelayPublicKeyV31 {
  member: FederatedRelayMemberV31;
  keyId: string;
  publicKeyJwk: JsonWebKey;
  state: FederatedRelayKeyStateV31;
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
}

export interface FederatedRelayUnsignedReceiptV31 {
  contract: typeof FEDERATED_AGENT_RELAY_RECEIPT_V31;
  receiptId: string;
  delivery: 'accepted';
  messageId: string;
  semanticFingerprint: string;
  deliveryFingerprint: string;
  predecessorProofCookie: string;
  successorProofCookie: string;
  sourceHeadSha: string;
  targetObservedHeadSha: string;
  sourceCommitEvidence: {
    repository: string;
    branch: string;
    headSha: string;
    state: 'reachable_at_acceptance';
    checkedAt: string;
  };
  evidenceDigest: string;
  acceptedKey: {
    member: FederatedRelayMemberV31;
    keyId: string;
    stateAtAcceptance: 'active' | 'retiring';
    validFrom: string;
    validUntil: string | null;
  };
  acceptedAt: string;
  executionAuthorized: false;
  authorityTransferred: false;
  approvalCarriedForward: false;
  nextGate: string;
  receiver: FederatedRelayIdentityV31 & { keyId: string };
}

export type FederatedRelayReceiptV31 = FederatedRelayUnsignedReceiptV31 & {
  signature: FederatedRelaySignatureV31;
};

export interface RelayDeliveryResultV31 {
  delivery: 'accepted' | 'duplicate';
  receipt: FederatedRelayReceiptV31;
  currentState: 'accepted' | 'superseded' | 'revoked';
  supersededByMessageId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64URL_64 = /^[A-Za-z0-9_-]{86}$/;
const KEY_ID = /^[A-Za-z0-9._:-]{3,200}$/;
const MAX_ENVELOPE_BYTES = 512 * 1024;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_TTL_MS = 5 * 60_000;
const CLOCK_SKEW_MS = 30_000;

const TOP_LEVEL = new Set([
  'contract','messageId','replyToMessageId','ordering','source','target','issuedAt','expiresAt','nonce',
  'disposition','subject','payload','contextFingerprint','predecessorProofCookie','evidence',
  'supersedesMessageIds','signature',
]);

export class FederatedRelayV31Error extends Error {
  constructor(readonly code: string, readonly status = 400, message = code) {
    super(message);
    this.name = 'FederatedRelayV31Error';
  }
}

function assert(condition: unknown, code: string, status = 400): asserts condition {
  if (!condition) throw new FederatedRelayV31Error(code, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function exactKeys(value: unknown, allowed: readonly string[], required: readonly string[], code: string): Record<string, unknown> {
  assert(isRecord(value), code);
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) assert(allow.has(key), `${code}_field`);
  for (const key of required) assert(Object.prototype.hasOwnProperty.call(value, key), `${code}_missing`);
  return value;
}

function boundedString(value: unknown, min: number, max: number, code: string): string {
  assert(typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000\r\n]/u.test(value), code);
  return value;
}

function exactInteger(value: unknown, code: string): number {
  assert(Number.isSafeInteger(value) && Number(value) >= 0, code);
  return Number(value);
}

function exactUuid(value: unknown, code: string): string {
  assert(typeof value === 'string' && UUID.test(value), code);
  return value;
}

function exactSha40(value: unknown, code: string): string {
  assert(typeof value === 'string' && SHA40.test(value), code);
  return value;
}

function exactSha256(value: unknown, code: string): string {
  assert(typeof value === 'string' && SHA256.test(value), code);
  return value;
}

function iso(value: unknown, code: string): string {
  assert(typeof value === 'string', code);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value, code);
  return value;
}

function noLoneSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function canonicalizeRelayJsonV31(value: unknown, depth = 0): string {
  assert(depth <= 64, 'relay_jcs_depth');
  if (value === null) return 'null';
  if (typeof value === 'string') {
    assert(noLoneSurrogates(value), 'relay_jcs_lone_surrogate');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'relay_jcs_nonfinite');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  assert(value !== undefined, 'relay_jcs_undefined');
  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeRelayJsonV31(item, depth + 1)).join(',')}]`;
  assert(isRecord(value), 'relay_jcs_nonplain_object');
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => {
    assert(value[key] !== undefined, 'relay_jcs_undefined_prop');
    return `${canonicalizeRelayJsonV31(key, depth + 1)}:${canonicalizeRelayJsonV31(value[key], depth + 1)}`;
  }).join(',')}}`;
}

function assertNoDuplicateObjectKeys(raw: string): void {
  const stack: Array<{ type: '{' | '['; keys?: Set<string> }> = [];
  let index = 0;
  while (index < raw.length) {
    const char = raw[index];
    if (char === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < raw.length) {
        const next = raw[index];
        if (escaped) escaped = false;
        else if (next === '\\') escaped = true;
        else if (next === '"') break;
        index += 1;
      }
      assert(index < raw.length, 'relay_json_invalid');
      const literal = raw.slice(start, index + 1);
      const decoded = JSON.parse(literal) as string;
      assert(noLoneSurrogates(decoded), 'relay_jcs_lone_surrogate');
      let lookahead = index + 1;
      while (/\s/u.test(raw[lookahead] ?? '')) lookahead += 1;
      const current = stack.at(-1);
      if (current?.type === '{' && raw[lookahead] === ':') {
        assert(!current.keys!.has(decoded), 'relay_json_duplicate_key');
        current.keys!.add(decoded);
      }
    } else if (char === '{') stack.push({ type: '{', keys: new Set() });
    else if (char === '[') stack.push({ type: '[' });
    else if (char === '}' || char === ']') stack.pop();
    index += 1;
  }
}

export function parseCanonicalRelayJsonV31(raw: string): FederatedAgentRelayEnvelopeV31 {
  assert(new TextEncoder().encode(raw).byteLength <= MAX_ENVELOPE_BYTES, 'relay_envelope_too_large', 413);
  assertNoDuplicateObjectKeys(raw);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new FederatedRelayV31Error('relay_json_invalid'); }
  assert(raw === canonicalizeRelayJsonV31(parsed), 'relay_transport_not_canonical_jcs');
  return parseFederatedAgentRelayEnvelopeV31(parsed);
}

function assertJsonPayloadDepth(body: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new FederatedRelayV31Error('relay_payload_json_invalid'); }
  const stack: Array<{ value: unknown; depth: number }> = [{ value: parsed, depth: 0 }];
  while (stack.length) {
    const current = stack.pop()!;
    assert(current.depth <= 32, 'relay_payload_json_depth');
    if (!current.value || typeof current.value !== 'object') continue;
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value as Record<string, unknown>);
    children.forEach((child) => stack.push({ value: child, depth: current.depth + 1 }));
  }
}

function parseIdentity(value: unknown, code: string): FederatedRelayIdentityV31 {
  const record = exactKeys(value, ['member','repository','branch','headSha'], ['member','repository','branch','headSha'], code);
  const member = boundedString(record.member, 3, 64, `${code}_member`) as FederatedRelayMemberV31;
  assert(member in FEDERATED_RELAY_V31_MEMBER_REPOSITORIES, `${code}_member`);
  const repository = boundedString(record.repository, 3, 300, `${code}_repository`);
  assert(repository === FEDERATED_RELAY_V31_MEMBER_REPOSITORIES[member], `${code}_repository_mismatch`);
  return {
    member,
    repository,
    branch: boundedString(record.branch, 1, 120, `${code}_branch`),
    headSha: exactSha40(record.headSha, `${code}_head_sha`),
  };
}

function parseEvidence(value: unknown): FederatedRelayEvidenceV31[] {
  assert(Array.isArray(value) && value.length <= 64, 'relay_evidence_invalid');
  return value.map((entry) => {
    const record = exactKeys(entry, ['locator','state','sha256','proofReceiptId'], ['locator','state'], 'relay_evidence_entry_invalid');
    const locator = exactKeys(record.locator, ['provider','ref'], ['provider','ref'], 'relay_evidence_locator_invalid');
    const provider = boundedString(locator.provider, 3, 20, 'relay_evidence_provider_invalid');
    assert(['github','cloudflare','supabase','juss-proof'].includes(provider), 'relay_evidence_provider_invalid');
    const state = boundedString(record.state, 5, 20, 'relay_evidence_state_invalid') as FederatedRelayEvidenceStateV31;
    assert(['verified','inferred','unknown','stale','blocked','failed'].includes(state), 'relay_evidence_state_invalid');
    return {
      locator: { provider: provider as FederatedRelayEvidenceV31['locator']['provider'], ref: boundedString(locator.ref, 1, 2_000, 'relay_evidence_ref_invalid') },
      state,
      ...(record.sha256 === undefined ? {} : { sha256: exactSha256(record.sha256, 'relay_evidence_sha_invalid') }),
      ...(record.proofReceiptId === undefined ? {} : { proofReceiptId: boundedString(record.proofReceiptId, 1, 300, 'relay_evidence_receipt_invalid') }),
    };
  });
}

export function parseFederatedAgentRelayEnvelopeV31(value: unknown): FederatedAgentRelayEnvelopeV31 {
  const record = exactKeys(value, [...TOP_LEVEL], [
    'contract','messageId','ordering','source','target','issuedAt','expiresAt','nonce','disposition','subject','payload',
    'contextFingerprint','predecessorProofCookie','evidence','supersedesMessageIds','signature',
  ], 'relay_envelope_invalid');
  assert(record.contract === FEDERATED_AGENT_RELAY_V31, 'relay_contract_unsupported');
  const orderingRecord = exactKeys(record.ordering, ['chainId','sourceSequence','chainPosition','logicalOperationId','relation'], ['chainId','sourceSequence','chainPosition','logicalOperationId','relation'], 'relay_ordering_invalid');
  const relationRecord = exactKeys(orderingRecord.relation, ['type','parentMessageId'], ['type'], 'relay_relation_invalid');
  const relationType = boundedString(relationRecord.type, 4, 9, 'relay_relation_type_invalid') as FederatedRelayRelationTypeV31;
  assert(['root','reply','revision','reconcile'].includes(relationType), 'relay_relation_type_invalid');
  const parentMessageId = relationRecord.parentMessageId === undefined ? undefined : exactUuid(relationRecord.parentMessageId, 'relay_parent_message_id_invalid');
  if (relationType === 'root') assert(parentMessageId === undefined, 'relay_root_parent_rejected');
  else assert(parentMessageId, 'relay_parent_message_id_missing');

  const ordering: FederatedRelayOrderingV31 = {
    chainId: exactUuid(orderingRecord.chainId, 'relay_chain_id_invalid'),
    sourceSequence: exactInteger(orderingRecord.sourceSequence, 'relay_source_sequence_invalid'),
    chainPosition: exactInteger(orderingRecord.chainPosition, 'relay_chain_position_invalid'),
    logicalOperationId: exactUuid(orderingRecord.logicalOperationId, 'relay_logical_operation_id_invalid'),
    relation: { type: relationType, ...(parentMessageId ? { parentMessageId } : {}) },
  };
  const messageId = exactUuid(record.messageId, 'relay_message_id_invalid');
  const replyToMessageId = record.replyToMessageId === undefined ? undefined : exactUuid(record.replyToMessageId, 'relay_reply_to_invalid');
  if (relationType === 'root') {
    assert(ordering.chainPosition === 0 && replyToMessageId === undefined && record.predecessorProofCookie === FEDERATED_RELAY_GENESIS_COOKIE_V31, 'relay_root_invalid');
  } else {
    assert(ordering.chainPosition > 0, 'relay_nonroot_chain_position_invalid');
    if (relationType === 'reply') assert(replyToMessageId === parentMessageId, 'relay_reply_parent_mismatch');
    else assert(replyToMessageId === undefined, 'relay_nonreply_reply_to_rejected');
  }

  const source = parseIdentity(record.source, 'relay_source');
  const target = parseIdentity(record.target, 'relay_target');
  assert(source.member !== target.member, 'relay_same_member_rejected');
  const disposition = boundedString(record.disposition, 7, 9, 'relay_disposition_invalid') as FederatedRelayDispositionV31;
  assert(['observe','reconcile','propose'].includes(disposition), 'relay_disposition_invalid');

  const payloadRecord = exactKeys(record.payload, ['contentType','body','sha256'], ['contentType','body','sha256'], 'relay_payload_invalid');
  const contentType = boundedString(payloadRecord.contentType, 9, 24, 'relay_payload_content_type_invalid');
  assert(contentType === 'text/plain' || contentType === 'application/json', 'relay_payload_content_type_invalid');
  const body = typeof payloadRecord.body === 'string' ? payloadRecord.body : '';
  assert(new TextEncoder().encode(body).byteLength <= MAX_PAYLOAD_BYTES, 'relay_payload_size_invalid');
  if (contentType === 'application/json') assertJsonPayloadDepth(body);

  assert(Array.isArray(record.supersedesMessageIds) && record.supersedesMessageIds.length <= 64, 'relay_supersedes_invalid');
  const supersedesMessageIds = record.supersedesMessageIds.map((item) => exactUuid(item, 'relay_supersedes_id_invalid'));
  assert(new Set(supersedesMessageIds).size === supersedesMessageIds.length && !supersedesMessageIds.includes(messageId), 'relay_supersedes_invalid');
  if (relationType === 'revision') {
    assert(supersedesMessageIds.length === 1 && supersedesMessageIds[0] === parentMessageId, 'relay_revision_supersession_invalid');
  } else {
    assert(supersedesMessageIds.length === 0, 'relay_supersession_requires_revision');
  }

  const signatureRecord = exactKeys(record.signature, ['algorithm','keyId','valueBase64Url'], ['algorithm','keyId','valueBase64Url'], 'relay_signature_invalid');
  assert(signatureRecord.algorithm === 'Ed25519', 'relay_signature_algorithm_rejected');
  const keyId = boundedString(signatureRecord.keyId, 3, 200, 'relay_signing_key_id_invalid');
  assert(KEY_ID.test(keyId), 'relay_signing_key_id_invalid');
  const valueBase64Url = boundedString(signatureRecord.valueBase64Url, 86, 86, 'relay_signature_base64url_invalid');
  assert(BASE64URL_64.test(valueBase64Url), 'relay_signature_base64url_invalid');

  return {
    contract: FEDERATED_AGENT_RELAY_V31,
    messageId,
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ordering,
    source,
    target,
    issuedAt: iso(record.issuedAt, 'relay_issued_at_invalid'),
    expiresAt: iso(record.expiresAt, 'relay_expires_at_invalid'),
    nonce: exactUuid(record.nonce, 'relay_nonce_invalid'),
    disposition,
    subject: boundedString(record.subject, 1, 512, 'relay_subject_invalid'),
    payload: { contentType, body, sha256: exactSha256(payloadRecord.sha256, 'relay_payload_sha_invalid') },
    contextFingerprint: exactSha256(record.contextFingerprint, 'relay_context_fingerprint_invalid'),
    predecessorProofCookie: boundedString(record.predecessorProofCookie, 8, 300, 'relay_proof_cookie_invalid'),
    evidence: parseEvidence(record.evidence),
    supersedesMessageIds,
    signature: { algorithm: 'Ed25519', keyId, valueBase64Url },
  };
}

export function assertRelayFreshnessV31(envelope: FederatedAgentRelayEnvelopeV31, now: Date): void {
  const issued = Date.parse(envelope.issuedAt);
  const expires = Date.parse(envelope.expiresAt);
  assert(expires > issued && expires - issued <= MAX_TTL_MS, 'relay_invalid_expiry');
  assert(issued <= now.getTime() + CLOCK_SKEW_MS, 'relay_issued_in_future');
  assert(now.getTime() <= expires, 'relay_expired', 409);
}

export function assertRelayKeyUsableV31(key: FederatedRelayPublicKeyV31, member: FederatedRelayMemberV31, issuedAt: string, acceptedAt: string): void {
  assert(key.member === member, 'relay_source_key_member_mismatch', 401);
  assert(key.state === 'active' || key.state === 'retiring', 'relay_signing_key_revoked', 401);
  assert(!key.revokedAt, 'relay_signing_key_revoked', 401);
  const issued = Date.parse(issuedAt);
  const accepted = Date.parse(acceptedAt);
  const validFrom = Date.parse(key.validFrom);
  const validUntil = key.validUntil ? Date.parse(key.validUntil) : Number.POSITIVE_INFINITY;
  assert(Number.isFinite(validFrom) && issued >= validFrom && accepted >= validFrom && issued <= validUntil && accepted <= validUntil, 'relay_signing_key_not_current', 401);
}

function decodeBase64Url64(value: string): Uint8Array {
  assert(BASE64URL_64.test(value), 'relay_signature_base64url_invalid', 401);
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try { binary = globalThis.atob(normalized + padding); } catch { throw new FederatedRelayV31Error('relay_signature_base64url_invalid', 401); }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  assert(bytes.byteLength === 64, 'relay_signature_length_invalid', 401);
  const canonical = globalThis.btoa(String.fromCharCode(...bytes)).replace(/=+$/u, '').replace(/\+/g, '-').replace(/\//g, '_');
  assert(canonical === value, 'relay_signature_base64url_noncanonical', 401);
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return globalThis.btoa(String.fromCharCode(...bytes)).replace(/=+$/u, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function sha256HexV31(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function taggedDigest(tag: string, parts: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const framed = [tag, '\u0000', ...parts.flatMap((part) => [String(encoder.encode(part).byteLength), '\u0000', part, '\u0000'])].join('');
  return sha256HexV31(framed);
}

function unsignedEnvelope(envelope: FederatedAgentRelayEnvelopeV31): Omit<FederatedAgentRelayEnvelopeV31, 'signature'> {
  const { signature: _signature, ...unsigned } = envelope;
  return unsigned;
}

export async function semanticFingerprintV31(envelope: FederatedAgentRelayEnvelopeV31): Promise<string> {
  const semantic = {
    contract: envelope.contract,
    logicalOperationId: envelope.ordering.logicalOperationId,
    relation: envelope.ordering.relation,
    source: envelope.source,
    target: envelope.target,
    disposition: envelope.disposition,
    subject: envelope.subject,
    payload: envelope.payload,
    contextFingerprint: envelope.contextFingerprint,
    evidence: envelope.evidence,
    supersedesMessageIds: envelope.supersedesMessageIds,
  };
  return sha256HexV31(canonicalizeRelayJsonV31(semantic));
}

export async function deliveryFingerprintV31(envelope: FederatedAgentRelayEnvelopeV31): Promise<string> {
  return sha256HexV31(canonicalizeRelayJsonV31(envelope));
}

export async function evidenceDigestV31(evidence: FederatedRelayEvidenceV31[]): Promise<string> {
  return taggedDigest('juss.federated-relay.evidence.v3.1', [canonicalizeRelayJsonV31(evidence)]);
}

export async function successorProofCookieV31(envelope: FederatedAgentRelayEnvelopeV31, deliveryFingerprint: string): Promise<string> {
  const digest = await taggedDigest('juss.federated-relay.cookie.v3.1', [
    envelope.ordering.chainId,
    envelope.predecessorProofCookie,
    deliveryFingerprint,
    envelope.nonce,
    envelope.source.member,
    envelope.target.member,
  ]);
  return `Q4R:v3.1:${digest}`;
}

export async function signRelayEnvelopeV31(
  unsigned: Omit<FederatedAgentRelayEnvelopeV31, 'signature'>,
  privateKey: CryptoKey,
  keyId: string,
): Promise<FederatedAgentRelayEnvelopeV31> {
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(canonicalizeRelayJsonV31(unsigned)));
  return parseFederatedAgentRelayEnvelopeV31({
    ...unsigned,
    signature: { algorithm: 'Ed25519', keyId, valueBase64Url: encodeBase64Url(new Uint8Array(signature)) },
  });
}

export async function verifyRelayEnvelopeSignatureV31(envelope: FederatedAgentRelayEnvelopeV31, key: FederatedRelayPublicKeyV31): Promise<void> {
  const publicKey = await crypto.subtle.importKey('jwk', key.publicKeyJwk, { name: 'Ed25519' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'Ed25519',
    publicKey,
    decodeBase64Url64(envelope.signature.valueBase64Url),
    new TextEncoder().encode(canonicalizeRelayJsonV31(unsignedEnvelope(envelope))),
  );
  assert(valid, 'relay_signature_invalid', 401);
}

export async function verifyRelayEnvelopeV31(input: {
  envelope: FederatedAgentRelayEnvelopeV31;
  key: FederatedRelayPublicKeyV31;
  acceptedAt: Date;
}): Promise<{
  semanticFingerprint: string;
  deliveryFingerprint: string;
  evidenceDigest: string;
  successorProofCookie: string;
}> {
  const acceptedAt = input.acceptedAt;
  assertRelayFreshnessV31(input.envelope, acceptedAt);
  assertRelayKeyUsableV31(input.key, input.envelope.source.member, input.envelope.issuedAt, acceptedAt.toISOString());
  assert(input.key.keyId === input.envelope.signature.keyId, 'relay_signing_key_id_mismatch', 401);
  const payloadDigest = await sha256HexV31(input.envelope.payload.body);
  assert(payloadDigest === input.envelope.payload.sha256, 'relay_payload_digest_mismatch');
  await verifyRelayEnvelopeSignatureV31(input.envelope, input.key);
  const deliveryFingerprint = await deliveryFingerprintV31(input.envelope);
  return {
    semanticFingerprint: await semanticFingerprintV31(input.envelope),
    deliveryFingerprint,
    evidenceDigest: await evidenceDigestV31(input.envelope.evidence),
    successorProofCookie: await successorProofCookieV31(input.envelope, deliveryFingerprint),
  };
}

function unsignedReceipt(receipt: FederatedRelayReceiptV31): FederatedRelayUnsignedReceiptV31 {
  const { signature: _signature, ...unsigned } = receipt;
  return unsigned;
}

export async function signRelayReceiptV31(
  receipt: FederatedRelayUnsignedReceiptV31,
  privateKey: CryptoKey,
  keyId: string,
): Promise<FederatedRelayReceiptV31> {
  const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(canonicalizeRelayJsonV31(receipt)));
  return {
    ...receipt,
    signature: { algorithm: 'Ed25519', keyId, valueBase64Url: encodeBase64Url(new Uint8Array(signature)) },
  };
}

export async function verifyRelayReceiptV31(
  receipt: FederatedRelayReceiptV31,
  key: FederatedRelayPublicKeyV31,
): Promise<void> {
  assert(receipt.contract === FEDERATED_AGENT_RELAY_RECEIPT_V31, 'relay_receipt_contract_invalid');
  assert(receipt.executionAuthorized === false && receipt.authorityTransferred === false && receipt.approvalCarriedForward === false, 'relay_receipt_authority_invalid');
  assert(receipt.signature.algorithm === 'Ed25519' && receipt.signature.keyId === key.keyId, 'relay_receipt_key_mismatch', 401);
  assertRelayKeyUsableV31(key, receipt.receiver.member, receipt.acceptedAt, receipt.acceptedAt);
  const publicKey = await crypto.subtle.importKey('jwk', key.publicKeyJwk, { name: 'Ed25519' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'Ed25519',
    publicKey,
    decodeBase64Url64(receipt.signature.valueBase64Url),
    new TextEncoder().encode(canonicalizeRelayJsonV31(unsignedReceipt(receipt))),
  );
  assert(valid, 'relay_receipt_signature_invalid', 401);
}

export function canonicalTransportByteLengthV31(envelope: FederatedAgentRelayEnvelopeV31): number {
  return new TextEncoder().encode(canonicalizeRelayJsonV31(envelope)).byteLength;
}
