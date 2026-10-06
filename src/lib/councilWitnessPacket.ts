import { createHash } from 'node:crypto';
import type { CouncilConversationRow } from './councilRound.js';

export const COUNCIL_WITNESS_PACKET_CONTRACT = 'fcr/council-witness-packet@v1' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface CouncilWitnessSubject {
  projectId: string;
  projectName: string;
  projectSlug: string;
  repository: string;
  branch: string;
  headSha: string;
}

export interface CouncilWitnessPacketInput {
  missionId: string;
  goal: string;
  round: number;
  relay: CouncilConversationRow;
  subject: CouncilWitnessSubject;
  observedAt?: Date;
  leaseMinutes?: number;
  stopCondition?: string;
}

export interface CouncilWitnessPacket {
  caseId: string;
  founderGoal: string;
  project: string;
  repository: string;
  branch: string;
  headSha: string;
  observedAt: string;
  expiresAt: string;
  authorityCeiling: string;
  stopCondition: string;
  witnesses: Array<{
    id: string;
    claim: string;
    status: 'VERIFIED' | 'BLOCKED';
    class: 'repository_source' | 'execution_receipt';
    evidenceRef: string;
    sourceFingerprint: string;
    observedAt: string;
    headSha: string;
    independentOf: string[];
    limitation: string;
  }>;
}

function text(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} must be 1..${max} characters`);
  return normalized;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex');
}

export function exactCouncilSourceRef(subject: CouncilWitnessSubject): string {
  return `repo:${subject.repository}#${subject.branch}@${subject.headSha.toLowerCase()}`;
}

export function sameCouncilWitnessSubject(left: CouncilWitnessSubject, right: CouncilWitnessSubject): boolean {
  return (
    left.projectId === right.projectId
    && left.repository === right.repository
    && left.branch === right.branch
    && left.headSha.toLowerCase() === right.headSha.toLowerCase()
  );
}

export function buildCouncilWitnessPacket(input: CouncilWitnessPacketInput): CouncilWitnessPacket {
  const missionId = text(input.missionId, 'missionId', 120);
  const goal = text(input.goal, 'goal', 4_000);
  const projectName = text(input.subject.projectName, 'subject.projectName', 300);
  const repository = text(input.subject.repository, 'subject.repository', 300);
  const branch = text(input.subject.branch, 'subject.branch', 200);
  const headSha = input.subject.headSha.trim().toLowerCase();
  if (!FULL_SHA.test(headSha)) throw new Error('subject.headSha must be a full git SHA');
  if (!Number.isInteger(input.round) || input.round < 1) throw new Error('round must be a positive integer');

  const observedAt = input.observedAt ?? new Date();
  if (!Number.isFinite(observedAt.getTime())) throw new Error('observedAt must be valid');
  const leaseMinutes = input.leaseMinutes ?? 15;
  if (!Number.isInteger(leaseMinutes) || leaseMinutes < 1 || leaseMinutes > 60) {
    throw new Error('leaseMinutes must be an integer from 1 to 60');
  }
  const expiresAt = new Date(observedAt.getTime() + leaseMinutes * 60_000);

  const sourceRef = exactCouncilSourceRef(input.subject);
  if (input.relay.transcript.sourceRef !== sourceRef) {
    throw new Error('Council transcript is not bound to the exact evidence subject');
  }
  if (input.relay.mission_id !== missionId || input.relay.round !== input.round) {
    throw new Error('Council receipt mission/round binding mismatch');
  }

  const transcriptFingerprint = sha256(input.relay.transcript);
  const repositoryFingerprint = sha256({
    repository,
    branch,
    headSha,
  });
  const councilComplete = input.relay.transcript.state === 'complete';

  return {
    caseId: `mission:${missionId}:round:${input.round}`,
    founderGoal: goal,
    project: projectName,
    repository,
    branch,
    headSha,
    observedAt: observedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    authorityCeiling: 'evidence-only; creates no truth, mutation, merge, deploy, publish, provider, or credential authority',
    stopCondition: input.stopCondition?.trim().slice(0, 1_000)
      || 'Return bounded evidence and compile the next proof gate; perform no mutation.',
    witnesses: [
      {
        id: 'repository-head',
        claim: `Repository provider resolved ${repository}#${branch} to exact head ${headSha}.`,
        status: 'VERIFIED',
        class: 'repository_source',
        evidenceRef: `repository:${repository}#${branch}@${headSha}`,
        sourceFingerprint: `repository:${repositoryFingerprint}`,
        observedAt: observedAt.toISOString(),
        headSha,
        independentOf: [],
        limitation: 'Exact repository head proves source identity only; it does not prove deployed runtime identity or product outcome.',
      },
      {
        id: 'council-round',
        claim: councilComplete
          ? `FCR Council round ${input.round} completed with provenance-bound lineage.`
          : `FCR Council round ${input.round} was interrupted at seat ${input.relay.transcript.nextSeatIndex}.`,
        status: councilComplete ? 'VERIFIED' : 'BLOCKED',
        class: 'execution_receipt',
        evidenceRef: `fcr:council:${missionId}:round:${input.round}:${transcriptFingerprint}`,
        sourceFingerprint: `council:${transcriptFingerprint}`,
        observedAt: observedAt.toISOString(),
        headSha,
        independentOf: ['repository-head'],
        limitation: 'Council execution receipt proves lineage and execution state only; it does not prove peer answer truth, founder approval, or mutation authority.',
      },
    ],
  };
}
