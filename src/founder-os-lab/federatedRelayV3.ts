export const FEDERATED_AGENT_RELAY_V3 = 'juss/federated-agent-relay@v3' as const;

export const FEDERATED_RELAY_MEMBER_REPOSITORIES = {
  'founder-control-room': 'jussray/founder-control-room',
  'chief-ai-machine': 'jussray/chief-ai-machine',
  solcontinuity: 'jussray/solcontinuity',
  promptos: 'jussray/promptos',
} as const;

export type FederatedRelayMemberV3 = keyof typeof FEDERATED_RELAY_MEMBER_REPOSITORIES;
export type FederatedRelayEvidenceStateV3 = 'verified' | 'inferred' | 'unknown' | 'stale' | 'blocked' | 'failed';

export interface FederatedRelayIdentityV3 {
  member: FederatedRelayMemberV3;
  repository: string;
  branch: string;
  headSha: string;
}

export interface FederatedRelayOrderingV3 {
  chainId: string;
  sourceSequence: number;
  chainPosition: number;
  logicalOperationId: string;
  predecessorMessageId?: string;
}

export interface FederatedRelayEvidenceV3 {
  ref: string;
  state: FederatedRelayEvidenceStateV3;
  sha256?: string;
  proofReceiptId?: string;
}

export interface FederatedRelaySignatureV3 {
  algorithm: 'Ed25519';
  keyId: string;
  valueBase64Url: string;
}

export interface FederatedAgentRelayEnvelopeV3 {
  contract: typeof FEDERATED_AGENT_RELAY_V3;
  messageId: string;
  replyToMessageId?: string;
  ordering: FederatedRelayOrderingV3;
  source: FederatedRelayIdentityV3;
  target: FederatedRelayIdentityV3;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  disposition: 'observe' | 'reconcile' | 'propose';
  subject: string;
  payload: {
    contentType: 'text/plain' | 'application/json';
    body: string;
    sha256: string;
  };
  contextFingerprint: string;
  predecessorProofCookie: string;
  evidence: FederatedRelayEvidenceV3[];
  supersedesMessageIds: string[];
  signature: FederatedRelaySignatureV3;
}

export interface FederatedRelayPublicKeyV3 {
  member: FederatedRelayMemberV3;
  keyId: string;
  publicKeyJwk: JsonWebKey;
  state: string;
  validFrom: string;
  validUntil?: string | null;
  revokedAt?: string | null;
}

export interface FederatedRelayReceiptV3 {
  contract: typeof FEDERATED_AGENT_RELAY_V3;
  status: 'accepted';
  messageId: string;
  messageFingerprint: string;
  sourceKeyId: string;
  sourceSequence: number;
  chainId: string;
  chainPosition: number;
  logicalOperationId: string;
  predecessorProofCookie: string;
  successorProofCookie: string;
  sourceHeadSha: string;
  targetHeadSha: string;
  evidenceDigest: string;
  executionAuthorized: false;
  authorityTransferred: false;
  approvalCarriedForward: false;
  acceptedAt: string;
}

const MEMBERS = Object.keys(FEDERATED_RELAY_MEMBER_REPOSITORIES) as FederatedRelayMemberV3[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const KEY_ID = /^[A-Za-z0-9:._-]{3,200}$/;
const PROOF_COOKIE = /^[A-Za-z0-9:._-]{8,300}$/;
const FORBIDDEN_AUTHORITY_KEYS = new Set([
  'approval', 'approved', 'authorized', 'authority', 'executionauthorized',
  'authoritytransferred', 'approvalcarriedforward', 'mergeauthority',
  'deployauthority', 'providerwriteauthorized', 'mutationauthorized',
]);
const TOP_LEVEL_FIELDS = new Set([
  'contract', 'messageId', 'replyToMessageId', 'ordering', 'source', 'target',
  'issuedAt', 'expiresAt', 'nonce', 'disposition', 'subject', 'payload',
  'contextFingerprint', 'predecessorProofCookie', 'evidence',
  'supersedesMessageIds', 'signature',
]);
const ORDERING_FIELDS = new Set(['chainId', 'sourceSequence', 'chainPosition', 'logicalOperationId', 'predecessorMessageId']);
const IDENTITY_FIELDS = new Set(['member', 'repository', 'branch', 'headSha']);
const PAYLOAD_FIELDS = new Set(['contentType', 'body', 'sha256']);
const EVIDENCE_FIELDS = new Set(['ref', 'state', 'sha256', 'proofReceiptId']);
const SIGNATURE_FIELDS = new Set(['algorithm', 'keyId', 'valueBase64Url']);

export class FederatedRelayV3Error extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'FederatedRelayV3Error';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, code: string, allowed: Set<string>): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new FederatedRelayV3Error(code);
  }
  return value;
}

