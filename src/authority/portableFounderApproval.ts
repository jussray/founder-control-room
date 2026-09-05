export const PORTABLE_FOUNDER_APPROVAL_VERSION = 'portable-founder-approval-v1' as const;
export const REGISTERED_ADAPTER_ATTESTATION_TYPE = 'registered-adapter-signature' as const;

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const SHA256_CONTENT_HASH = /^sha256:[0-9a-f]{64}$/i;
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
  action: string;
  target: string;
  branch?: string;
  expectedCommitSha?: string;
  contentHash?: string;
  missionId?: string | null;
  commandId?: string | null;
  environment: string;
}

export interface PortableFounderApprovalAttestation {
  type: typeof REGISTERED_ADAPTER_ATTESTATION_TYPE;
  keyId: string;
  signature: string;
}

export interface PortableFounderApprovalPacket {
  version: typeof PORTABLE_FOUNDER_APPROVAL_VERSION;
  decisionId: string;
  founderId: string;
  decision: PortableFounderApprovalDecision;
  sourceConsole: PortableFounderApprovalSourceConsole;
  sourceConversationRef: string;
  sourceAdapterRef: string;
  scope: PortableFounderApprovalScope;
  constraints: string[];
  issuedAt: string;
  expiresAt: string;
  oneTime: true;
  founderNote?: string;
  attestation: PortableFounderApprovalAttestation;
}

export interface PortableFounderApprovalUnsignedPacket
  extends Omit<PortableFounderApprovalPacket, 'attestation'> {
  attestation: Omit<PortableFounderApprovalAttestation, 'signature'>;
}

export interface RegisteredPortableApprovalAdapterVerifier {
  sourceConsole: PortableFounderApprovalSourceConsole;
  sourceAdapterRef: string;
  keyId: string;
  verify(input: {
    packet: PortableFounderApprovalUnsignedPacket;
    signature: string;
  }): boolean | Promise<boolean>;
}

