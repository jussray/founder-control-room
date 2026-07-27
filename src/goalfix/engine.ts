import type { RepositoryRef, VerificationSignal } from '../providers/RepositoryProvider.js';

export type GoalfixReadiness = 'ready_for_founder_decision' | 'blocked' | 'waiting_for_evidence';

export interface FounderGoal {
  desiredOutcome: string;
  reason?: string;
  constraints: string[];
  suspectedFailureArea?: string;
  firstFilesOrLogs: string[];
  stopCondition?: string;
}

export interface GoalfixProject {
  id: string;
  slug: string;
  name: string;
  repository: string;
  provider: string;
}

export interface GoalfixEvidence {
  verified: string[];
  inferred: string[];
  unknown: string[];
  blocked: string[];
}

export interface GoalfixAuthority {
  level: 'L1';
  mode: 'read-only';
  mutationAllowed: false;
  requiresExplicitApprovalForMutation: true;
}

export interface GoalfixReport {
  version: 'goalfix-v1';
  observedAt: string;
  readiness: GoalfixReadiness;
  routing: {
    skill: 'goalfix';
    connectorAction: 'repository.read';
  };
  authority: GoalfixAuthority;
  project: GoalfixProject;
  target: RepositoryRef;
  goal: FounderGoal;
  evidence: GoalfixEvidence;
  reality: string[];
  fix: string[];
  proof: string[];
  risk: string[];
  rollback: string[];
  nextGate: string;
}

export interface BuildGoalfixReportInput {
  project: GoalfixProject;
  target: RepositoryRef;
  goal: FounderGoal;
  verificationSignals: VerificationSignal[];
  observedAt?: Date;
}

const TERMINAL_FAILURES = new Set<VerificationSignal['status']>(['failed', 'cancelled']);
const INCOMPLETE_SIGNALS = new Set<VerificationSignal['status']>(['queued', 'running', 'skipped', 'unknown']);

function describeSignal(signal: VerificationSignal): string {
  return `${signal.name || 'Unnamed verification signal'}: ${signal.status} at ${signal.commitSha}`;
}

export function buildGoalfixReport(input: BuildGoalfixReportInput): GoalfixReport {
  const expectedSha = input.target.commitSha.toLowerCase();
  const exactHeadSignals = input.verificationSignals.filter(
    (signal) => signal.commitSha.toLowerCase() === expectedSha,
  );
  const mismatchedSignals = input.verificationSignals.filter(
    (signal) => signal.commitSha.toLowerCase() !== expectedSha,
  );
  const failures = exactHeadSignals.filter((signal) => TERMINAL_FAILURES.has(signal.status));
  const incomplete = exactHeadSignals.filter((signal) => INCOMPLETE_SIGNALS.has(signal.status));
  const passed = exactHeadSignals.filter((signal) => signal.status === 'passed');

  let readiness: GoalfixReadiness = 'waiting_for_evidence';
  if (failures.length > 0) readiness = 'blocked';
  else if (exactHeadSignals.length > 0 && incomplete.length === 0 && passed.length === exactHeadSignals.length) {
    readiness = 'ready_for_founder_decision';
  }

  const verified = [
    `Resolved ${input.target.name} to immutable commit ${input.target.commitSha}.`,
    ...passed.map(describeSignal),
  ];
  const inferred = [
    'The smallest safe next action should target the first failing or missing proof signal, not broaden into unrelated repository work.',
  ];
  const unknown: string[] = [];
  const blocked: string[] = failures.map(describeSignal);

  if (exactHeadSignals.length === 0) {
    unknown.push(`No exact-head verification signals were returned for ${input.target.commitSha}.`);
  }
  if (incomplete.length > 0) {
    unknown.push(...incomplete.map(describeSignal));
  }
  if (mismatchedSignals.length > 0) {
    unknown.push(
      `${mismatchedSignals.length} verification signal(s) were ignored because their commit SHA did not match the inspected head.`,
    );
  }

  const proof = exactHeadSignals.length > 0
    ? exactHeadSignals.map(describeSignal)
    : [`No exact-head provider proof exists yet for ${input.target.commitSha}.`];

  const nextGate = readiness === 'blocked'
    ? 'Inspect the first exact-head failed or cancelled signal, repair only its verified root cause, then rerun the focused check.'
    : readiness === 'waiting_for_evidence'
      ? 'Run or finish the narrowest required exact-head verification, retain its logs or artifact, and inspect the result before any mutation.'
      : 'Founder reviews the evidence and explicitly approves one bounded mutation, or closes the goal with no change.';

  return {
    version: 'goalfix-v1',
    observedAt: (input.observedAt ?? new Date()).toISOString(),
    readiness,
    routing: {
      skill: 'goalfix',
      connectorAction: 'repository.read',
    },
    authority: {
      level: 'L1',
      mode: 'read-only',
      mutationAllowed: false,
      requiresExplicitApprovalForMutation: true,
    },
    project: input.project,
    target: input.target,
    goal: input.goal,
    evidence: { verified, inferred, unknown, blocked },
    reality: [
      `The authoritative repository ref is ${input.target.name} at ${input.target.commitSha}.`,
      `${exactHeadSignals.length} exact-head verification signal(s) were inspected.`,
      'This inspection performed no repository, provider, deployment, product-data, CRM, or publication mutation. The route may retain one sanitized internal access-audit event.',
    ],
    fix: ['No fix was applied. Goalfix v1 stops at inspection and founder decision authority.'],
    proof,
    risk: [
      'Passing repository checks prove only the checks that actually ran, not production behavior or the founder outcome.',
      'Missing, skipped, running, unknown, or mismatched-head evidence must not be presented as green.',
    ],
    rollback: ['No target-system rollback is required. Revert the Goalfix code change to remove the surface; retain any sanitized audit event as historical evidence.'],
    nextGate,
  };
}