function boundedString(value: unknown, min: number, max: number, code: string): string {
  if (typeof value !== 'string') throw new FederatedRelayV3Error(code);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new FederatedRelayV3Error(code);
  return normalized;
}

function exactInteger(value: unknown, min: number, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) throw new FederatedRelayV3Error(code);
  return value as number;
}

function parseUuid(value: unknown, code: string): string {
  const normalized = boundedString(value, 36, 36, code).toLowerCase();
  if (!UUID.test(normalized)) throw new FederatedRelayV3Error(code);
  return normalized;
}

function parseSha40(value: unknown, code: string): string {
  const normalized = boundedString(value, 40, 40, code).toLowerCase();
  if (!SHA40.test(normalized)) throw new FederatedRelayV3Error(code);
  return normalized;
}

function parseSha256(value: unknown, code: string): string {
  const normalized = boundedString(value, 64, 64, code).toLowerCase();
  if (!SHA256.test(normalized)) throw new FederatedRelayV3Error(code);
  return normalized;
}

function parseIso(value: unknown, code: string): string {
  const raw = boundedString(value, 20, 40, code);
  const time = Date.parse(raw);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== raw) throw new FederatedRelayV3Error(code);
  return raw;
}

function containsLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function canonicalizeRelayJsonV3(value: unknown): string {
  const serialize = (input: unknown): string => {
    if (input === null) return 'null';
    if (typeof input === 'boolean') return input ? 'true' : 'false';
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new FederatedRelayV3Error('relay_jcs_non_finite_number');
      return JSON.stringify(input);
    }
    if (typeof input === 'string') {
      if (containsLoneSurrogate(input)) throw new FederatedRelayV3Error('relay_jcs_invalid_unicode');
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) return `[${input.map((item) => serialize(item)).join(',')}]`;
    if (isRecord(input)) {
      const keys = Object.keys(input).sort();
      return `{${keys.map((key) => {
        if (containsLoneSurrogate(key)) throw new FederatedRelayV3Error('relay_jcs_invalid_unicode');
        const child = input[key];
        if (child === undefined || typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') {
          throw new FederatedRelayV3Error('relay_jcs_non_json_value');
        }
        return `${JSON.stringify(key)}:${serialize(child)}`;
      }).join(',')}}`;
    }
    throw new FederatedRelayV3Error('relay_jcs_non_json_value');
  };
  return serialize(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBase64UrlV3(value: string): Uint8Array {
  if (!value || !BASE64URL.test(value)) throw new FederatedRelayV3Error('relay_signature_encoding_invalid');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  let binary: string;
  try {
    binary = globalThis.atob(normalized + padding);
  } catch {
    throw new FederatedRelayV3Error('relay_signature_encoding_invalid');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256HexV3(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function unsignedRelayV3(envelope: FederatedAgentRelayEnvelopeV3): Omit<FederatedAgentRelayEnvelopeV3, 'signature'> {
  const { signature: _signature, ...unsigned } = envelope;
  return unsigned;
}

export async function verifyRelaySignatureV3(
  envelope: FederatedAgentRelayEnvelopeV3,
  publicKeyJwk: JsonWebKey,
): Promise<void> {
  const key = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'Ed25519' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    'Ed25519',
    key,
    decodeBase64UrlV3(envelope.signature.valueBase64Url),
    new TextEncoder().encode(canonicalizeRelayJsonV3(unsignedRelayV3(envelope))),
  );
  if (!valid) throw new FederatedRelayV3Error('relay_signature_invalid');
}

function parseMember(value: unknown, code: string): FederatedRelayMemberV3 {
  if (typeof value !== 'string' || !MEMBERS.includes(value as FederatedRelayMemberV3)) {
    throw new FederatedRelayV3Error(code);
  }
  return value as FederatedRelayMemberV3;
}

function parseIdentity(value: unknown, label: string): FederatedRelayIdentityV3 {
  const record = requireRecord(value, `relay_${label}_invalid`, IDENTITY_FIELDS);
  const member = parseMember(record.member, `relay_${label}_member_invalid`);
  const repository = boundedString(record.repository, 3, 300, `relay_${label}_repository_invalid`);
  const branch = boundedString(record.branch, 1, 120, `relay_${label}_branch_invalid`);
  const headSha = parseSha40(record.headSha, `relay_${label}_head_invalid`);
  if (repository !== FEDERATED_RELAY_MEMBER_REPOSITORIES[member]) {
    throw new FederatedRelayV3Error(`relay_${label}_repository_mismatch`);
  }
  return { member, repository, branch, headSha };
}

function parseOrdering(value: unknown): FederatedRelayOrderingV3 {
  const record = requireRecord(value, 'relay_ordering_invalid', ORDERING_FIELDS);
  const predecessorMessageId = record.predecessorMessageId === undefined
    ? undefined
    : parseUuid(record.predecessorMessageId, 'relay_predecessor_message_id_invalid');
  return {
    chainId: parseUuid(record.chainId, 'relay_chain_id_invalid'),
    sourceSequence: exactInteger(record.sourceSequence, 0, 'relay_source_sequence_invalid'),
    chainPosition: exactInteger(record.chainPosition, 0, 'relay_chain_position_invalid'),
    logicalOperationId: parseUuid(record.logicalOperationId, 'relay_logical_operation_id_invalid'),
    ...(predecessorMessageId ? { predecessorMessageId } : {}),
  };
}

function rejectAuthorityFields(value: unknown, depth = 0): void {
  if (depth > 24) throw new FederatedRelayV3Error('relay_payload_depth_exceeded');
  if (Array.isArray(value)) {
    value.forEach((item) => rejectAuthorityFields(item, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_KEYS.has(key.toLowerCase().replace(/[^a-z]/g, ''))) {
      throw new FederatedRelayV3Error('relay_authority_smuggling_rejected');
    }
    rejectAuthorityFields(child, depth + 1);
  }
}

function parseEvidence(value: unknown): FederatedRelayEvidenceV3[] {
  if (!Array.isArray(value) || value.length > 20) throw new FederatedRelayV3Error('relay_evidence_invalid');
  return value.map((entry) => {
    const record = requireRecord(entry, 'relay_evidence_entry_invalid', EVIDENCE_FIELDS);
    const ref = boundedString(record.ref, 1, 2_000, 'relay_evidence_ref_invalid');
    if (/^[a-z]+:\/\//i.test(ref)) {
      const scheme = ref.slice(0, ref.indexOf(':')).toLowerCase();
      if (!['https', 'github', 'supabase', 'receipt'].includes(scheme)) {
        throw new FederatedRelayV3Error('relay_evidence_scheme_rejected');
      }
      if (scheme === 'https') {
        const parsed = new URL(ref);
        if (parsed.username || parsed.password) throw new FederatedRelayV3Error('relay_evidence_credentials_rejected');
      }
    }
    const state = boundedString(record.state, 5, 20, 'relay_evidence_state_invalid') as FederatedRelayEvidenceStateV3;
    if (!['verified', 'inferred', 'unknown', 'stale', 'blocked', 'failed'].includes(state)) {
      throw new FederatedRelayV3Error('relay_evidence_state_invalid');
    }
    return {
      ref,
      state,
      ...(record.sha256 === undefined ? {} : { sha256: parseSha256(record.sha256, 'relay_evidence_sha_invalid') }),
      ...(record.proofReceiptId === undefined
        ? {}
        : { proofReceiptId: boundedString(record.proofReceiptId, 3, 300, 'relay_evidence_receipt_invalid') }),
    };
  });
}

export function parseFederatedAgentRelayEnvelopeV3(value: unknown): FederatedAgentRelayEnvelopeV3 {
  const record = requireRecord(value, 'relay_envelope_invalid', TOP_LEVEL_FIELDS);
  if (record.contract !== FEDERATED_AGENT_RELAY_V3) throw new FederatedRelayV3Error('relay_contract_unsupported');

  const messageId = parseUuid(record.messageId, 'relay_message_id_invalid');
  const replyToMessageId = record.replyToMessageId === undefined
    ? undefined
    : parseUuid(record.replyToMessageId, 'relay_reply_to_invalid');
  const ordering = parseOrdering(record.ordering);
  const source = parseIdentity(record.source, 'source');
  const target = parseIdentity(record.target, 'target');
  if (source.member === target.member) throw new FederatedRelayV3Error('relay_same_member_rejected');

  const payloadRecord = requireRecord(record.payload, 'relay_payload_invalid', PAYLOAD_FIELDS);
  const contentType = boundedString(payloadRecord.contentType, 9, 24, 'relay_payload_content_type_invalid');
  if (contentType !== 'text/plain' && contentType !== 'application/json') {
    throw new FederatedRelayV3Error('relay_payload_content_type_invalid');
  }
  const body = typeof payloadRecord.body === 'string' ? payloadRecord.body : '';
  if (!body || new TextEncoder().encode(body).byteLength > 32_768) {
    throw new FederatedRelayV3Error('relay_payload_size_invalid');
  }
  if (contentType === 'application/json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new FederatedRelayV3Error('relay_payload_json_invalid');
    }
    rejectAuthorityFields(parsed);
  }

  const signatureRecord = requireRecord(record.signature, 'relay_signature_invalid', SIGNATURE_FIELDS);
  if (signatureRecord.algorithm !== 'Ed25519') throw new FederatedRelayV3Error('relay_signature_algorithm_rejected');
  const keyId = boundedString(signatureRecord.keyId, 3, 200, 'relay_signing_key_id_invalid');
  if (!KEY_ID.test(keyId)) throw new FederatedRelayV3Error('relay_signing_key_id_invalid');
  const valueBase64Url = boundedString(signatureRecord.valueBase64Url, 32, 256, 'relay_signature_encoding_invalid');
  if (!BASE64URL.test(valueBase64Url)) throw new FederatedRelayV3Error('relay_signature_encoding_invalid');

  if (!Array.isArray(record.supersedesMessageIds) || record.supersedesMessageIds.length > 20) {
    throw new FederatedRelayV3Error('relay_supersedes_invalid');
  }
  const supersedesMessageIds = record.supersedesMessageIds.map((id) => parseUuid(id, 'relay_supersedes_id_invalid'));
  if (new Set(supersedesMessageIds).size !== supersedesMessageIds.length || supersedesMessageIds.includes(messageId)) {
    throw new FederatedRelayV3Error('relay_supersedes_invalid');
  }

  if (replyToMessageId) {
    if (ordering.predecessorMessageId !== replyToMessageId) throw new FederatedRelayV3Error('relay_reply_predecessor_mismatch');
    if (ordering.chainPosition === 0) throw new FederatedRelayV3Error('relay_reply_chain_position');
  } else if (ordering.predecessorMessageId !== undefined || ordering.chainPosition !== 0) {
    throw new FederatedRelayV3Error('relay_root_lineage_invalid');
  }

  const disposition = boundedString(record.disposition, 7, 9, 'relay_disposition_invalid');
  if (disposition !== 'observe' && disposition !== 'reconcile' && disposition !== 'propose') {
    throw new FederatedRelayV3Error('relay_disposition_invalid');
  }
  const predecessorProofCookie = boundedString(record.predecessorProofCookie, 8, 300, 'relay_proof_cookie_invalid');
  if (!PROOF_COOKIE.test(predecessorProofCookie)) throw new FederatedRelayV3Error('relay_proof_cookie_invalid');

  return {
    contract: FEDERATED_AGENT_RELAY_V3,
    messageId,
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ordering,
    source,
    target,
    issuedAt: parseIso(record.issuedAt, 'relay_issued_at_invalid'),
    expiresAt: parseIso(record.expiresAt, 'relay_expires_at_invalid'),
    nonce: parseUuid(record.nonce, 'relay_nonce_invalid'),
    disposition,
    subject: boundedString(record.subject, 1, 500, 'relay_subject_invalid'),
    payload: {
      contentType,
      body,
      sha256: parseSha256(payloadRecord.sha256, 'relay_payload_sha_invalid'),
    },
    contextFingerprint: parseSha256(record.contextFingerprint, 'relay_context_fingerprint_invalid'),
    predecessorProofCookie,
    evidence: parseEvidence(record.evidence),
    supersedesMessageIds,
    signature: {
      algorithm: 'Ed25519',
      keyId,
      valueBase64Url,
    },
  };
}

export function assertRelayKeyUsableV3(
  key: FederatedRelayPublicKeyV3,
  sourceMember: FederatedRelayMemberV3,
  now = new Date(),
): void {
  if (key.member !== sourceMember) throw new FederatedRelayV3Error('relay_source_key_member_mismatch');
  if (key.state === 'revoked' || key.revokedAt) throw new FederatedRelayV3Error('relay_signing_key_revoked');
  const validFrom = Date.parse(key.validFrom);
  const validUntil = key.validUntil ? Date.parse(key.validUntil) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(validFrom) || now.getTime() < validFrom || now.getTime() > validUntil) {
    throw new FederatedRelayV3Error('relay_signing_key_not_current');
  }
}

export function assertRelayFreshnessV3(
  envelope: FederatedAgentRelayEnvelopeV3,
  now = new Date(),
  options: { maxTtlMs?: number; futureSkewMs?: number } = {},
): void {
  const maxTtlMs = options.maxTtlMs ?? 600_000;
  const futureSkewMs = options.futureSkewMs ?? 120_000;
  const issuedAt = Date.parse(envelope.issuedAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  if (expiresAt <= issuedAt) throw new FederatedRelayV3Error('relay_invalid_expiry');
  if (expiresAt - issuedAt > maxTtlMs) throw new FederatedRelayV3Error('relay_ttl_exceeded');
  if (issuedAt > now.getTime() + futureSkewMs) throw new FederatedRelayV3Error('relay_issued_in_future');
  if (expiresAt < now.getTime()) throw new FederatedRelayV3Error('relay_expired');
}

export function assertRelayTargetV3(
  envelope: FederatedAgentRelayEnvelopeV3,
  expected: FederatedRelayIdentityV3,
): void {
  if (
    envelope.target.member !== expected.member
    || envelope.target.repository !== expected.repository
    || envelope.target.branch !== expected.branch
    || envelope.target.headSha !== expected.headSha.toLowerCase()
  ) {
    throw new FederatedRelayV3Error('relay_target_identity_stale');
  }
}

export async function verifyRelayEnvelopeV3(input: {
  envelope: FederatedAgentRelayEnvelopeV3;
  key: FederatedRelayPublicKeyV3;
  expectedTarget: FederatedRelayIdentityV3;
  now?: Date;
}): Promise<{
  envelope: FederatedAgentRelayEnvelopeV3;
  messageFingerprint: string;
  evidenceDigest: string;
  successorProofCookie: string;
  receipt: FederatedRelayReceiptV3;
}> {
  const now = input.now ?? new Date();
  const { envelope, key, expectedTarget } = input;
  assertRelayFreshnessV3(envelope, now);
  assertRelayTargetV3(envelope, expectedTarget);
  assertRelayKeyUsableV3(key, envelope.source.member, now);
  if (key.keyId !== envelope.signature.keyId) throw new FederatedRelayV3Error('relay_signing_key_id_mismatch');

  const payloadDigest = await sha256HexV3(envelope.payload.body);
  if (payloadDigest !== envelope.payload.sha256) throw new FederatedRelayV3Error('relay_payload_digest_mismatch');
  await verifyRelaySignatureV3(envelope, key.publicKeyJwk);

  const messageFingerprint = await sha256HexV3(canonicalizeRelayJsonV3(envelope));
  const evidenceDigest = await sha256HexV3(canonicalizeRelayJsonV3(envelope.evidence));
  const successorProofCookie = `Q4R:v3:${await sha256HexV3(`${envelope.predecessorProofCookie}:${messageFingerprint}`)}`;
  const receipt: FederatedRelayReceiptV3 = {
    contract: FEDERATED_AGENT_RELAY_V3,
    status: 'accepted',
    messageId: envelope.messageId,
    messageFingerprint,
    sourceKeyId: envelope.signature.keyId,
    sourceSequence: envelope.ordering.sourceSequence,
    chainId: envelope.ordering.chainId,
    chainPosition: envelope.ordering.chainPosition,
    logicalOperationId: envelope.ordering.logicalOperationId,
    predecessorProofCookie: envelope.predecessorProofCookie,
    successorProofCookie,
    sourceHeadSha: envelope.source.headSha,
    targetHeadSha: envelope.target.headSha,
    evidenceDigest,
    executionAuthorized: false,
    authorityTransferred: false,
    approvalCarriedForward: false,
    acceptedAt: now.toISOString(),
  };
  return { envelope, messageFingerprint, evidenceDigest, successorProofCookie, receipt };
}
