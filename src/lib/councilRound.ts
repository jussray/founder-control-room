/**
 * Council round runner: the zero-clipboard transport between Council seats.
 *
 * Each completed provider answer becomes the exact next-hop context. Hashes bind
 * the chain so resume cannot silently change the seed, source, seat order, or
 * prior answers. FCR may be the transport initiator, but it is never treated as
 * a model provider and cannot be selected as a target seat.
 */
import { createHash } from 'node:crypto';
import { relayBetweenOperators } from './operatorRelayBridge.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import {
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayResponseHash,
  type OperatorRelayResponseV1,
  type OperatorRelayUsageV1,
  type RelayCapability,
  type RelayOperatorId,
  type RelaySensitivity,
  type RelaySourceId,
  type RelayStatus,
} from './operatorRelay.js';

export const COUNCIL_ROUND_CONTRACT = 'fcr.council-round.v1' as const;

export interface CouncilSeat {
  operator: RelayOperatorId;
  capability: RelayCapability;
}

export interface CouncilHop {
  index: number;
  relayId: string;
  fromOperator: RelaySourceId;
  toOperator: RelayOperatorId;
  capability: RelayCapability;
  requestHash: string;
  responseHash: string;
  status: 'completed';
  inputSha256: string;
  answerSha256: string;
  answer: string;
  evidenceRefs: string[];
  unresolved: string[];
  authorityRequested: 'none';
  liveProviderEvidence: boolean;
  /** Provider-reported token usage copied from the hash-bound relay response; measurement only. */
  usage?: OperatorRelayUsageV1;
  completedAt: string;
}

export interface CouncilInterruption {
  seatIndex: number;
  operator: RelayOperatorId;
  reason: string;
  status: RelayStatus | null;
  relayId: string | null;
  fromOperator: RelaySourceId | null;
  requestHash: string | null;
  responseHash: string | null;
  answer: string | null;
  evidenceRefs: string[];
  unresolved: string[];
  authorityRequested: 'none' | null;
  completedAt: string | null;
  liveProviderEvidence: boolean;
  /** Provider-reported token usage copied from a hash-bound relay response when one exists. */
  usage?: OperatorRelayUsageV1;
}

export interface PersistedRelayResponseRecovery {
  responses: OperatorRelayResponseV1[];
  ignoredLegacyProjections: number;
  rejectedInvalidProjections: number;
}

export interface CouncilTranscript {
  contract: typeof COUNCIL_ROUND_CONTRACT;
  goal: string;
  initiator: RelaySourceId;
  sourceRef: string | null;
  seedSha256: string;
  hops: CouncilHop[];
  humanRelay: false;
  state: 'complete' | 'interrupted';
  /** Index of the seat that must be called next. */
  nextSeatIndex: number;
  interruption: CouncilInterruption | null;
}

export interface CouncilConversationRow {
  mission_id: string | null;
  round: number;
  participants: string[];
  transcript: CouncilTranscript;
  outcome: string;
}

export interface CouncilRoundInput {
  goal: string;
  initiator: RelaySourceId;
  seed: string;
  seats: CouncilSeat[];
  missionId?: string | null;
  round?: number;
  sensitivity?: RelaySensitivity;
  sourceRef?: string | null;
  now?: () => Date;
  /** Resume an interrupted round. Completed hops are retained and not re-called. */
  resumeFrom?: CouncilTranscript;
  persist?: (row: CouncilConversationRow) => Promise<void>;
}

export class CouncilLineageError extends Error {}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalizeSourceRef(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}


function completedResponseFromHop(hop: CouncilHop): OperatorRelayResponseV1 | 'legacy' | 'invalid' {
  const raw = hop as CouncilHop & { unresolved?: unknown; authorityRequested?: unknown };
  if (!Array.isArray(raw.unresolved) || !raw.unresolved.every((item) => typeof item === 'string') || raw.authorityRequested === undefined) {
    return 'legacy';
  }
  if (raw.authorityRequested !== 'none') return 'invalid';

  const identity: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: hop.relayId,
    requestHash: hop.requestHash,
    fromOperator: hop.toOperator,
    toOperator: hop.fromOperator,
    status: 'completed',
    answer: hop.answer,
    evidenceRefs: [...hop.evidenceRefs],
    unresolved: [...raw.unresolved],
    authorityRequested: 'none',
    completedAt: hop.completedAt,
    ...(hop.usage ? { usage: hop.usage } : {}),
  };
  if (operatorRelayResponseHash(identity) !== hop.responseHash) return 'invalid';
  return { ...identity, responseHash: hop.responseHash };
}

