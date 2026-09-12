import type { RepositoryRef, VerificationSignal } from '../providers/RepositoryProvider.js';

export type GoalfixReadiness = 'ready_for_founder_decision' | 'blocked' | 'waiting_for_evidence';
export type GoalfixBottleneckKind =
  | 'failed_verification'
  | 'missing_verification'
  | 'incomplete_verification'
  | 'founder_decision'
  | 'unknown';

export interface FounderGoal {
  desiredOutcome: string;
  reason?: string;
  constraints: string[];
  suspectedFailureArea?: string;
  firstFilesOrLogs: string[];
  expectedVerificationNames: string[];
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

export interface GoalfixBottleneck {
  kind: GoalfixBottleneckKind;
  statement: string;
  evidenceState: 'VERIFIED' | 'UNKNOWN';
  smallestSafeRemoval: string;
  freezesUnrelatedWork: false;
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
  bottleneck: GoalfixBottleneck;
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

function normalizeSignalName(name: string): string {
  return name.trim().toLocaleLowerCase('en-US');
}

function signalTime(signal: VerificationSignal): number {
  return Date.parse(signal.completedAt ?? signal.startedAt ?? '') || 0;
}

function latestSignalsByName(signals: VerificationSignal[]): Map<string, VerificationSignal> {
  const latest = new Map<string, VerificationSignal>();
  for (const signal of signals) {
    const key = normalizeSignalName(signal.name);
    const current = latest.get(key);
    if (!current || signalTime(signal) >= signalTime(current)) latest.set(key, signal);
  }
  return latest;
}

function uniqueExpectedNames(names: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const normalized = normalizeSignalName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(name);
  }
  return unique;
}

function resolveBottleneck(args: {
  failures: VerificationSignal[];
  incomplete: VerificationSignal[];
  missingExpectedNames: string[];
  expectedVerificationNames: string[];
  readiness: GoalfixReadiness;
}): GoalfixBottleneck {
  const { failures, incomplete, missingExpectedNames, expectedVerificationNames, readiness } = args;

  if (failures.length > 0) {
    const signal = failures[0];
    return {
      kind: 'failed_verification',
      statement: `The current limiting constraint is the exact-head verification failure: ${describeSignal(signal)}.`,
      evidenceState: 'VERIFIED',
      smallestSafeRemoval: 'Inspect this failing signal, repair only its verified root cause, rerun the focused proof, and preserve unrelated work.',
      freezesUnrelatedWork: false,
    };
  }

  if (missingExpectedNames.length > 0 || expectedVerificationNames.length === 0) {
    return {
      kind: 'missing_verification',
      statement: expectedVerificationNames.length === 0
        ? 'The current limiting constraint is missing proof definition: no required exact-head verification names were supplied.'
        : `The current limiting constraint is missing exact-head proof: ${missingExpectedNames.join(', ')}.`,
      evidenceState: 'VERIFIED',
      smallestSafeRemoval: 'Acquire only the missing named proof needed for the current claim; do not freeze unrelated capabilities or broaden the mission.',
      freezesUnrelatedWork: false,
    };
  }

  if (incomplete.length > 0) {
    return {
      kind: 'incomplete_verification',
      statement: `The current limiting constraint is unfinished exact-head proof: ${describeSignal(incomplete[0])}.`,
      evidenceState: 'VERIFIED',
      smallestSafeRemoval: 'Finish or reacquire the incomplete proof and continue any unrelated already-authorized work that does not depend on it.',
      freezesUnrelatedWork: false,
    };
  }

  if (readiness === 'ready_for_founder_decision') {
    return {
      kind: 'founder_decision',
      statement: 'No technical proof bottleneck is currently observed; the next limiting gate is an explicit founder decision for the bounded next action.',
      evidenceState: 'VERIFIED',
      smallestSafeRemoval: 'Present the bounded action and current proof for founder approval, then execute only within that approved scope.',
      freezesUnrelatedWork: false,
    };
  }

  return {
    kind: 'unknown',
    statement: 'The current bottleneck cannot yet be isolated from available evidence.',
    evidenceState: 'UNKNOWN',
    smallestSafeRemoval: 'Acquire the cheapest evidence that distinguishes the likely constraints, then remove only the verified limiting cause.',
    freezesUnrelatedWork: false,
  };
}

export function buildGoalfixReport(input: BuildGoalfixReportInput): GoalfixReport {
  const expectedSha = input.target.commitSha.toLowerCase();
  const expectedVerificationNames = uniqueExpectedNames(input.goal.expectedVerificationNames);
  const expectedNameKeys = new Set(expectedVerificationNames.map(normalizeSignalName));
  const exactHeadSignals = input.verificationSignals.filter(
    (signal) => signal.commitSha.toLowerCase() === expectedSha,
  );
  const latestExactHeadSignals = latestSignalsByName(exactHeadSignals);
  const mismatchedSignals = input.verificationSignals.filter(
    (signal) => signal.commitSha.toLowerCase() !== expectedSha,
  );
  const exactHeadSignalsByName = latestExactHeadSignals;

  const missingExpectedNames = expectedVerificationNames.filter(
    (name) => !exactHeadSignalsByName.has(normalizeSignalName(name)),
  );
  const latestSignals = [...latestExactHeadSignals.values()];
  const expectedSignals = latestSignals.filter(
    (signal) => expectedNameKeys.has(normalizeSignalName(signal.name)),
  );
  const failures = latestSignals.filter((signal) => TERMINAL_FAILURES.has(signal.status));
  const incomplete = latestSignals.filter((signal) => INCOMPLETE_SIGNALS.has(signal.status));
  const passed = latestSignals.filter((signal) => signal.status === 'passed');
  const everyExpectedNamePassed = expectedVerificationNames.length > 0
    && missingExpectedNames.length === 0
    && expectedVerificationNames.every((name) => {
      const matching = exactHeadSignalsByName.get(normalizeSignalName(name));
      return matching?.status === 'passed';
    });

  let readiness: GoalfixReadiness = 'waiting_for_evidence';
  if (failures.length > 0) readiness = 'blocked';
  else if (everyExpectedNamePassed && incomplete.length === 0) {
    readiness = 'ready_for_founder_decision';
  }

  const verified = [
    `Resolved ${input.target.name} to immutable commit ${input.target.commitSha}.`,
    ...passed.map(describeSignal),
  ];
  const inferred = [
    'The smallest safe next action should target the verified limiting constraint, not broaden into unrelated repository work.',
  ];
  const unknown: string[] = [];
  const blocked: string[] = failures.map(describeSignal);

  if (expectedVerificationNames.length === 0) {
    unknown.push('No required verification signal names were supplied; decision readiness cannot be established.');
  }
  for (const name of missingExpectedNames) {
    unknown.push(`Missing required exact-head verification signal: ${name}.`);
  }
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

  const proof = [
    `Required exact-head checks: ${expectedVerificationNames.length > 0 ? expectedVerificationNames.join(', ') : 'none supplied'}.`,
    ...(latestSignals.length > 0
      ? latestSignals.map(describeSignal)
      : [`No exact-head provider proof exists yet for ${input.target.commitSha}.`]),
  ];

  const nextGate = readiness === 'blocked'
    ? 'Inspect the first exact-head failed or cancelled signal, repair only its verified root cause, then rerun the focused check.'
    : readiness === 'waiting_for_evidence'
      ? 'Run or finish every named required exact-head verification, retain its logs or artifact, and inspect the result before any mutation that depends on that proof.'
      : 'Founder reviews the complete named proof set and explicitly approves one bounded mutation, or closes the goal with no change.';

  const bottleneck = resolveBottleneck({
    failures,
    incomplete,
    missingExpectedNames,
    expectedVerificationNames,
    readiness,
  });

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
    goal: {
      ...input.goal,
      expectedVerificationNames,
    },
    evidence: { verified, inferred, unknown, blocked },
    bottleneck,
    reality: [
      `The authoritative repository ref is ${input.target.name} at ${input.target.commitSha}.`,
      `${exactHeadSignals.length} exact-head verification signal(s) were inspected against ${expectedVerificationNames.length} required name(s).`,
      `${expectedSignals.length} exact-head signal(s) matched the required proof set.`,
      `Bottleneck: ${bottleneck.statement}`,
      'This inspection performed no repository, provider, deployment, product-data, CRM, or publication mutation. The route may retain one sanitized internal access-audit event.',
    ],
    fix: ['No fix was applied. Goalfix v1 stops at inspection and founder decision authority.'],
    proof,
    risk: [
      'Passing repository checks prove only the checks that actually ran, not production behavior or the founder outcome.',
      'Missing named checks, skipped, running, unknown, or mismatched-head evidence must not be presented as green.',
      'A bottleneck may block the dependent claim or action without freezing unrelated capabilities that already have current authority and proof.',
    ],
    rollback: ['No target-system rollback is required. Revert the Goalfix code change to remove the surface; retain any sanitized audit event as historical evidence.'],
    nextGate,
  };
}