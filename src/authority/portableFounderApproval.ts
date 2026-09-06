export const PORTABLE_FOUNDER_APPROVAL_VERSION = 'portable-founder-approval-v1' as const;
export const REGISTERED_ADAPTER_ATTESTATION_TYPE = 'registered-adapter-signature' as const;

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const SHA256_CONTENT_HASH = /^sha256:[0-9a-f]{64}$/i;
const CANONICAL_ACTION = /^[a-z][a-z0-9_-]*$/;
const APPROVED_SOURCE_CONSOLES = new Set([
  'chatgpt',
  'claude',
  'perplexity',
  'founder-control-room',
] as const);
const REPOSITORY_SHA_ACTIONS = new Set(['merge', 'apply_patch']);
const CONTENT_HASH_ACTIONS = new Set(['apply_patch', 'publish', 'send']);

export type PortableFounderApprovalDecision = 'approve' | 'deny';
export type PortableFounderApprovalSourceConsole =
  | 'chatgpt'
  | 'claude'
  | 'perplexity'
  | 'founder-control-room';

export interface PortableFounderApprovalScope {
  readonly action: string;
  readonly target: string;
  readonly branch?: string;
  readonly expectedCommitSha?: string;
  readonly contentHash?: string;
  readonly missionId?: string | null;
  readonly commandId?: string | null;
  readonly environment: string;
}

export interface PortableFounderApprovalAttestation {
  readonly type: typeof REGISTERED_ADAPTER_ATTESTATION_TYPE;
  readonly keyId: string;
  readonly signature: string;
}

export interface PortableFounderApprovalPacket {
  readonly version: typeof PORTABLE_FOUNDER_APPROVAL_VERSION;
  readonly decisionId: string;
  readonly founderId: string;
  readonly decision: PortableFounderApprovalDecision;
  readonly sourceConsole: PortableFounderApprovalSourceConsole;
  readonly sourceConversationRef: string;
  readonly sourceAdapterRef: string;
  readonly scope: PortableFounderApprovalScope;
  readonly constraints: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly oneTime: true;
  readonly founderNote?: string;
  readonly attestation: PortableFounderApprovalAttestation;
}

export interface PortableFounderApprovalUnsignedPacket
  extends Omit<PortableFounderApprovalPacket, 'attestation'> {
  readonly attestation: Omit<PortableFounderApprovalAttestation, 'signature'>;
}

export interface RegisteredPortableApprovalAdapterVerifier {
  readonly sourceConsole: PortableFounderApprovalSourceConsole;
  readonly sourceAdapterRef: string;
  readonly keyId: string;
  verify(input: {
    packet: PortableFounderApprovalUnsignedPacket;
    signature: string;
  }): boolean | Promise<boolean>;
}

export interface PortableFounderApprovalValidationContext {
  readonly checkedAt?: string;
  isFounderAllowed(founderId: string): boolean | Promise<boolean>;
  resolveAdapter(input: {
    sourceConsole: PortableFounderApprovalSourceConsole;
    sourceAdapterRef: string;
    keyId: string;
  }): RegisteredPortableApprovalAdapterVerifier | null | Promise<RegisteredPortableApprovalAdapterVerifier | null>;
}

export type PortableFounderApprovalValidationFailureCode =
  | 'PACKET_INVALID'
  | 'FOUNDER_NOT_ALLOWED'
  | 'ADAPTER_NOT_REGISTERED'
  | 'ATTESTATION_INVALID'
  | 'DECISION_NOT_CURRENT';

export type PortableFounderApprovalValidationResult =
  | {
      readonly ok: true;
      readonly packet: PortableFounderApprovalPacket;
      readonly founderApproved: boolean;
      readonly executionAuthorized: false;
      readonly consumptionRequired: boolean;
    }
  | {
      readonly ok: false;
      readonly code: PortableFounderApprovalValidationFailureCode;
      readonly reason: string;
    };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(record: JsonRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalNonEmptyString(value: unknown): value is string {
  return nonEmptyString(value) && value === value.trim();
}

function nullableCanonicalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || canonicalNonEmptyString(value);
}

function invalid(reason: string): PortableFounderApprovalValidationResult {
  return { ok: false, code: 'PACKET_INVALID', reason };
}

