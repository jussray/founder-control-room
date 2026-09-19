import { createHash } from 'node:crypto';
import { agentCanOperate, agentOperatorPolicy, type AgentOperatorCapability } from './agentRegistry.js';

export const OPERATOR_RELAY_REQUEST_CONTRACT = 'juss/operator-relay/request@v1' as const;
export const OPERATOR_RELAY_RESPONSE_CONTRACT = 'juss/operator-relay/response@v1' as const;

export type RelayOperatorId = 'codex' | 'claude-code' | 'perplexity';
export type RelayCapability = Exclude<AgentOperatorCapability, 'instruct'>;
export type RelaySensitivity = 'public' | 'internal' | 'restricted';
export type RelayStatus = 'accepted' | 'completed' | 'blocked' | 'failed';

export interface OperatorRelayRequestV1 {
  contract: typeof OPERATOR_RELAY_REQUEST_CONTRACT;
  relayId: string;
  fromOperator: RelayOperatorId;
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
  toOperator: RelayOperatorId;
  status: RelayStatus;
  answer: string;
  evidenceRefs: string[];
  unresolved: string[];
  authorityRequested: 'none';
  completedAt: string;
  responseHash: string;
}

const SHA256 = /^[0-9a-f]{64}$/i;
const RELAY_OPERATORS = new Set<RelayOperatorId>(['codex', 'claude-code', 'perplexity']);
const RELAY_CAPABILITIES = new Set<RelayCapability>(['research', 'propose', 'review', 'implement']);

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
  ];
}

export function operatorRelayResponseHash(input: Omit<OperatorRelayResponseV1, 'responseHash'>): string {
  return digest(responseIdentity(input));
}

function isRelayOperator(value: unknown): value is RelayOperatorId {
  return typeof value === 'string' && RELAY_OPERATORS.has(value as RelayOperatorId);
}

function isRelayCapability(value: unknown): value is RelayCapability {
  return typeof value === 'string' && RELAY_CAPABILITIES.has(value as RelayCapability);
}

export function validateOperatorRelayRequest(value: OperatorRelayRequestV1, nowMs = Date.now()): string[] {
  const errors: string[] = [];
  if (value.contract !== OPERATOR_RELAY_REQUEST_CONTRACT) errors.push('unsupported relay request contract');
  if (!value.relayId?.trim()) errors.push('relayId is required');
  if (!isRelayOperator(value.fromOperator)) errors.push('fromOperator is unsupported');
  if (!isRelayOperator(value.toOperator)) errors.push('toOperator is unsupported');
  if (value.fromOperator === value.toOperator) errors.push('relay requires distinct operators');
  if (!isRelayCapability(value.capability)) errors.push('capability is unsupported');
  if (!value.goal?.trim() || value.goal.length > 4_000) errors.push('goal must be 1..4000 characters');
  if (!value.context?.summary?.trim() || value.context.summary.length > 12_000) errors.push('context summary must be 1..12000 characters');
  if (!SHA256.test(value.context?.sourceFingerprint ?? '')) errors.push('sourceFingerprint must be sha256');
  const expectedFingerprint = relayContextFingerprint(value.context.summary, value.context.sourceRef ?? null);
  if (value.context.sourceFingerprint !== expectedFingerprint) errors.push('sourceFingerprint does not match context');
  if (Object.values(value.authority ?? {}).some(Boolean)) errors.push('relay cannot carry mutation authority');
  if (!['public', 'internal', 'restricted'].includes(value.sensitivity)) errors.push('sensitivity is unsupported');
  const createdAt = Date.parse(value.createdAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(createdAt)) errors.push('createdAt must be RFC3339-compatible');
  if (!Number.isFinite(expiresAt)) errors.push('expiresAt must be RFC3339-compatible');
  if (Number.isFinite(createdAt) && Number.isFinite(expiresAt) && createdAt >= expiresAt) errors.push('relay expiry must be after creation');
  if (Number.isFinite(expiresAt) && expiresAt <= nowMs) errors.push('relay request is expired');
  if (!agentOperatorPolicy(value.toOperator)?.enabled || !agentCanOperate(value.toOperator, value.capability)) {
    errors.push('target operator is not enabled for requested capability');
  }
  if (!SHA256.test(value.requestHash ?? '')) errors.push('requestHash must be sha256');
  if (errors.length === 0) {
    const { requestHash: _requestHash, ...identity } = value;
    const expected = operatorRelayRequestHash(identity);
    if (value.requestHash !== expected) errors.push('requestHash does not match canonical relay request');
  }
  return [...new Set(errors)];
}

export function validateOperatorRelayResponse(value: OperatorRelayResponseV1, request: OperatorRelayRequestV1): string[] {
  const errors: string[] = [];
  if (value.contract !== OPERATOR_RELAY_RESPONSE_CONTRACT) errors.push('unsupported relay response contract');
  if (value.relayId !== request.relayId) errors.push('response relayId does not match request');
  if (value.requestHash !== request.requestHash) errors.push('response requestHash does not match request');
  if (value.fromOperator !== request.toOperator) errors.push('response must come from target operator');
  if (value.toOperator !== request.fromOperator) errors.push('response must return to source operator');
  if (!['accepted', 'completed', 'blocked', 'failed'].includes(value.status)) errors.push('response status is unsupported');
  if (value.answer.length > 20_000) errors.push('response answer exceeds 20000 characters');
  if (value.status === 'completed' && normalizedList(value.evidenceRefs).length === 0) errors.push('completed response requires provider evidence');
  if (value.authorityRequested !== 'none') errors.push('relay response cannot request authority');
  if (!Number.isFinite(Date.parse(value.completedAt))) errors.push('completedAt must be RFC3339-compatible');
  if (!SHA256.test(value.responseHash ?? '')) errors.push('responseHash must be sha256');
  if (errors.length === 0) {
    const { responseHash: _responseHash, ...identity } = value;
    const expected = operatorRelayResponseHash(identity);
    if (value.responseHash !== expected) errors.push('responseHash does not match canonical relay response');
  }
  return [...new Set(errors)];
}
