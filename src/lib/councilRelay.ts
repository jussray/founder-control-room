import { OPERATOR_RELAY_PEERS } from './operatorRelayConstants.js';
import {
  type RelayCapability,
  type RelayOperatorId,
  type RelaySensitivity,
  type RelaySourceId,
} from './operatorRelay.js';
import { relayBetweenOperators } from './operatorRelayBridge.js';
import { OperatorRelayDispatchError, type OperatorRelayAdapters } from './operatorRelayDispatch.js';

export const LIVE_COUNCIL_RELAY_CONTRACT = 'juss/live-council-relay@v1' as const;
export const DEFAULT_LIVE_COUNCIL_PARTICIPANTS: readonly RelayOperatorId[] = ['codex', 'claude-code', 'muse'];

export type LiveCouncilStatus = 'completed' | 'partial' | 'blocked';

export interface LiveCouncilRelayHop {
  seat: RelayOperatorId;
  source: RelaySourceId;
  status: 'completed' | 'blocked' | 'failed';
  requestHash: string | null;
  responseHash: string | null;
  answer: string;
  evidenceRefs: string[];
  unresolved: string[];
  failureCode: string | null;
}

export interface LiveCouncilRelayRun {
  contract: typeof LIVE_COUNCIL_RELAY_CONTRACT;
  originRef: string | null;
  status: LiveCouncilStatus;
  participants: RelayOperatorId[];
  completedParticipants: RelayOperatorId[];
  blockedParticipants: RelayOperatorId[];
  hops: LiveCouncilRelayHop[];
  finalAnswer: string | null;
  evidenceRefs: string[];
}

export interface LiveCouncilRelayInput {
  goal: string;
  contextSummary: string;
  participants?: readonly RelayOperatorId[];
  capability?: RelayCapability;
  sensitivity?: RelaySensitivity;
  sourceRef?: string | null;
}

const MAX_CARRY_CONTEXT = 10_500;
const RELAY_PEERS = new Set<RelayOperatorId>(OPERATOR_RELAY_PEERS);

function uniqueParticipants(input: readonly RelayOperatorId[] | undefined): RelayOperatorId[] {
  const requested = input?.length ? input : DEFAULT_LIVE_COUNCIL_PARTICIPANTS;
  const output: RelayOperatorId[] = [];
  for (const seat of requested) {
    if (!RELAY_PEERS.has(seat)) continue;
    if (!output.includes(seat)) output.push(seat);
  }
  return output;
}

function carryContext(base: string, hops: readonly LiveCouncilRelayHop[]): string {
  const completed = hops
    .filter((hop) => hop.status === 'completed' && hop.answer.trim())
    .map((hop) => `${hop.seat}: ${hop.answer.trim()}`)
    .join('\n\n');
  const full = completed ? `${base.trim()}\n\nPrior Council contributions:\n${completed}` : base.trim();
  return full.length <= MAX_CARRY_CONTEXT ? full : full.slice(full.length - MAX_CARRY_CONTEXT);
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizedOriginRef(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

export async function runLiveCouncilRelay(
  input: LiveCouncilRelayInput,
  adapters: OperatorRelayAdapters,
): Promise<LiveCouncilRelayRun> {
  const participants = uniqueParticipants(input.participants);
  if (participants.length === 0) throw new Error('live Council requires at least one supported participant');

  const hops: LiveCouncilRelayHop[] = [];
  const originRef = normalizedOriginRef(input.sourceRef);
  let source: RelaySourceId = 'fcr';

  for (const seat of participants) {
    const contextSummary = carryContext(input.contextSummary, hops);
    try {
      const { request, response } = await relayBetweenOperators({
        fromOperator: source,
        toOperator: seat,
        capability: input.capability ?? 'propose',
        goal: input.goal,
        contextSummary,
        sourceRef: originRef,
        sensitivity: input.sensitivity ?? 'internal',
      }, adapters);

      const hop: LiveCouncilRelayHop = {
        seat,
        source,
        status: response.status === 'completed' ? 'completed' : 'blocked',
        requestHash: request.requestHash,
        responseHash: response.responseHash,
        answer: response.answer,
        evidenceRefs: dedupe(response.evidenceRefs),
        unresolved: dedupe(response.unresolved),
        failureCode: response.status === 'completed' ? null : `relay_${response.status}`,
      };
      hops.push(hop);
      if (hop.status === 'completed') source = seat;
    } catch (error) {
      const failureCode = error instanceof OperatorRelayDispatchError ? error.code : 'relay_internal_failure';
      hops.push({
        seat,
        source,
        status: 'failed',
        requestHash: null,
        responseHash: null,
        answer: '',
        evidenceRefs: [],
        unresolved: [],
        failureCode,
      });
    }
  }

  const completed = hops.filter((hop) => hop.status === 'completed');
  const status: LiveCouncilStatus = completed.length === participants.length
    ? 'completed'
    : completed.length > 0
      ? 'partial'
      : 'blocked';

  return {
    contract: LIVE_COUNCIL_RELAY_CONTRACT,
    originRef,
    status,
    participants,
    completedParticipants: completed.map((hop) => hop.seat),
    blockedParticipants: hops.filter((hop) => hop.status !== 'completed').map((hop) => hop.seat),
    hops,
    finalAnswer: completed.at(-1)?.answer ?? null,
    evidenceRefs: dedupe(completed.flatMap((hop) => hop.evidenceRefs)),
  };
}
