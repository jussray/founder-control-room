import { describe, expect, it } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayRequestHash,
  operatorRelayResponseHash,
  relayContextFingerprint,
  validateOperatorRelayRequest,
  validateOperatorRelayResponse,
  type OperatorRelayRequestV1,
  type OperatorRelayResponseV1,
} from '../operatorRelay.js';

const CREATED_AT = '2026-09-16T06:30:00.000Z';
const EXPIRES_AT = '2026-09-16T06:40:00.000Z';
const NOW = Date.parse('2026-09-16T06:31:00.000Z');

function validRequest(seed: number): OperatorRelayRequestV1 {
  const summary = `Deterministic relay attack case ${seed}`;
  const sourceRef = `attack6000:${seed}`;
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: `relay-attack-${seed}`,
    fromOperator: 'codex',
    toOperator: 'perplexity',
    capability: 'review',
    goal: `Reject malformed relay evidence ${seed}`,
    context: {
      summary,
      sourceRef,
      sourceFingerprint: relayContextFingerprint(summary, sourceRef),
    },
    authority: {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
    sensitivity: 'internal',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

function validResponse(request: OperatorRelayRequestV1, seed: number): OperatorRelayResponseV1 {
  const base: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: request.relayId,
    requestHash: request.requestHash,
    fromOperator: request.toOperator,
    toOperator: request.fromOperator,
    status: 'completed',
    answer: `Bounded provider answer ${seed}`,
    evidenceRefs: [`provider:perplexity:attack-${seed}`],
    unresolved: [],
    authorityRequested: 'none',
    completedAt: '2026-09-16T06:32:00.000Z',
  };
  return { ...base, responseHash: operatorRelayResponseHash(base) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rehashRequest(value: OperatorRelayRequestV1): void {
  const { requestHash: _requestHash, ...identity } = value;
  value.requestHash = operatorRelayRequestHash(identity);
}

function rehashResponse(value: OperatorRelayResponseV1): void {
  const { responseHash: _responseHash, ...identity } = value;
  value.responseHash = operatorRelayResponseHash(identity);
}

type RequestAttack = {
  name: string;
  rehash?: boolean;
  mutate: (value: OperatorRelayRequestV1, seed: number) => void;
};

type ResponseAttack = {
  name: string;
  rehash?: boolean;
  mutate: (value: OperatorRelayResponseV1, seed: number) => void;
};

const requestAttacks: RequestAttack[] = [
  { name: 'contract', mutate: (v) => { v.contract = 'bad/request' as typeof v.contract; } },
  { name: 'relay-id-empty', mutate: (v) => { v.relayId = ''; } },
  { name: 'source-unsupported', mutate: (v) => { v.fromOperator = 'unknown-source' as typeof v.fromOperator; } },
  { name: 'target-unsupported', mutate: (v) => { v.toOperator = 'unknown-target' as typeof v.toOperator; } },
  { name: 'self-relay', mutate: (v) => { v.toOperator = 'codex'; } },
  { name: 'capability-unsupported', mutate: (v) => { v.capability = 'execute' as typeof v.capability; } },
  { name: 'goal-empty', mutate: (v) => { v.goal = ''; } },
  { name: 'goal-too-long', mutate: (v) => { v.goal = 'g'.repeat(4_001); } },
  { name: 'summary-empty', mutate: (v) => { v.context.summary = ''; } },
  { name: 'summary-too-long', mutate: (v) => { v.context.summary = 's'.repeat(12_001); } },
  { name: 'fingerprint-short', mutate: (v) => { v.context.sourceFingerprint = 'abc'; } },
  { name: 'fingerprint-nonhex', mutate: (v) => { v.context.sourceFingerprint = 'z'.repeat(64); } },
  { name: 'fingerprint-mismatch', mutate: (v) => { v.context.sourceFingerprint = 'a'.repeat(64); } },
  {
    name: 'source-ref-wrong-type',
    rehash: false,
    mutate: (v) => { (v.context as unknown as Record<string, unknown>).sourceRef = 42; },
  },
  { name: 'authority-external-write', mutate: (v) => { v.authority.externalWrite = true as false; } },
  { name: 'authority-merge', mutate: (v) => { v.authority.merge = true as false; } },
  { name: 'authority-deploy', mutate: (v) => { v.authority.deploy = true as false; } },
  { name: 'authority-publish', mutate: (v) => { v.authority.publish = true as false; } },
  { name: 'authority-provider-mutation', mutate: (v) => { v.authority.providerMutation = true as false; } },
  {
    name: 'authority-extra-field',
    mutate: (v) => { (v.authority as unknown as Record<string, unknown>).execute = true; },
  },
  { name: 'sensitivity-unsupported', mutate: (v) => { v.sensitivity = 'secret' as typeof v.sensitivity; } },
  { name: 'created-invalid', mutate: (v) => { v.createdAt = 'not-a-time'; } },
  { name: 'expires-invalid', mutate: (v) => { v.expiresAt = 'not-a-time'; } },
  { name: 'zero-lifetime', mutate: (v) => { v.expiresAt = v.createdAt; } },
  { name: 'expired', mutate: (v) => { v.expiresAt = '2026-09-16T06:30:59.000Z'; } },
  {
    name: 'future-created',
    mutate: (v) => {
      v.createdAt = '2026-09-16T06:31:31.000Z';
      v.expiresAt = '2026-09-16T06:36:31.000Z';
    },
  },
  { name: 'ttl-too-long', mutate: (v) => { v.expiresAt = '2026-09-16T07:00:00.001Z'; } },
  { name: 'request-hash-short', rehash: false, mutate: (v) => { v.requestHash = 'abc'; } },
  { name: 'request-hash-mismatch', rehash: false, mutate: (v) => { v.requestHash = 'f'.repeat(64); } },
  {
    name: 'extra-top-level-field',
    mutate: (v) => { (v as unknown as Record<string, unknown>).executionAuthorized = true; },
  },
];

const responseAttacks: ResponseAttack[] = [
  { name: 'contract', mutate: (v) => { v.contract = 'bad/response' as typeof v.contract; } },
  { name: 'relay-id-mismatch', mutate: (v) => { v.relayId = 'other-relay'; } },
  { name: 'request-hash-mismatch', mutate: (v) => { v.requestHash = 'a'.repeat(64); } },
  { name: 'source-wrong-peer', mutate: (v) => { v.fromOperator = 'claude-code'; } },
  { name: 'source-unsupported', mutate: (v) => { v.fromOperator = 'unknown-target' as typeof v.fromOperator; } },
  { name: 'return-wrong-peer', mutate: (v) => { v.toOperator = 'perplexity'; } },
  { name: 'return-unsupported', mutate: (v) => { v.toOperator = 'unknown-source' as typeof v.toOperator; } },
  { name: 'status-unsupported', mutate: (v) => { v.status = 'authorized' as typeof v.status; } },
  {
    name: 'answer-wrong-type',
    rehash: false,
    mutate: (v) => { (v as unknown as Record<string, unknown>).answer = 42; },
  },
  { name: 'answer-too-long', mutate: (v) => { v.answer = 'a'.repeat(20_001); } },
  {
    name: 'evidence-wrong-type',
    rehash: false,
    mutate: (v) => { (v as unknown as Record<string, unknown>).evidenceRefs = 42; },
  },
  {
    name: 'evidence-entry-wrong-type',
    rehash: false,
    mutate: (v) => { (v as unknown as Record<string, unknown>).evidenceRefs = [42]; },
  },
  { name: 'evidence-empty', mutate: (v) => { v.evidenceRefs = []; } },
  { name: 'evidence-whitespace', mutate: (v) => { v.evidenceRefs = ['   ']; } },
  {
    name: 'unresolved-wrong-type',
    rehash: false,
    mutate: (v) => { (v as unknown as Record<string, unknown>).unresolved = 42; },
  },
  {
    name: 'unresolved-entry-wrong-type',
    rehash: false,
    mutate: (v) => { (v as unknown as Record<string, unknown>).unresolved = [42]; },
  },
  { name: 'authority-requested', mutate: (v) => { v.authorityRequested = 'merge' as typeof v.authorityRequested; } },
  { name: 'completed-at-invalid', mutate: (v) => { v.completedAt = 'not-a-time'; } },
  { name: 'response-hash-short', rehash: false, mutate: (v) => { v.responseHash = 'abc'; } },
  { name: 'response-hash-mismatch', rehash: false, mutate: (v) => { v.responseHash = 'f'.repeat(64); } },
  {
    name: 'usage-wrong-type',
    rehash: false,
    mutate: (v) => { (v as unknown as Record<string, unknown>).usage = 42; },
  },
  {
    name: 'usage-provider',
    mutate: (v) => {
      v.usage = {
        provider: 'openai' as 'anthropic',
        inputTokens: 1,
        outputTokens: 1,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      };
    },
  },
  {
    name: 'usage-input-negative',
    mutate: (v) => { v.usage = { provider: 'anthropic', inputTokens: -1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }; },
  },
  {
    name: 'usage-output-negative',
    mutate: (v) => { v.usage = { provider: 'anthropic', inputTokens: 1, outputTokens: -1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }; },
  },
  {
    name: 'usage-cache-create-negative',
    mutate: (v) => { v.usage = { provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: -1, cacheReadInputTokens: 0 }; },
  },
  {
    name: 'usage-cache-read-negative',
    mutate: (v) => { v.usage = { provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: -1 }; },
  },
  {
    name: 'usage-input-fractional',
    mutate: (v) => { v.usage = { provider: 'anthropic', inputTokens: 1.5, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }; },
  },
  {
    name: 'usage-output-unsafe',
    mutate: (v) => { v.usage = { provider: 'anthropic', inputTokens: 1, outputTokens: Number.MAX_SAFE_INTEGER + 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }; },
  },
  {
    name: 'extra-top-level-field',
    mutate: (v) => { (v as unknown as Record<string, unknown>).mergeApproved = true; },
  },
  {
    name: 'extra-usage-field',
    mutate: (v) => {
      v.usage = { provider: 'anthropic', inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
      (v.usage as unknown as Record<string, unknown>).costUsd = 0;
    },
  },
];

describe('operator relay ATTACK-6000', () => {
  it('rejects exactly 6,000 deterministic malformed requests and responses without validator crashes', () => {
    expect(requestAttacks).toHaveLength(30);
    expect(responseAttacks).toHaveLength(30);

    let rejected = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      for (const attack of requestAttacks) {
        const value = clone(validRequest(seed));
        attack.mutate(value, seed);
        if (attack.rehash !== false) rehashRequest(value);
        const errors = validateOperatorRelayRequest(value, NOW);
        if (errors.length === 0) {
          throw new Error(`ATTACK-6000 request escaped: ${attack.name}#${seed}`);
        }
        rejected += 1;
      }

      const request = validRequest(seed);
      for (const attack of responseAttacks) {
        const value = clone(validResponse(request, seed));
        attack.mutate(value, seed);
        if (attack.rehash !== false) rehashResponse(value);
        const errors = validateOperatorRelayResponse(value, request);
        if (errors.length === 0) {
          throw new Error(`ATTACK-6000 response escaped: ${attack.name}#${seed}`);
        }
        rejected += 1;
      }
    }

    expect(rejected).toBe(6_000);
  });
});