function parsePacket(input: unknown): PortableFounderApprovalPacket | PortableFounderApprovalValidationResult {
  if (!isRecord(input)) return invalid('portable founder approval packet must be an object');
  if (!hasOnlyKeys(input, [
    'version',
    'decisionId',
    'founderId',
    'decision',
    'sourceConsole',
    'sourceConversationRef',
    'sourceAdapterRef',
    'scope',
    'constraints',
    'issuedAt',
    'expiresAt',
    'oneTime',
    'founderNote',
    'attestation',
  ])) {
    return invalid('portable founder approval packet contains unknown top-level fields');
  }

  if (input.version !== PORTABLE_FOUNDER_APPROVAL_VERSION) return invalid('unsupported portable founder approval version');
  if (!canonicalNonEmptyString(input.decisionId)) return invalid('decisionId must be canonical non-empty text');
  if (!canonicalNonEmptyString(input.founderId)) return invalid('founderId must be canonical non-empty text');
  if (input.decision !== 'approve' && input.decision !== 'deny') return invalid('decision must be approve or deny');
  if (!canonicalNonEmptyString(input.sourceConsole) || !APPROVED_SOURCE_CONSOLES.has(input.sourceConsole as PortableFounderApprovalSourceConsole)) {
    return invalid('sourceConsole is not an approved portable founder console');
  }
  if (!canonicalNonEmptyString(input.sourceConversationRef)) return invalid('sourceConversationRef must be canonical non-empty text');
  if (!canonicalNonEmptyString(input.sourceAdapterRef)) return invalid('sourceAdapterRef must be canonical non-empty text');
  if (input.oneTime !== true) return invalid('mutation-capable portable approvals must be one-time');
  if (input.founderNote !== undefined && typeof input.founderNote !== 'string') return invalid('founderNote must be text when present');

  if (!Array.isArray(input.constraints) || input.constraints.some((constraint) => !canonicalNonEmptyString(constraint))) {
    return invalid('constraints must be canonical non-empty strings');
  }

  if (!canonicalNonEmptyString(input.issuedAt) || !canonicalNonEmptyString(input.expiresAt)) {
    return invalid('issuedAt and expiresAt are required');
  }

  if (!isRecord(input.scope) || !hasOnlyKeys(input.scope, [
    'action',
    'target',
    'branch',
    'expectedCommitSha',
    'contentHash',
    'missionId',
    'commandId',
    'environment',
  ])) {
    return invalid('scope is invalid or contains unknown fields');
  }
  const scope = input.scope;
  if (!canonicalNonEmptyString(scope.action) || !CANONICAL_ACTION.test(scope.action)) {
    return invalid('scope.action must use canonical lowercase action syntax');
  }
  if (!canonicalNonEmptyString(scope.target)) return invalid('scope.target must be canonical non-empty text');
  if (!canonicalNonEmptyString(scope.environment)) return invalid('scope.environment must be canonical non-empty text');
  if (scope.branch !== undefined && !canonicalNonEmptyString(scope.branch)) return invalid('scope.branch must be canonical non-empty text when present');
  if (scope.expectedCommitSha !== undefined && (!canonicalNonEmptyString(scope.expectedCommitSha) || !EXACT_SHA.test(scope.expectedCommitSha))) {
    return invalid('scope.expectedCommitSha must be an exact 40-character Git SHA when present');
  }
  if (scope.contentHash !== undefined && (!canonicalNonEmptyString(scope.contentHash) || !SHA256_CONTENT_HASH.test(scope.contentHash))) {
    return invalid('scope.contentHash must be sha256:<64 hex> when present');
  }
  if (!nullableCanonicalString(scope.missionId)) return invalid('scope.missionId must be canonical non-empty text or null when present');
  if (!nullableCanonicalString(scope.commandId)) return invalid('scope.commandId must be canonical non-empty text or null when present');
  if (REPOSITORY_SHA_ACTIONS.has(scope.action) && (!canonicalNonEmptyString(scope.branch) || !canonicalNonEmptyString(scope.expectedCommitSha) || !EXACT_SHA.test(scope.expectedCommitSha))) {
    return invalid(`${scope.action} requires an exact branch and expectedCommitSha`);
  }
  if (CONTENT_HASH_ACTIONS.has(scope.action) && (!canonicalNonEmptyString(scope.contentHash) || !SHA256_CONTENT_HASH.test(scope.contentHash))) {
    return invalid(`${scope.action} requires an exact contentHash`);
  }

  if (!isRecord(input.attestation) || !hasOnlyKeys(input.attestation, ['type', 'keyId', 'signature'])) {
    return invalid('attestation is invalid or contains unknown fields');
  }
  if (input.attestation.type !== REGISTERED_ADAPTER_ATTESTATION_TYPE) {
    return invalid('attestation type must be registered-adapter-signature');
  }
  if (!canonicalNonEmptyString(input.attestation.keyId)) return invalid('attestation.keyId must be canonical non-empty text');
  if (!canonicalNonEmptyString(input.attestation.signature)) return invalid('attestation.signature must be canonical non-empty text');

  return input as unknown as PortableFounderApprovalPacket;
}

