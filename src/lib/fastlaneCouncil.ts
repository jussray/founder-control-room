/**
 * Opt-in /fastlane v1.1 Council runner. Independent verdicts are collected
 * before any provider sees another's answer. The sequential runner is unchanged.
 *
 * This is advisory orchestration, not a grant of task, merge, deploy, spend,
 * publication, provider, or founder authority. Task ownership remains PENDING
 * until an independently verified owner acceptance receipt exists.
 */
import { createHash } from 'node:crypto';
import { relayBetweenOperators } from './operatorRelayBridge.js';
import type { OperatorRelayAdapters } from './operatorRelayDispatch.js';
import type { RelayOperatorId, RelaySensitivity } from './operatorRelay.js';

export const FASTLANE_CONTRACT = 'fcr.fastlane-council.v1.1' as const;
const MAX_CONTEXT = 12_000;
const CLUSTER_TARGET_MS = 10_000;
const STAGE1_HEADINGS = ['REALITY', 'FIX', 'PROOF', 'RISK', 'ROLLBACK', 'NEXT GATE'] as const;

export type FastlaneSeat = { operator: RelayOperatorId; capability: 'propose' };
export type FastlaneEvidenceState = 'VERIFIED' | 'INFERRED' | 'UNKNOWN' | 'BLOCKED';
export interface FastlaneReply {
  operator: RelayOperatorId;
  state: 'COLLECTED' | 'BLOCKED';
  requestHash: string | null;
  responseHash: string | null;
  evidenceRefs: string[];
  answer: string | null;
  receivedAt: string | null;
  reason: string | null;
}
export interface FastlaneTask {
  task: string;
  owner: RelayOperatorId;
  repoSurface: string;
  doneWhen: string;
  receiptDue: string;
  acceptance: 'PENDING';
}
export interface FastlaneEscalation {
  reason: string;
  split: Array<{operator: RelayOperatorId; position: string | null}>;
  question: string;
  options: ['A: stop and retain evidence', 'B: authorize a new scoped Council round', 'other'];
}
export interface FastlaneTranscript {
  contract: typeof FASTLANE_CONTRACT;
  goal: string;
  sourceRef: string | null;
  seedSha256: string;
  humanRelay: false;
  mode: 'fastlane';
  stage1: {
    verdicts: FastlaneReply[];
    spreadMs: number | null;
    withinTarget: boolean | null;
    complete: boolean;
  };
  stage2: {
    rounds: FastlaneReply[][];
    unanimous: boolean;
    verdict: string | null;
  };
  stage3: {
    state: 'FOUNDER_RULING' | 'AWAITING_ACCEPTANCE';
    tasks: FastlaneTask[];
    escalation: FastlaneEscalation | null;
  };
  state: 'founder_ruling' | 'awaiting_acceptance';
}
export interface FastlaneConversationRow {
  mission_id: string | null;
  round: number;
  participants: string[];
  transcript: FastlaneTranscript;
  outcome: string;
}
export interface FastlaneInput {
  goal: string;
  seed: string;
  seats: FastlaneSeat[];
  missionId?: string | null;
  round?: number;
  sourceRef?: string | null;
  sensitivity?: RelaySensitivity;
  persist?: (row: FastlaneConversationRow) => Promise<void>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function field(answer: string, name: string): string | null {
  const line = answer.split(/\r?\n/).find((part) =>
    part.toUpperCase().startsWith(name + ':'));
  const value = line?.slice(name.length + 1).trim();
  return value || null;
}
function reactsToAnotherSeat(answer: string): boolean {
  return /\b(?:agree with|in response to|building on)\s+(?:claude|codex|muse|deepseek|gemini|perplexity)\b/i.test(answer);
}
function validStage1(answer: string): boolean {
  return STAGE1_HEADINGS.every((name) => Boolean(field(answer, name))) &&
    /\b(?:VERIFIED|INFERRED|UNKNOWN|BLOCKED)\b/.test(answer) &&
    !/^PROOF:\s*(?:UNVERIFIED|UNKNOWN|BLOCKED)\s*$/im.test(answer) &&
    !reactsToAnotherSeat(answer);
}
function validStage2(answer: string): boolean {
  return ['AGREE', 'DISAGREE', 'BLIND SPOT', 'VERDICT', 'CONVERGED']
    .every((name) => Boolean(field(answer, name))) &&
    /^(?:YES|NO)$/i.test(field(answer, 'CONVERGED') ?? '') &&
    !/^(?:TASK|OWNER):/im.test(answer);
}
function inScope(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CONTEXT;
}
function makeEscalation(reason: string, positions: FastlaneReply[]): FastlaneEscalation {
  return {
    reason,
    split: positions.map(({operator, answer}) => ({operator, position: answer})),
    question: 'Should this Council round stop or begin a new founder-scoped independent round?',
    options: ['A: stop and retain evidence', 'B: authorize a new scoped Council round', 'other'],
  };
}
function parseTasks(answer: string, owners: readonly RelayOperatorId[]): FastlaneTask[] {
  const segments = answer.trim().split(/(?=^TASK:\s*)/m).filter(Boolean);
  if (!segments.length || segments.length > 10) return [];
  const tasks: FastlaneTask[] = [];
  for (const segment of segments) {
    const task = field(segment, 'TASK');
    const owner = field(segment, 'OWNER');
    const repoSurface = field(segment, 'REPO/SURFACE');
    const doneWhen = field(segment, 'DONE WHEN');
    const receiptDue = field(segment, 'RECEIPT DUE');
    if (!task || !owner || !owners.includes(owner as RelayOperatorId) ||
        !repoSurface || !doneWhen || !receiptDue || !/\bby\b/i.test(receiptDue)) return [];
    tasks.push({task, owner: owner as RelayOperatorId, repoSurface,
      doneWhen, receiptDue, acceptance: 'PENDING'});
  }
  return tasks;
}

export async function runFastlaneCouncil(
  input: FastlaneInput, adapters: OperatorRelayAdapters,
): Promise<FastlaneConversationRow> {
  if (!input.goal.trim() || input.goal.length > 3000) throw new Error('Fastlane goal must be 1..3000 characters');
  if (!inScope(input.seed.trim())) throw new Error('Fastlane seed must be 1..12000 characters');
  if (input.sensitivity === 'restricted') throw new Error('Fastlane restricted context is not authorized');
  if (input.seats.length < 2 || input.seats.length > 4 ||
    new Set(input.seats.map((seat) => seat.operator)).size !== input.seats.length ||
    input.seats.some((seat) => seat.capability !== 'propose')) {
    throw new Error('Fastlane needs 2..4 distinct propose-capable Council seats');
  }

  const sourceRef = input.sourceRef?.trim() || null;
  const transcript: FastlaneTranscript = {
    contract: FASTLANE_CONTRACT, goal: input.goal, sourceRef,
    seedSha256: sha256(input.seed), humanRelay: false, mode: 'fastlane',
    stage1: {verdicts: [], spreadMs: null, withinTarget: null, complete: false},
    stage2: {rounds: [], unanimous: false, verdict: null},
    stage3: {state: 'FOUNDER_RULING', tasks: [], escalation: null},
    state: 'founder_ruling',
  };
  const stage1Goal = [
    'FASTLANE v1.1 STAGE 1: Give a BLIND independent verdict on the original prompt.',
    'Do not refer to, infer, or react to any other Council member.',
    'Use REALITY, FIX, PROOF, RISK, ROLLBACK, NEXT GATE headings.',
    'Label material claims VERIFIED, INFERRED, UNKNOWN, or BLOCKED.',
    'Never invent proof; flag decision-floor items as DECISION FLOOR.',
    'Original prompt:', input.goal,
  ].join('\n');

  // Every member receives exactly the same original seed. No shared mutable
  // context, chained answers, or provider-to-provider forwarding exists here.
  const collect = async (
    operator: RelayOperatorId, goal: string, context: string, check: (answer: string) => boolean,
  ): Promise<FastlaneReply> => {
    try {
      if (!inScope(context) || goal.length > 4000) throw new Error('context out of bounds');
      const {request, response} = await relayBetweenOperators({
        fromOperator: 'fcr', toOperator: operator, capability: 'propose',
        goal, contextSummary: context, sourceRef,
        sensitivity: input.sensitivity ?? 'internal',
      }, adapters);
      const answer = response.status === 'completed' ? response.answer : null;
      const valid = answer !== null && check(answer) && response.unresolved.length === 0;
      return {
        operator, state: valid ? 'COLLECTED' : 'BLOCKED',
        requestHash: request.requestHash, responseHash: response.responseHash,
        evidenceRefs: response.evidenceRefs, answer,
        receivedAt: new Date().toISOString(),
        reason: valid ? null : 'missing, unresolved, malformed, or unverified response',
      };
    } catch {
      // Provider errors may contain sensitive transport details. Do not persist them.
      return {operator, state: 'BLOCKED', requestHash: null, responseHash: null,
        evidenceRefs: [], answer: null, receivedAt: null, reason: 'provider or policy unavailable'};
    }
  };

  let first = await Promise.all(input.seats.map((seat) =>
    collect(seat.operator, stage1Goal, input.seed, validStage1)));
  // A Stage 1 reaction is disqualified. Re-run that seat with the original
  // unchanged prompt, never another member's verdict; failed retry stays BLOCKED.
  first = await Promise.all(first.map((reply) =>
    reply.answer && reactsToAnotherSeat(reply.answer)
      ? collect(reply.operator, stage1Goal, input.seed, validStage1)
      : Promise.resolve(reply)));
  transcript.stage1.verdicts = first;
  const arrivals = first
    .filter((reply) => reply.state === 'COLLECTED' && reply.receivedAt)
    .map((reply) => Date.parse(reply.receivedAt!));
  if (arrivals.length === input.seats.length) {
    transcript.stage1.spreadMs = Math.max(...arrivals) - Math.min(...arrivals);
    transcript.stage1.withinTarget = transcript.stage1.spreadMs <= CLUSTER_TARGET_MS;
  }
  transcript.stage1.complete = first.every((reply) => reply.state === 'COLLECTED');

  const positions = (): FastlaneReply[] =>
    transcript.stage2.rounds.at(-1) ?? transcript.stage1.verdicts;
  const escalate = (reason: string): void => {
    transcript.state = 'founder_ruling';
    transcript.stage3.state = 'FOUNDER_RULING';
    transcript.stage3.escalation = makeEscalation(reason, positions());
  };
  if (!transcript.stage1.complete || first.some((reply) => /^(?:DECISION FLOOR):/im.test(reply.answer ?? ''))) {
    escalate('Stage 1 missing proof/member or invoked founder decision floor');
  } else {
    // Stage 2 is open and non-binding. Round 2 sees round 1 only if required.
    for (let round = 1; round <= 2; round += 1) {
      const stage1Text = first.map((reply) =>
        `[STAGE 1 ${reply.operator}]\n${reply.answer}`).join('\n\n');
      const priorText = transcript.stage2.rounds
        .map((responses, index) => responses.map((reply) =>
          `[REASONING ROUND ${index + 1} ${reply.operator}]\n${reply.answer}`).join('\n\n'))
        .join('\n\n');
      const context = [input.seed, stage1Text, priorText].filter(Boolean).join('\n\n');
      const stage2Goal = [
        `FASTLANE v1.1 STAGE 2 ROUND ${round} (maximum 2). Reason, do not delegate.`,
        'State AGREE, DISAGREE, BLIND SPOT, VERDICT, and CONVERGED: YES or NO.',
        'CONVERGED: YES only if you fully endorse the exact verdict.',
        'If merge/deploy/production/spend/delete/credentials/migration/legal/security/',
        'public claims/architecture/missing proof/scope require a decision, state DECISION FLOOR.',
        'Original prompt:', input.goal,
      ].join('\n');
      const responses = await Promise.all(input.seats.map((seat) =>
        collect(seat.operator, stage2Goal, context, validStage2)));
      transcript.stage2.rounds.push(responses);
      if (responses.some((reply) => reply.state !== 'COLLECTED' ||
          /^(?:DECISION FLOOR):/im.test(reply.answer ?? ''))) break;
      const verdicts = responses.map((reply) => field(reply.answer!, 'VERDICT'));
      if (verdicts.every((value) => value === verdicts[0]) &&
        responses.every((reply) => field(reply.answer!, 'CONVERGED')?.toUpperCase() === 'YES')) {
        transcript.stage2.unanimous = true;
        transcript.stage2.verdict = verdicts[0];
        break;
      }
    }
    if (!transcript.stage2.unanimous) {
      escalate('Stage 2 cap, missing receipt, dissent, or founder decision floor');
    } else {
      // Stage 3: a single advisory proposal, never task acceptance or execution.
      const owners = input.seats.map((seat) => seat.operator);
      const taskGoal = [
        'FASTLANE v1.1 STAGE 3: Break this unanimous advisory verdict into TASK blocks.',
        'Each block MUST have TASK, OWNER, REPO/SURFACE, DONE WHEN, RECEIPT DUE.',
        `OWNER must be exactly one of: ${owners.join(', ')}.`,
        'RECEIPT DUE must say who receives it and by when.',
        'No task is assigned or authorized until that owner accepts with a real receipt.',
        'Do not claim a task was performed. Verdict:', transcript.stage2.verdict!,
      ].join('\n');
      const proposal = await collect(input.seats[0].operator, taskGoal,
        transcript.stage2.verdict!, (answer) => parseTasks(answer, owners).length > 0);
      if (proposal.state !== 'COLLECTED') {
        escalate('Stage 3 delegation proposal incomplete or member BLOCKED');
      } else {
        transcript.stage3.tasks = parseTasks(proposal.answer!, owners);
        transcript.stage3.state = 'AWAITING_ACCEPTANCE';
        transcript.stage3.escalation = null;
        transcript.state = 'awaiting_acceptance';
      }
    }
  }

  const row: FastlaneConversationRow = {
    mission_id: input.missionId ?? null, round: input.round ?? 1,
    participants: ['fcr', ...input.seats.map((seat) => seat.operator)],
    transcript, outcome: transcript.state,
  };
  if (input.persist) await input.persist(row);
  return row;
}
