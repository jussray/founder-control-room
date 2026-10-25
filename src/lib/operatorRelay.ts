import { createHash } from 'node:crypto';
import { agentCanOperate, agentOperatorPolicy, type AgentOperatorCapability } from './agentRegistry.js';
import { OPERATOR_RELAY_PEERS, OPERATOR_RELAY_SOURCES } from './operatorRelayConstants.js';

export const OPERATOR_RELAY_REQUEST_CONTRACT = 'juss/operator-relay/request@v1' as const;
export const OPERATOR_RELAY_RESPONSE_CONTRACT = 'juss/operator-relay/response@v1' as const;
export const OPERATOR_RELAY_MAX_TTL_MS = 10 * 60_000;
export const OPERATOR_RELAY_MAX_CLOCK_SKEW_MS = 30_000;

export type RelayOperatorId = (typeof OPERATOR_RELAY_PEERS)[number];
export type RelaySourceId = (typeof OPERATOR_RELAY_SOURCES)[number];
export type RelayCapability = Exclude<AgentOperatorCapability, 'instruct'>;
export type RelaySensitivity = 'public' | 'internal' | 'restricted';
export type RelayStatus = 'accepted' | 'completed' | 'blocked' | 'failed';

export interface OperatorRelayRequestV1 {
  contract: typeof OPERATOR_RELAY_REQUEST_CONTRACT;
  relayId: string;
  fromOperator: RelaySourceId;
  toOperator: RelayOperatorId;
  capability: RelayCapability;
  goal: string;
  context: {
    summary: string;
    sourceRef?: string | null;
    sourceFingerprint: string;
  };
  authority: {
    externalWrite: false;
    merge: false;
    deploy: false;
    publish: false;
    providerMutation: false;
  };
  sensitivity: RelaySensitivity;
  createdAt: string;
  expiresAt: string;
  requestHash: string;
}

export interface OperatorRelayResponseV1 {
  contract: typeof OPERATOR_RELAY_RESPONSE_CONTRACT;
  relayId: string;
  requestHash: string;
  fromOperator: RelayOperatorId;
  toOperator: RelaySourceId;
  status: RelayStatus;
  answer: string;
  evidenceRefs: string[];
  unresolved: string[];
  authorityRequested: 'none';
  completedAt: string;
  /** Provider-reported token usage. Measurement only; never authority. Omitted when the provider reports none. */
  usage?: OperatorRelayUsageV1;
  responseHash: string;
}