function interruptedResponse(interruption: CouncilInterruption): OperatorRelayResponseV1 | 'legacy' | 'invalid' | null {
  if (interruption.status !== 'blocked' && interruption.status !== 'failed') return null;
  const raw = interruption as CouncilInterruption & {
    relayId?: unknown;
    fromOperator?: unknown;
    answer?: unknown;
    unresolved?: unknown;
    authorityRequested?: unknown;
    completedAt?: unknown;
  };
  if (
    typeof raw.relayId !== 'string'
    || typeof raw.fromOperator !== 'string'
    || typeof interruption.requestHash !== 'string'
    || typeof interruption.responseHash !== 'string'
    || typeof raw.answer !== 'string'
    || !Array.isArray(raw.unresolved)
    || !raw.unresolved.every((item) => typeof item === 'string')
    || raw.authorityRequested === undefined
    || typeof raw.completedAt !== 'string'
  ) {
    return 'legacy';
  }
  if (raw.authorityRequested !== 'none') return 'invalid';

  const identity: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: raw.relayId,
    requestHash: interruption.requestHash,
    fromOperator: interruption.operator,
    toOperator: raw.fromOperator as RelaySourceId,
    status: interruption.status,
    answer: raw.answer,
    evidenceRefs: [...interruption.evidenceRefs],
    unresolved: [...raw.unresolved],
    authorityRequested: 'none',
    completedAt: raw.completedAt,
    ...(interruption.usage ? { usage: interruption.usage } : {}),
  };
  if (operatorRelayResponseHash(identity) !== interruption.responseHash) return 'invalid';
  return { ...identity, responseHash: interruption.responseHash };
}

/**
 * Recover hash-verifiable operator relay outcome receipts from a persisted Council transcript.
 *
 * New transcripts persist every response field that participates in the canonical response hash.
 * Historical Council projections that predate those fields are deliberately excluded instead of
 * being upgraded into synthetic receipts. Provider exceptions with no response also remain absent.
 */
export function recoverPersistedRelayResponses(transcript: CouncilTranscript): PersistedRelayResponseRecovery {
  const responses: OperatorRelayResponseV1[] = [];
  let ignoredLegacyProjections = 0;
  let rejectedInvalidProjections = 0;

  for (const hop of transcript.hops) {
    const recovered = completedResponseFromHop(hop);
    if (recovered === 'legacy') ignoredLegacyProjections += 1;
    else if (recovered === 'invalid') rejectedInvalidProjections += 1;
    else responses.push(recovered);
  }

  if (transcript.interruption) {
    const recovered = interruptedResponse(transcript.interruption);
    if (recovered === 'legacy') ignoredLegacyProjections += 1;
    else if (recovered === 'invalid') rejectedInvalidProjections += 1;
    else if (recovered) responses.push(recovered);
  }

  return { responses, ignoredLegacyProjections, rejectedInvalidProjections };
}

function verifyResumeLineage(input: CouncilRoundInput, prior: CouncilTranscript): void {
  if (prior.contract !== COUNCIL_ROUND_CONTRACT) throw new CouncilLineageError('resume transcript contract mismatch');
  if (prior.goal !== input.goal) throw new CouncilLineageError('resume goal does not match original round');
  if (prior.initiator !== input.initiator) throw new CouncilLineageError('resume initiator mismatch');
  if (prior.sourceRef !== normalizeSourceRef(input.sourceRef)) throw new CouncilLineageError('resume source reference mismatch');
  if (prior.seedSha256 !== sha256(input.seed)) throw new CouncilLineageError('resume seed fingerprint mismatch');
  if (prior.hops.some((hop) => hop.status !== 'completed')) throw new CouncilLineageError('resume contains a non-completed hop');
  if (prior.nextSeatIndex !== prior.hops.length) throw new CouncilLineageError('resume checkpoint does not match completed hop count');

  let expectedInput = prior.seedSha256;
  let expectedSource: RelaySourceId = input.initiator;
  prior.hops.forEach((hop, i) => {
    const seat = input.seats[i];
    if (!seat || seat.operator !== hop.toOperator) throw new CouncilLineageError(`resume hop ${i} seat mismatch`);
    if (hop.fromOperator !== expectedSource) throw new CouncilLineageError(`resume hop ${i} source mismatch`);
    if (hop.inputSha256 !== expectedInput) throw new CouncilLineageError(`resume hop ${i} input fingerprint broken`);
    if (sha256(hop.answer) !== hop.answerSha256) throw new CouncilLineageError(`resume hop ${i} answer tampered`);
    expectedInput = hop.answerSha256;
    expectedSource = hop.toOperator;
  });
}

