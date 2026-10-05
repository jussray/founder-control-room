/**
 * Council round runner — the "telephone" between Council seats.
 *
 * Chains existing single-hop operator relays (relayBetweenOperators) so that
 * seat N+1 receives seat N's exact answer as its context, with no human
 * copy/paste in between. Every hop is bound by sha256: the input a seat
 * received must equal the answer the previous seat produced, or the round
 * fails closed.
 *
 * Output is a ledger-neutral row (participants, transcript, outcome). Its
 * shape is compatible with FCR's local `council_conversations` table, but
 * choosing where rounds are durably stored IS the shared-ledger physical
 * backing decision, which .control-room/COUNCIL.md keeps
 * UNDECIDED_UNTIL_SEPARATELY_AUTHORIZED. So persistence is an injected
 * writer: this module never picks a backing, never touches Supabase, and
 * never spends on a provider by itself.
 *
 * Truth label (COUNCIL.md "live" rule): a hop is `liveProviderEvidence: true`
 * only when its response carries a `provider:` evidence ref.
 *
 * Authority: unchanged. Each hop still carries the relay contract's
 * authority block (no merge/deploy/publish/external write).
 */
import { createHash } from 'node:crypto';
import { relayBetweenOperators } from './operatorRelayBridge.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import type {
  RelayCapability,
  RelayOperatorId,
  RelaySensitivity,
  RelayStatus,
} from './operatorRelay.js';

export const COUNCIL_ROUND_CONTRACT = 'fcr.council-round.v1' as const;

export interface CouncilSeat {
  operator: RelayOperatorId;
  capability: RelayCapability;
}

export interface CouncilHop {
  index: number;
  relayId: string;
  fromOperator: RelayOperatorId;
  toOperator: RelayOperatorId;
  capability: RelayCapability;
  requestHash: string;
  responseHash: string;
  status: RelayStatus;
  inputSha256: string;
  answerSha256: string;
  answer: string;
  evidenceRefs: string[];
  liveProviderEvidence: boolean;
  completedAt: string;
}

export interface CouncilTranscript {
  contract: typeof COUNCIL_ROUND_CONTRACT;
  goal: string;
  initiator: RelayOperatorId;
  seedSha256: string;
  hops: CouncilHop[];
  humanRelay: false;
  state: 'complete' | 'interrupted';
  /** Index of the seat to call next when resuming an interrupted round. */
  nextSeatIndex: number;
  interruption: { seatIndex: number; operator: RelayOperatorId; reason: string } | null;
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
  initiator: RelayOperatorId;
  seed: string;
  seats: CouncilSeat[];
  missionId?: string | null;
  round?: number;
  sensitivity?: RelaySensitivity;
  sourceRef?: string | null;
  now?: () => Date;
  /** Resume an interrupted round: completed hops are kept, calls start at nextSeatIndex. */
  resumeFrom?: CouncilTranscript;
  persist?: (row: CouncilConversationRow) => Promise<void>;
}

export class CouncilLineageError extends Error {}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function verifyResumeLineage(input: CouncilRoundInput, prior: CouncilTranscript): void {
  if (prior.contract !== COUNCIL_ROUND_CONTRACT) throw new CouncilLineageError('resume transcript contract mismatch');
  if (prior.goal !== input.goal) throw new CouncilLineageError('resume goal does not match original round');
  if (prior.seedSha256 !== sha256(input.seed)) throw new CouncilLineageError('resume seed fingerprint mismatch');
  let expected = prior.seedSha256;
  prior.hops.forEach((hop, i) => {
    const seat = input.seats[i];
    if (!seat || seat.operator !== hop.toOperator) throw new CouncilLineageError(`resume hop ${i} seat mismatch`);
    if (hop.inputSha256 !== expected) throw new CouncilLineageError(`resume hop ${i} input fingerprint broken`);
    if (sha256(hop.answer) !== hop.answerSha256) throw new CouncilLineageError(`resume hop ${i} answer tampered`);
    expected = hop.answerSha256;
  });
}

export async function runCouncilRound(
  input: CouncilRoundInput,
  adapters: OperatorRelayAdapters,
): Promise<CouncilConversationRow> {
  if (input.seats.length === 0) throw new Error('council round needs at least one seat');
  const now = input.now ?? (() => new Date());
  const prior = input.resumeFrom ?? null;
  if (prior) verifyResumeLineage(input, prior);

  const hops: CouncilHop[] = prior ? [...prior.hops] : [];
  let context = hops.length ? hops[hops.length - 1].answer : input.seed;
  let from: RelayOperatorId = hops.length ? hops[hops.length - 1].toOperator : input.initiator;
  let interruption: CouncilTranscript['interruption'] = null;

  for (let i = hops.length; i < input.seats.length; i += 1) {
    const seat = input.seats[i];
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
        sourceRef: input.sourceRef ?? null,
        sensitivity: input.sensitivity,
        now: now(),
      }, adapters);
    } catch (error) {
      interruption = {
        seatIndex: i,
        operator: seat.operator,
        reason: error instanceof Error ? error.message.slice(0, 300) : 'relay failed',
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
    hops.push({
      index: i,
      relayId: request.relayId,
      fromOperator: from,
      toOperator: seat.operator,
      capability: seat.capability,
      requestHash: request.requestHash,
      responseHash: response.responseHash,
      status: response.status,
      inputSha256,
      answerSha256: sha256(response.answer),
      answer: response.answer,
      evidenceRefs: response.evidenceRefs,
      liveProviderEvidence: response.evidenceRefs.some((ref) => ref.startsWith('provider:')),
      completedAt: response.completedAt,
    });
    if (response.status !== 'completed') {
      interruption = { seatIndex: i + 1, operator: seat.operator, reason: `seat returned ${response.status}` };
      break;
    }
    context = response.answer;
    from = seat.operator;
  }

  const state = interruption ? 'interrupted' : 'complete';
  const transcript: CouncilTranscript = {
    contract: COUNCIL_ROUND_CONTRACT,
    goal: input.goal,
    initiator: input.initiator,
    seedSha256: sha256(input.seed),
    hops,
    humanRelay: false,
    state,
    nextSeatIndex: interruption ? Math.min(interruption.seatIndex, hops.length) : hops.length,
    interruption,
  };
  const row: CouncilConversationRow = {
    mission_id: input.missionId ?? null,
    round: input.round ?? 1,
    participants: [input.initiator, ...input.seats.map((s) => s.operator)],
    transcript,
    outcome: state === 'complete' ? hops[hops.length - 1].answer : `interrupted at seat ${transcript.nextSeatIndex}`,
  };
  if (input.persist) await input.persist(row);
  return row;
}