export interface OperatorRelayUsageV1 {
  provider: 'anthropic';
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

const USAGE_COUNT_FIELDS = ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'] as const;

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function operatorRelayUsageErrors(usage: unknown): string[] {
  if (!isRecord(usage)) return ['relay usage must be an object'];
  const errors: string[] = [];
  if (!hasExactKeys(usage, ['provider', ...USAGE_COUNT_FIELDS])) {
    errors.push('relay usage shape is invalid');
  }
  if (usage.provider !== 'anthropic') errors.push('relay usage provider is unsupported');
  for (const field of USAGE_COUNT_FIELDS) {
    if (!isTokenCount(usage[field])) errors.push(`relay usage ${field} must be a non-negative integer`);
  }
  return errors;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const RELAY_OPERATORS = new Set<RelayOperatorId>(OPERATOR_RELAY_PEERS);
const RELAY_SOURCES = new Set<RelaySourceId>(OPERATOR_RELAY_SOURCES);
const RELAY_CAPABILITIES = new Set<RelayCapability>(['research', 'propose', 'review', 'implement']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function normalizedList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function relayContextFingerprint(summary: string, sourceRef: string | null = null): string {
  return digest(['juss/operator-relay/context@v1', summary.trim(), sourceRef?.trim() ?? null]);
}

function requestIdentity(input: Omit<OperatorRelayRequestV1, 'requestHash'>): unknown[] {
  return [
    OPERATOR_RELAY_REQUEST_CONTRACT,
    input.relayId.trim(),
    input.fromOperator,
    input.toOperator,
    input.capability,
    input.goal.trim(),
    input.context.summary.trim(),
    input.context.sourceRef?.trim() ?? null,
    input.context.sourceFingerprint.toLowerCase(),
    false,
    false,
    false,
    false,
    false,
    input.sensitivity,
    input.createdAt,
    input.expiresAt,
  ];
}

export function operatorRelayRequestHash(input: Omit<OperatorRelayRequestV1, 'requestHash'>): string {
  return digest(requestIdentity(input));
}

function responseIdentity(input: Omit<OperatorRelayResponseV1, 'responseHash'>): unknown[] {
  return [
    OPERATOR_RELAY_RESPONSE_CONTRACT,
    input.relayId.trim(),
    input.requestHash.toLowerCase(),
    input.fromOperator,
    input.toOperator,
    input.status,
    input.answer.trim(),
    normalizedList(input.evidenceRefs),
    normalizedList(input.unresolved),
    'none',
    input.completedAt,
    // Appended only when present so every pre-usage receipt keeps its original hash.
    ...(input.usage ? [[input.usage.provider, ...USAGE_COUNT_FIELDS.map((field) => input.usage![field])]] : []),
  ];
}

export function operatorRelayResponseHash(input: Omit<OperatorRelayResponseV1, 'responseHash'>): string {
  return digest(responseIdentity(input));
}

function isRelayOperator(value: unknown): value is RelayOperatorId {
  return typeof value === 'string' && RELAY_OPERATORS.has(value as RelayOperatorId);
}

function isRelaySource(value: unknown): value is RelaySourceId {
  return typeof value === 'string' && RELAY_SOURCES.has(value as RelaySourceId);
}

function isRelayCapability(value: unknown): value is RelayCapability {
  return typeof value === 'string' && RELAY_CAPABILITIES.has(value as RelayCapability);
}

export function validateOperatorRelayRequest(value: unknown, nowMs = Date.now()): string[] {
  if (!isRecord(value)) return ['relay request must be an object'];

  const errors: string[] = [];
  const requiredKeys = [
    'contract', 'relayId', 'fromOperator', 'toOperator', 'capability', 'goal',
    'context', 'authority', 'sensitivity', 'createdAt', 'expiresAt', 'requestHash',
  ] as const;
  if (!hasExactKeys(value, requiredKeys)) errors.push('relay request shape is invalid');

  if (value.contract !== OPERATOR_RELAY_REQUEST_CONTRACT) errors.push('unsupported relay request contract');

  const relayId = typeof value.relayId === 'string' ? value.relayId : '';
  if (!relayId.trim()) errors.push('relayId is required');

  if (!isRelaySource(value.fromOperator)) errors.push('fromOperator is unsupported');
  if (!isRelayOperator(value.toOperator)) errors.push('toOperator is unsupported');
  if (
    typeof value.fromOperator === 'string'
    && typeof value.toOperator === 'string'
    && value.fromOperator === value.toOperator
  ) {
    errors.push('relay requires distinct operators');
  }

  if (!isRelayCapability(value.capability)) errors.push('capability is unsupported');

  const goal = typeof value.goal === 'string' ? value.goal : '';
  if (!goal.trim() || goal.length > 4_000) errors.push('goal must be 1..4000 characters');

  const context = isRecord(value.context) ? value.context : null;
  if (!context) {
    errors.push('context is required');
  } else {
    if (!hasExactKeys(context, ['summary', 'sourceRef', 'sourceFingerprint'])
      && !hasExactKeys(context, ['summary', 'sourceFingerprint'])) {
      errors.push('relay context shape is invalid');
    }
  }
  const summary = typeof context?.summary === 'string' ? context.summary : '';
  if (!summary.trim() || summary.length > 12_000) errors.push('context summary must be 1..12000 characters');
  const sourceRefValue = context?.sourceRef;
  const sourceRefValid = sourceRefValue === undefined || sourceRefValue === null || typeof sourceRefValue === 'string';
  if (!sourceRefValid) errors.push('sourceRef must be a string or null');
  const sourceFingerprint = typeof context?.sourceFingerprint === 'string' ? context.sourceFingerprint : '';
  if (!SHA256.test(sourceFingerprint)) errors.push('sourceFingerprint must be sha256');
  if (summary && sourceRefValid && SHA256.test(sourceFingerprint)) {
    const expectedFingerprint = relayContextFingerprint(
      summary,
      typeof sourceRefValue === 'string' ? sourceRefValue : null,
    );
    if (sourceFingerprint !== expectedFingerprint) errors.push('sourceFingerprint does not match context');
  }

  const authority = isRecord(value.authority) ? value.authority : null;
  const authorityKeys = ['externalWrite', 'merge', 'deploy', 'publish', 'providerMutation'] as const;
  if (!authority || !hasExactKeys(authority, authorityKeys)) {
    errors.push('relay authority shape is invalid');
  }
  if (authority && authorityKeys.some((key) => authority[key] !== false)) {
    errors.push('relay cannot carry mutation authority');
  }

  if (!['public', 'internal', 'restricted'].includes(
    typeof value.sensitivity === 'string' ? value.sensitivity : '',
  )) {
    errors.push('sensitivity is unsupported');
  }

  const createdAtText = typeof value.createdAt === 'string' ? value.createdAt : '';
  const expiresAtText = typeof value.expiresAt === 'string' ? value.expiresAt : '';
  const createdAt = Date.parse(createdAtText);
  const expiresAt = Date.parse(expiresAtText);
  if (!Number.isFinite(createdAt)) errors.push('createdAt must be RFC3339-compatible');
  if (!Number.isFinite(expiresAt)) errors.push('expiresAt must be RFC3339-compatible');
  if (Number.isFinite(createdAt) && createdAt > nowMs + OPERATOR_RELAY_MAX_CLOCK_SKEW_MS) {
    errors.push('relay request creation time is too far in the future');
  }
  if (Number.isFinite(createdAt) && Number.isFinite(expiresAt)) {
    if (createdAt >= expiresAt) errors.push('relay expiry must be after creation');
    if (expiresAt - createdAt > OPERATOR_RELAY_MAX_TTL_MS) errors.push('relay request ttl exceeds maximum');
  }
  if (Number.isFinite(expiresAt) && expiresAt <= nowMs) errors.push('relay request is expired');

  if (
    isRelayOperator(value.toOperator)
    && isRelayCapability(value.capability)
    && (!agentOperatorPolicy(value.toOperator)?.enabled || !agentCanOperate(value.toOperator, value.capability))
  ) {
    errors.push('target operator is not enabled for requested capability');
  }

  const requestHash = typeof value.requestHash === 'string' ? value.requestHash : '';
  if (!SHA256.test(requestHash)) errors.push('requestHash must be sha256');

  if (errors.length === 0) {
    const typed = value as unknown as OperatorRelayRequestV1;
    const { requestHash: _requestHash, ...identity } = typed;
    const expected = operatorRelayRequestHash(identity);
    if (typed.requestHash !== expected) errors.push('requestHash does not match canonical relay request');
  }
  return [...new Set(errors)];
}

export function validateOperatorRelayResponse(value: unknown, request: OperatorRelayRequestV1): string[] {
  if (!isRecord(value)) return ['relay response must be an object'];

  const errors: string[] = [];
  const requiredKeys = [
    'contract', 'relayId', 'requestHash', 'fromOperator', 'toOperator', 'status',
    'answer', 'evidenceRefs', 'unresolved', 'authorityRequested', 'completedAt', 'responseHash',
  ] as const;
  const withUsage = [...requiredKeys, 'usage'] as const;
  if (!hasExactKeys(value, requiredKeys) && !hasExactKeys(value, withUsage)) {
    errors.push('relay response shape is invalid');
  }

  if (value.contract !== OPERATOR_RELAY_RESPONSE_CONTRACT) errors.push('unsupported relay response contract');
  if (value.relayId !== request.relayId) errors.push('response relayId does not match request');
  if (value.requestHash !== request.requestHash) errors.push('response requestHash does not match request');
  if (value.fromOperator !== request.toOperator) errors.push('response must come from target operator');
  if (value.toOperator !== request.fromOperator) errors.push('response must return to source operator');

  const status = typeof value.status === 'string' ? value.status : '';
  if (!['accepted', 'completed', 'blocked', 'failed'].includes(status)) errors.push('response status is unsupported');

  const answer = typeof value.answer === 'string' ? value.answer : '';
  if (typeof value.answer !== 'string') errors.push('response answer must be a string');
  if (answer.length > 20_000) errors.push('response answer exceeds 20000 characters');

  const evidenceRefs = isStringArray(value.evidenceRefs) ? value.evidenceRefs : null;
  if (!evidenceRefs) errors.push('response evidenceRefs must be a string array');
  const unresolved = isStringArray(value.unresolved) ? value.unresolved : null;
  if (!unresolved) errors.push('response unresolved must be a string array');
  if (status === 'completed' && evidenceRefs && normalizedList(evidenceRefs).length === 0) {
    errors.push('completed response requires provider evidence');
  }

  if (value.authorityRequested !== 'none') errors.push('relay response cannot request authority');

  const completedAt = typeof value.completedAt === 'string' ? value.completedAt : '';
  if (!Number.isFinite(Date.parse(completedAt))) errors.push('completedAt must be RFC3339-compatible');

  const responseHash = typeof value.responseHash === 'string' ? value.responseHash : '';
  if (!SHA256.test(responseHash)) errors.push('responseHash must be sha256');

  if (value.usage !== undefined) errors.push(...operatorRelayUsageErrors(value.usage));

  if (errors.length === 0) {
    const typed = value as unknown as OperatorRelayResponseV1;
    const { responseHash: _responseHash, ...identity } = typed;
    const expected = operatorRelayResponseHash(identity);
    if (typed.responseHash !== expected) errors.push('responseHash does not match canonical relay response');
  }
  return [...new Set(errors)];
}
