import { createHash } from 'node:crypto';

export const CAPABILITY_IDENTITY_CONTRACT = 'juss-fcr/capability-identity@v1' as const;
export const AUTHORITY_ENVELOPE_CONTRACT = 'juss-fcr/authority-envelope@v1' as const;

const CAPABILITY_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/i;

export interface CapabilityIdentityV1 {
  contract: typeof CAPABILITY_IDENTITY_CONTRACT;
  id: string;
}

export interface AuthorityEnvelopeV1 {
  contract: typeof AUTHORITY_ENVELOPE_CONTRACT;
  intentId: string;
  actor: string;
  capability: CapabilityIdentityV1;
  authorityScope: string;
  proposalHash: string;
  argumentsHash: string;
  stateFingerprint: string;
  consequenceClass: 'informational' | 'reversible' | 'consequential' | 'irreversible';
  toolCallId: string;
  issuedAt: string;
  expiresAt: string;
  approvedBy: string;
  idempotencyKey: string;
  envelopeHash: string;
}

export function capabilityIdentity(id: string): CapabilityIdentityV1 {
  const normalized = id.trim().toLowerCase();
  if (!CAPABILITY_ID.test(normalized) || normalized.split('.').length < 3) {
    throw new Error('capability identity must use provider.domain.action');
  }
  return Object.freeze({ contract: CAPABILITY_IDENTITY_CONTRACT, id: normalized });
}

export function authorityEnvelopeSeed(envelope: Omit<AuthorityEnvelopeV1, 'envelopeHash'> | AuthorityEnvelopeV1): string {
  return JSON.stringify([
    envelope.contract,
    envelope.intentId.trim(),
    envelope.actor.trim(),
    envelope.capability.contract,
    envelope.capability.id.trim().toLowerCase(),
    envelope.authorityScope.trim(),
    envelope.proposalHash.trim().toLowerCase(),
    envelope.argumentsHash.trim().toLowerCase(),
    envelope.stateFingerprint.trim().toLowerCase(),
    envelope.consequenceClass,
    envelope.toolCallId.trim(),
    envelope.issuedAt,
    envelope.expiresAt,
    envelope.approvedBy.trim(),
    envelope.idempotencyKey.trim(),
  ]);
}

export function authorityEnvelopeHash(envelope: Omit<AuthorityEnvelopeV1, 'envelopeHash'> | AuthorityEnvelopeV1): string {
  return createHash('sha256').update(authorityEnvelopeSeed(envelope)).digest('hex');
}

export function validateAuthorityEnvelope(
  envelope: AuthorityEnvelopeV1,
  context: {
    now: string;
    capabilityId: string;
    proposalHash: string;
    argumentsHash: string;
    stateFingerprint: string;
    toolCallId: string;
  },
): string[] {
  const errors: string[] = [];
  if (envelope.contract !== AUTHORITY_ENVELOPE_CONTRACT) errors.push('unsupported authority envelope contract');
  try { capabilityIdentity(envelope.capability?.id ?? ''); } catch { errors.push('invalid capability identity'); }
  if (envelope.capability?.contract !== CAPABILITY_IDENTITY_CONTRACT) errors.push('unsupported capability identity contract');
  for (const [name, value] of [['proposalHash', envelope.proposalHash], ['argumentsHash', envelope.argumentsHash], ['stateFingerprint', envelope.stateFingerprint], ['envelopeHash', envelope.envelopeHash]] as const) {
    if (!SHA256.test(value)) errors.push(`${name} must be sha256`);
  }
  if (!envelope.intentId.trim()) errors.push('intentId is required');
  if (!envelope.actor.trim()) errors.push('actor is required');
  if (!envelope.authorityScope.trim()) errors.push('authorityScope is required');
  if (!envelope.toolCallId.trim()) errors.push('toolCallId is required');
  if (!envelope.approvedBy.trim()) errors.push('approvedBy is required');
  if (!envelope.idempotencyKey.trim()) errors.push('idempotencyKey is required');

  const now = Date.parse(context.now);
  const issuedAt = Date.parse(envelope.issuedAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  if (![now, issuedAt, expiresAt].every(Number.isFinite)) errors.push('authority envelope timestamps must be valid ISO dates');
  else {
    if (issuedAt > now) errors.push('authority envelope is not active yet');
    if (expiresAt <= now) errors.push('authority envelope is expired');
    if (expiresAt <= issuedAt) errors.push('authority envelope expiry must follow issuance');
  }

  if (envelope.capability.id !== context.capabilityId.trim().toLowerCase()) errors.push('capability identity changed after approval');
  if (envelope.proposalHash.toLowerCase() !== context.proposalHash.toLowerCase()) errors.push('proposal changed after approval');
  if (envelope.argumentsHash.toLowerCase() !== context.argumentsHash.toLowerCase()) errors.push('tool arguments changed after approval');
  if (envelope.stateFingerprint.toLowerCase() !== context.stateFingerprint.toLowerCase()) errors.push('execution state changed after approval');
  if (envelope.toolCallId !== context.toolCallId) errors.push('tool call changed after approval');
  if (SHA256.test(envelope.envelopeHash) && authorityEnvelopeHash(envelope) !== envelope.envelopeHash.toLowerCase()) errors.push('authority envelope hash does not match content');
  return errors;
}
