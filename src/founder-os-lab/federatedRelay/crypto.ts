import { createHash } from 'node:crypto';
import { canonicalizeRelayJcsV31 } from './jcs.js';
import {
  type FederatedAgentRelayEnvelopeV31,
  type RelayEvidenceV31,
  type RelaySignatureVerifierV31,
  type RelayVerifiedKeyV31,
  RelayV31Error,
} from './v31-types.js';

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RelayV31Error(code);
}

export function relayUnsignedEnvelopeV31(
  envelope: FederatedAgentRelayEnvelopeV31,
): Omit<FederatedAgentRelayEnvelopeV31, 'signature'> {
  const { signature: _signature, ...unsigned } = envelope;
  return unsigned;
}

export function sha256HexV31(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function relaySemanticFingerprintV31(envelope: FederatedAgentRelayEnvelopeV31): string {
  return sha256HexV31(canonicalizeRelayJcsV31(relayUnsignedEnvelopeV31(envelope)));
}

export function relayDeliveryFingerprintV31(envelope: FederatedAgentRelayEnvelopeV31): string {
  return sha256HexV31(canonicalizeRelayJcsV31(envelope));
}

export function relayEvidenceDigestV31(evidence: RelayEvidenceV31[]): string {
  return taggedDigestV31('juss.federated-relay.evidence.v3.1', [canonicalizeRelayJcsV31(evidence)]);
}

export function taggedDigestV31(tag: string, parts: readonly string[]): string {
  const hash = createHash('sha256');
  hash.update(tag, 'utf8');
  hash.update('\u0000', 'utf8');
  for (const part of parts) {
    const bytes = Buffer.from(part, 'utf8');
    hash.update(String(bytes.byteLength), 'utf8');
    hash.update('\u0000', 'utf8');
    hash.update(bytes);
    hash.update('\u0000', 'utf8');
  }
  return hash.digest('hex');
}

export function relaySuccessorProofCookieV31(input: {
  chainId: string;
  predecessorProofCookie: string;
  deliveryFingerprint: string;
  nonce: string;
  sourceMember: string;
  targetMember: string;
}): string {
  const digest = taggedDigestV31('juss.federated-relay.cookie.v3.1', [
    input.chainId,
    input.predecessorProofCookie,
    input.deliveryFingerprint,
    input.nonce,
    input.sourceMember,
    input.targetMember,
  ]);
  return `Q4R:v3.1:${digest}`;
}

export function decodeBase64UrlV31(value: string): Uint8Array {
  assert(value.length > 0 && /^[A-Za-z0-9_-]+$/.test(value), 'relay_signature_base64url_invalid');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  let decoded: Buffer;
  try {
    decoded = Buffer.from(`${normalized}${padding}`, 'base64');
  } catch {
    throw new RelayV31Error('relay_signature_base64url_invalid');
  }
  assert(decoded.byteLength === 64, 'relay_signature_length_invalid');
  return Uint8Array.from(decoded);
}

export function canonicalUnsignedBytesV31(envelope: FederatedAgentRelayEnvelopeV31): Uint8Array {
  return new TextEncoder().encode(canonicalizeRelayJcsV31(relayUnsignedEnvelopeV31(envelope)));
}

export async function verifyRelaySignatureV31(
  envelope: FederatedAgentRelayEnvelopeV31,
  verifier: RelaySignatureVerifierV31,
): Promise<RelayVerifiedKeyV31> {
  const verified = await verifier.verify({
    member: envelope.source.member,
    keyId: envelope.signature.keyId,
    issuedAt: envelope.issuedAt,
    canonicalUnsignedBytes: canonicalUnsignedBytesV31(envelope),
    signature: decodeBase64UrlV31(envelope.signature.valueBase64Url),
  });

  assert(verified.member === envelope.source.member, 'relay_source_key_member_mismatch');
  assert(verified.keyId === envelope.signature.keyId, 'relay_source_key_id_mismatch');
  assert(verified.state !== 'revoked', 'relay_key_revoked');

  const issued = Date.parse(envelope.issuedAt);
  const validFrom = Date.parse(verified.validFrom);
  const validUntil = verified.validUntil === null ? Number.POSITIVE_INFINITY : Date.parse(verified.validUntil);
  assert(Number.isFinite(validFrom), 'relay_key_valid_from_invalid');
  assert(verified.validUntil === null || Number.isFinite(validUntil), 'relay_key_valid_until_invalid');
  assert(issued >= validFrom, 'relay_key_not_yet_valid');
  assert(issued <= validUntil, 'relay_key_expired');

  return verified;
}
