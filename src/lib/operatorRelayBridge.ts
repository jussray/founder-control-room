import { randomUUID } from 'node:crypto';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
  type RelayCapability,
  type RelayOperatorId,
  type RelaySensitivity,
} from './operatorRelay.js';
import { dispatchOperatorRelay, type OperatorRelayAdapters } from './operatorRelayDispatch.js';

export interface RelayBridgeInput {
  fromOperator: RelayOperatorId;
  toOperator: RelayOperatorId;
  capability: RelayCapability;
  goal: string;
  contextSummary: string;
  sourceRef?: string | null;
  sensitivity?: RelaySensitivity;
  now?: Date;
  ttlMs?: number;
}

export async function relayBetweenOperators(input: RelayBridgeInput, adapters: OperatorRelayAdapters) {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? 5 * 60_000;
  const sourceRef = input.sourceRef ?? null;
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: `relay-${randomUUID()}`,
    fromOperator: input.fromOperator,
    toOperator: input.toOperator,
    capability: input.capability,
    goal: input.goal,
    context: {
      summary: input.contextSummary,
      sourceRef,
      sourceFingerprint: relayContextFingerprint(input.contextSummary, sourceRef),
    },
    authority: {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
    sensitivity: input.sensitivity ?? 'internal',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  const request: OperatorRelayRequestV1 = { ...base, requestHash: operatorRelayRequestHash(base) };
  const response = await dispatchOperatorRelay(request, adapters, now.getTime());
  return { request, response };
}
