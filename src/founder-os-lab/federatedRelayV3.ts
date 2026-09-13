export const FEDERATED_AGENT_RELAY_V3 = 'juss/federated-agent-relay@v3' as const;
export const FEDERATED_AGENT_RELAY_RECEIPT_V3 = 'juss/federated-agent-relay-receipt@v3' as const;
export const FEDERATED_AGENT_RELAY_V3_GENESIS_COOKIE = 'Q4R:v3:genesis' as const;
export const FEDERATED_AGENT_RELAY_COOKIE_DOMAIN_V3 = 'juss.federated-relay.cookie.v3' as const;

export type RelayDispositionV3 = 'observe' | 'reconcile' | 'propose';
export type RelayTruthStateV3 = 'verified' | 'inferred' | 'unknown' | 'stale' | 'blocked' | 'failed';
export type RelayMutableStateV3 = 'accepted' | 'superseded' | 'revoked';

export interface RelayMemberIdentityV3 {
  member: string;
  repository: string;
  branch: string;
  headSha: string;
}

export interface RelayOrderingV3 {
  chainId: string;
  sourceSequence: number;
  chainPosition: number;
  logicalOperationId: string;
  predecessorMessageId?: string;
}

export interface RelayEvidenceV3 {
  ref: string;
  state: RelayTruthStateV3;
  sha256?: string;
  proofReceiptId?: string;
}

export interface RelaySignatureV3 {
  algorithm: 'Ed25519';
  keyId: string;
  valueBase64Url: string;
}

export interface FederatedAgentRelayEnvelopeV3 {
  contract: typeof FEDERATED_AGENT_RELAY_V3;
  messageId: string;
  replyToMessageId?: string;
  ordering: RelayOrderingV3;
  source: RelayMemberIdentityV3;
  target: RelayMemberIdentityV3;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  disposition: RelayDispositionV3;
  subject: string;
  payload: {
    contentType: 'text/plain' | 'application/json';
    body: string;
    sha256: string;
  };
  contextFingerprint: string;
  predecessorProofCookie: string;
  evidence: RelayEvidenceV3[];
  supersedesMessageIds: string[];
  signature: RelaySignatureV3;
}

export interface FederatedAgentRelayReceiptV3 {
  contract: typeof FEDERATED_AGENT_RELAY_RECEIPT_V3;
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
    state: 'reachable_at_acceptance' | 'exists_not_currently_reachable' | 'exists_reachability_unknown';
    checkedAt: string;
  };
  evidenceDigest: string;
  acceptedKey: {
    member: string;
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
  receiver: {
    member: string;
    repository: string;
    branch: string;
    headSha: string;
    keyId: string;
  };
  signature: RelaySignatureV3;
}

export interface RelayDeliveryResultV3 {
  delivery: 'accepted' | 'duplicate';
  receipt: FederatedAgentRelayReceiptV3;
  currentState: RelayMutableStateV3;
  supersededByMessageId: string | null;
}

export interface StoredRelayMessageV3 {
  messageId: string;
  semanticFingerprint: string;
  deliveryFingerprint: string;
  receiptId: string;
  receipt: FederatedAgentRelayReceiptV3;
  status: RelayMutableStateV3;
  supersededByMessageId: string | null;
}

export class RelayErrorV3 extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
    this.name = 'RelayErrorV3';
  }
}

export class RelayTransientErrorV3 extends Error {
  constructor(readonly code: 'relay_deadlock_retry' | 'relay_serialization_retry') {
    super(code);
    this.name = 'RelayTransientErrorV3';
  }
}

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const IMMUTABLE_RECEIPT_FORBIDDEN_FIELDS = new Set(['currentState', 'supersededByMessageId']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function decodeBase64UrlStrictV3(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || !BASE64URL_RE.test(value)) {
    throw new RelayErrorV3('relay_signature_base64url_invalid');
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);

  let binary: string;
  try {
    binary = globalThis.atob(normalized + padding);
  } catch {
    throw new RelayErrorV3('relay_signature_base64url_invalid');
  }

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function decodeEd25519SignatureStrictV3(value: unknown): Uint8Array {
  const signature = decodeBase64UrlStrictV3(value);
  if (signature.byteLength !== 64) {
    throw new RelayErrorV3('relay_signature_length_invalid');
  }
  return signature;
}

function frameDigestPart(value: string): string {
  const length = new TextEncoder().encode(value).byteLength;
  return `${length}:${value}`;
}

export async function taggedDigestV3(tag: string, fields: readonly string[]): Promise<string> {
  const framed = [tag, ...fields].map(frameDigestPart).join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(framed));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function successorProofCookieV3(input: {
  chainId: string;
  predecessorProofCookie: string;
  deliveryFingerprint: string;
  nonce: string;
  sourceMember: string;
  targetMember: string;
}): Promise<string> {
  const digest = await taggedDigestV3(FEDERATED_AGENT_RELAY_COOKIE_DOMAIN_V3, [
    input.chainId,
    input.predecessorProofCookie,
    input.deliveryFingerprint,
    input.nonce,
    input.sourceMember,
    input.targetMember,
  ]);
  return `Q4R:v3:${digest}`;
}

export function assertImmutableRelayReceiptV3(value: unknown): asserts value is FederatedAgentRelayReceiptV3 {
  if (!isRecord(value)) throw new RelayErrorV3('relay_receipt_invalid');
  for (const field of IMMUTABLE_RECEIPT_FORBIDDEN_FIELDS) {
    if (Object.hasOwn(value, field)) {
      throw new RelayErrorV3('relay_receipt_contains_mutable_state');
    }
  }
  if (value.contract !== FEDERATED_AGENT_RELAY_RECEIPT_V3 || value.delivery !== 'accepted') {
    throw new RelayErrorV3('relay_receipt_invalid');
  }
  if (
    value.executionAuthorized !== false
    || value.authorityTransferred !== false
    || value.approvalCarriedForward !== false
  ) {
    throw new RelayErrorV3('relay_receipt_authority_invalid');
  }
}

export function assertV3RootStartsNewChain(envelope: FederatedAgentRelayEnvelopeV3): void {
  if (
    envelope.ordering.chainPosition !== 0
    || envelope.ordering.predecessorMessageId !== undefined
    || envelope.replyToMessageId !== undefined
    || envelope.predecessorProofCookie !== FEDERATED_AGENT_RELAY_V3_GENESIS_COOKIE
  ) {
    throw new RelayErrorV3('relay_v3_root_must_start_new_chain');
  }
}

export function mapRelayPostgresErrorV3(error: { code?: string; message?: string }): never {
  if (error.code === '40P01') {
    throw new RelayTransientErrorV3('relay_deadlock_retry');
  }
  if (error.code === '40001') {
    throw new RelayTransientErrorV3('relay_serialization_retry');
  }
  throw error;
}