export interface PortableFounderApprovalValidationContext {
  checkedAt?: string;
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
      ok: true;
      packet: PortableFounderApprovalPacket;
      executionAuthorized: false;
      consumptionRequired: true;
    }
  | {
      ok: false;
      code: PortableFounderApprovalValidationFailureCode;
      reason: string;
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

function nullableNonEmptyString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || nonEmptyString(value);
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
  if (!nonEmptyString(input.decisionId)) return invalid('decisionId is required');
  if (!nonEmptyString(input.founderId)) return invalid('founderId is required');
  if (input.decision !== 'approve' && input.decision !== 'deny') return invalid('decision must be approve or deny');
  if (!nonEmptyString(input.sourceConsole) || !APPROVED_SOURCE_CONSOLES.has(input.sourceConsole as PortableFounderApprovalSourceConsole)) {
    return invalid('sourceConsole is not an approved portable founder console');
  }
  if (!nonEmptyString(input.sourceConversationRef)) return invalid('sourceConversationRef is required');
  if (!nonEmptyString(input.sourceAdapterRef)) return invalid('sourceAdapterRef is required');
  if (input.oneTime !== true) return invalid('mutation-capable portable approvals must be one-time');
  if (input.founderNote !== undefined && typeof input.founderNote !== 'string') return invalid('founderNote must be text when present');

  if (!Array.isArray(input.constraints) || input.constraints.some((constraint) => !nonEmptyString(constraint))) {
    return invalid('constraints must be an array of non-empty strings');
  }

  if (!nonEmptyString(input.issuedAt) || !nonEmptyString(input.expiresAt)) {
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
  if (!nonEmptyString(scope.action)) return invalid('scope.action is required');
  if (!nonEmptyString(scope.target)) return invalid('scope.target is required');
  if (!nonEmptyString(scope.environment)) return invalid('scope.environment is required');
  if (scope.branch !== undefined && !nonEmptyString(scope.branch)) return invalid('scope.branch must be non-empty when present');
  if (scope.expectedCommitSha !== undefined && (!nonEmptyString(scope.expectedCommitSha) || !EXACT_SHA.test(scope.expectedCommitSha))) {
    return invalid('scope.expectedCommitSha must be an exact 40-character Git SHA when present');
  }
  if (scope.contentHash !== undefined && (!nonEmptyString(scope.contentHash) || !SHA256_CONTENT_HASH.test(scope.contentHash))) {
    return invalid('scope.contentHash must be sha256:<64 hex> when present');
  }
  if (!nullableNonEmptyString(scope.missionId)) return invalid('scope.missionId must be non-empty or null when present');
  if (!nullableNonEmptyString(scope.commandId)) return invalid('scope.commandId must be non-empty or null when present');
  if (REPOSITORY_SHA_ACTIONS.has(scope.action) && (!nonEmptyString(scope.branch) || !nonEmptyString(scope.expectedCommitSha) || !EXACT_SHA.test(scope.expectedCommitSha))) {
    return invalid(`${scope.action} requires an exact branch and expectedCommitSha`);
  }
  if (CONTENT_HASH_ACTIONS.has(scope.action) && (!nonEmptyString(scope.contentHash) || !SHA256_CONTENT_HASH.test(scope.contentHash))) {
    return invalid(`${scope.action} requires an exact contentHash`);
  }

  if (!isRecord(input.attestation) || !hasOnlyKeys(input.attestation, ['type', 'keyId', 'signature'])) {
    return invalid('attestation is invalid or contains unknown fields');
  }
  if (input.attestation.type !== REGISTERED_ADAPTER_ATTESTATION_TYPE) {
    return invalid('attestation type must be registered-adapter-signature');
  }
  if (!nonEmptyString(input.attestation.keyId)) return invalid('attestation.keyId is required');
  if (!nonEmptyString(input.attestation.signature)) return invalid('attestation.signature is required');

  return input as unknown as PortableFounderApprovalPacket;
}

function unsignedPacket(packet: PortableFounderApprovalPacket): PortableFounderApprovalUnsignedPacket {
  return {
    version: packet.version,
    decisionId: packet.decisionId,
    founderId: packet.founderId,
    decision: packet.decision,
    sourceConsole: packet.sourceConsole,
    sourceConversationRef: packet.sourceConversationRef,
    sourceAdapterRef: packet.sourceAdapterRef,
    scope: { ...packet.scope },
    constraints: [...packet.constraints],
    issuedAt: packet.issuedAt,
    expiresAt: packet.expiresAt,
    oneTime: packet.oneTime,
    ...(packet.founderNote === undefined ? {} : { founderNote: packet.founderNote }),
    attestation: {
      type: packet.attestation.type,
      keyId: packet.attestation.keyId,
    },
  };
}

export async function validatePortableFounderApprovalPacket(
  input: unknown,
  context: PortableFounderApprovalValidationContext,
): Promise<PortableFounderApprovalValidationResult> {
  const parsed = parsePacket(input);
  if ('ok' in parsed) return parsed;

  const issuedAtMs = Date.parse(parsed.issuedAt);
  const expiresAtMs = Date.parse(parsed.expiresAt);
  const checkedAt = context.checkedAt ?? new Date().toISOString();
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(checkedAtMs)) {
    return invalid('issuedAt, expiresAt, and checkedAt must be valid timestamps');
  }
  if (expiresAtMs <= issuedAtMs) return invalid('expiresAt must be later than issuedAt');
  if (checkedAtMs < issuedAtMs || checkedAtMs >= expiresAtMs) {
    return { ok: false, code: 'DECISION_NOT_CURRENT', reason: 'portable founder approval is not current at validation time' };
  }

  if (!(await context.isFounderAllowed(parsed.founderId))) {
    return { ok: false, code: 'FOUNDER_NOT_ALLOWED', reason: 'founder identity is not allowlisted' };
  }

  const adapter = await context.resolveAdapter({
    sourceConsole: parsed.sourceConsole,
    sourceAdapterRef: parsed.sourceAdapterRef,
    keyId: parsed.attestation.keyId,
  });
  if (!adapter
    || adapter.sourceConsole !== parsed.sourceConsole
    || adapter.sourceAdapterRef !== parsed.sourceAdapterRef
    || adapter.keyId !== parsed.attestation.keyId) {
    return { ok: false, code: 'ADAPTER_NOT_REGISTERED', reason: 'exact source console, adapter version, and attestation key are not registered' };
  }

  const verified = await adapter.verify({
    packet: unsignedPacket(parsed),
    signature: parsed.attestation.signature,
  });
  if (!verified) {
    return { ok: false, code: 'ATTESTATION_INVALID', reason: 'registered adapter attestation could not be verified' };
  }

  return {
    ok: true,
    packet: parsed,
    executionAuthorized: false,
    consumptionRequired: true,
  };
}