export async function runCouncilRound(
  input: CouncilRoundInput,
  adapters: OperatorRelayAdapters,
): Promise<CouncilConversationRow> {
  if (input.seats.length === 0) throw new Error('council round needs at least one seat');
  if (!input.goal.trim()) throw new Error('council round goal is required');
  if (!input.seed.trim()) throw new Error('council round seed is required');

  const now = input.now ?? (() => new Date());
  const sourceRef = normalizeSourceRef(input.sourceRef);
  const prior = input.resumeFrom ?? null;
  if (prior) verifyResumeLineage(input, prior);

  const hops: CouncilHop[] = prior ? [...prior.hops] : [];
  let context = hops.length ? hops[hops.length - 1].answer : input.seed;
  let from: RelaySourceId = hops.length ? hops[hops.length - 1].toOperator : input.initiator;
  let interruption: CouncilInterruption | null = null;

  for (let i = hops.length; i < input.seats.length; i += 1) {
    const seat = input.seats[i];
    if (seat.operator === from) throw new CouncilLineageError(`hop ${i} cannot relay to its current source`);

    const inputSha256 = sha256(context);
    const expected = i === 0 ? sha256(input.seed) : hops[i - 1].answerSha256;
    if (inputSha256 !== expected) throw new CouncilLineageError(`hop ${i} would receive altered input`);

    let result;
    try {
      result = await relayBetweenOperators({
        fromOperator: from,
        toOperator: seat.operator,
        capability: seat.capability,
        goal: input.goal,
        contextSummary: context,
        sourceRef,
        sensitivity: input.sensitivity,
        now: now(),
      }, adapters);
    } catch (error) {
      interruption = {
        seatIndex: i,
        operator: seat.operator,
        reason: error instanceof Error ? error.message.slice(0, 300) : 'relay failed',
        status: null,
        relayId: null,
        fromOperator: null,
        requestHash: null,
        responseHash: null,
        answer: null,
        evidenceRefs: [],
        unresolved: [],
        authorityRequested: null,
        completedAt: null,
        liveProviderEvidence: false,
      };
      break;
    }

    const { request, response } = result;
    if (response.requestHash !== request.requestHash) {
      throw new CouncilLineageError(`hop ${i} response is bound to a different request`);
    }
    if (request.context.summary !== context) {
      throw new CouncilLineageError(`hop ${i} request context diverged from previous answer`);
    }

    const evidenceRefs = [...new Set(response.evidenceRefs)];
    const liveProviderEvidence = evidenceRefs.some((ref) => ref.startsWith('provider:'));
    if (response.status !== 'completed') {
      interruption = {
        seatIndex: i,
        operator: seat.operator,
        reason: `seat returned ${response.status}`,
        status: response.status,
        relayId: request.relayId,
        fromOperator: from,
        requestHash: request.requestHash,
        responseHash: response.responseHash,
        answer: response.answer,
        evidenceRefs,
        unresolved: [...response.unresolved],
        authorityRequested: response.authorityRequested,
        completedAt: response.completedAt,
        liveProviderEvidence,
        ...(response.usage ? { usage: response.usage } : {}),
      };
      break;
    }

    hops.push({
      index: i,
      relayId: request.relayId,
      fromOperator: from,
      toOperator: seat.operator,
      capability: seat.capability,
      requestHash: request.requestHash,
      responseHash: response.responseHash,
      status: 'completed',
      inputSha256,
      answerSha256: sha256(response.answer),
      answer: response.answer,
      evidenceRefs,
      unresolved: [...response.unresolved],
      authorityRequested: response.authorityRequested,
      liveProviderEvidence,
      completedAt: response.completedAt,
      ...(response.usage ? { usage: response.usage } : {}),
    });
    context = response.answer;
    from = seat.operator;
  }

  const state = interruption ? 'interrupted' : 'complete';
  const transcript: CouncilTranscript = {
    contract: COUNCIL_ROUND_CONTRACT,
    goal: input.goal,
    initiator: input.initiator,
    sourceRef,
    seedSha256: sha256(input.seed),
    hops,
    humanRelay: false,
    state,
    nextSeatIndex: interruption ? interruption.seatIndex : hops.length,
    interruption,
  };
  const row: CouncilConversationRow = {
    mission_id: input.missionId ?? null,
    round: input.round ?? 1,
    participants: [input.initiator, ...input.seats.map((seat) => seat.operator)],
    transcript,
    outcome: state === 'complete' ? hops[hops.length - 1].answer : `interrupted at seat ${transcript.nextSeatIndex}`,
  };
  if (input.persist) await input.persist(row);
  return row;
}