function snapshotPacket(packet: PortableFounderApprovalPacket): PortableFounderApprovalPacket {
  const scope = Object.freeze({ ...packet.scope });
  const constraints = Object.freeze([...packet.constraints]);
  const attestation = Object.freeze({ ...packet.attestation });

  return Object.freeze({
    version: packet.version,
    decisionId: packet.decisionId,
    founderId: packet.founderId,
    decision: packet.decision,
    sourceConsole: packet.sourceConsole,
    sourceConversationRef: packet.sourceConversationRef,
    sourceAdapterRef: packet.sourceAdapterRef,
    scope,
    constraints,
    issuedAt: packet.issuedAt,
    expiresAt: packet.expiresAt,
    oneTime: packet.oneTime,
    ...(packet.founderNote === undefined ? {} : { founderNote: packet.founderNote }),
    attestation,
  });
}

function unsignedPacket(packet: PortableFounderApprovalPacket): PortableFounderApprovalUnsignedPacket {
  return Object.freeze({
    version: packet.version,
    decisionId: packet.decisionId,
    founderId: packet.founderId,
    decision: packet.decision,
    sourceConsole: packet.sourceConsole,
    sourceConversationRef: packet.sourceConversationRef,
    sourceAdapterRef: packet.sourceAdapterRef,
    scope: packet.scope,
    constraints: packet.constraints,
    issuedAt: packet.issuedAt,
    expiresAt: packet.expiresAt,
    oneTime: packet.oneTime,
    ...(packet.founderNote === undefined ? {} : { founderNote: packet.founderNote }),
    attestation: Object.freeze({
      type: packet.attestation.type,
      keyId: packet.attestation.keyId,
    }),
  });
}

export async function validatePortableFounderApprovalPacket(
  input: unknown,
  context: PortableFounderApprovalValidationContext,
): Promise<PortableFounderApprovalValidationResult> {
  const parsed = parsePacket(input);
  if ('ok' in parsed) return parsed;
  const packet = snapshotPacket(parsed);

  const issuedAtMs = Date.parse(packet.issuedAt);
  const expiresAtMs = Date.parse(packet.expiresAt);
  const checkedAt = context.checkedAt ?? new Date().toISOString();
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs)) {
    return invalid('issuedAt, expiresAt, and checkedAt must be valid timestamps');
  }
  if (expiresAtMs <= issuedAtMs) return invalid('expiresAt must be later than issuedAt');
  if (checkedAtMs < issuedAtMs || checkedAtMs >= expiresAtMs) {
    return { ok: false, code: 'DECISION_NOT_CURRENT', reason: 'portable founder approval is not current at validation time' };
  }

  let adapter: RegisteredPortableApprovalAdapterVerifier | null;
  try {
    adapter = await context.resolveAdapter({
      sourceConsole: packet.sourceConsole,
      sourceAdapterRef: packet.sourceAdapterRef,
      keyId: packet.attestation.keyId,
    });
  } catch {
    adapter = null;
  }
  if (!adapter
    || adapter.sourceConsole !== packet.sourceConsole
    || adapter.sourceAdapterRef !== packet.sourceAdapterRef
    || adapter.keyId !== packet.attestation.keyId) {
    return { ok: false, code: 'ADAPTER_NOT_REGISTERED', reason: 'exact source console, adapter version, and attestation key are not registered' };
  }

  let verified = false;
  try {
    verified = await adapter.verify({
      packet: unsignedPacket(packet),
      signature: packet.attestation.signature,
    });
  } catch {
    verified = false;
  }
  if (!verified) {
    return { ok: false, code: 'ATTESTATION_INVALID', reason: 'registered adapter attestation could not be verified' };
  }

  let founderAllowed = false;
  try {
    founderAllowed = await context.isFounderAllowed(packet.founderId);
  } catch {
    founderAllowed = false;
  }
  if (!founderAllowed) {
    return { ok: false, code: 'FOUNDER_NOT_ALLOWED', reason: 'founder identity is not allowlisted' };
  }

  const founderApproved = packet.decision === 'approve';
  return {
    ok: true,
    packet,
    founderApproved,
    executionAuthorized: false,
    consumptionRequired: founderApproved,
  };
}
