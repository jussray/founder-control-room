import type {
  CloudflareDesiredState,
  CloudflareReasoningAction,
  CloudflareReasoningInput,
  CloudflareReasoningOutcome,
  CloudflareReasoningReport,
  CloudflareSignal,
  CloudflareSignalKind,
} from './types.js';

const DEFAULT_MAX_EVIDENCE_AGE_MINUTES = 20;
const MAX_EVIDENCE_AGE_MINUTES = 24 * 60;
const AUTH_FAILURE_CODES = new Set(['10000', '9109', '10502']);

function normalizeSha(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function timestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function newest(signals: CloudflareSignal[]): CloudflareSignal | undefined {
  return [...signals].sort((left, right) => {
    const leftTime = timestampMs(left.observedAt) ?? 0;
    const rightTime = timestampMs(right.observedAt) ?? 0;
    return rightTime - leftTime;
  })[0];
}

function latestByKind(
  signals: CloudflareSignal[],
  kind: CloudflareSignalKind,
): CloudflareSignal | undefined {
  return newest(signals.filter((signal) => signal.kind === kind));
}

function latestPagesProof(signals: CloudflareSignal[]): CloudflareSignal | undefined {
  return newest(signals.filter(
    (signal) => signal.kind === 'pages_deployment' || signal.kind === 'release_marker',
  ));
}

function boundedEvidenceAge(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_EVIDENCE_AGE_MINUTES;
  }
  return Math.max(1, Math.min(value, MAX_EVIDENCE_AGE_MINUTES));
}

function commitMatches(signal: CloudflareSignal | undefined, desiredCommit: string | null): boolean {
  if (!signal || !desiredCommit) return false;
  return normalizeSha(signal.commitSha) === desiredCommit;
}

function successful(signal: CloudflareSignal | undefined): boolean {
  return signal?.status === 'success';
}

function pending(signal: CloudflareSignal | undefined): boolean {
  return signal?.status === 'pending';
}

function action(value: CloudflareReasoningAction): CloudflareReasoningAction {
  return value;
}

function desiredSummary(desired: CloudflareDesiredState): string {
  const parts = [
    desired.commitSha ? `commit ${desired.commitSha}` : 'no desired commit recorded',
    desired.workerName ? `Worker ${desired.workerName}` : 'Worker name unknown',
    desired.pagesProject ? `Pages ${desired.pagesProject}` : 'Pages project unknown',
  ];
  return parts.join('; ');
}

export const CLOUDFLARE_REASONING_CONTRACT = Object.freeze({
  id: 'cloudflare-ooda-reasoner',
  version: '1.1.0',
  command: ':cloudflare reason <project>',
  mode: 'read_only_reasoning',
  promise: 'Convert sanitized Cloudflare evidence into a first-principles implementation decision without deploying, changing DNS, rotating secrets, or carrying approval forward.',
  implementationStack: [
    'reality',
    'redteam-premise',
    'lindy',
    'l99',
    'redteam-plan',
    'ooda',
    'bill-gates',
    'elon-musk',
    'proof',
    'rollback',
    'next-gate',
  ],
  automaticActions: ['read evidence', 'classify drift', 'record sanitized reasoning evidence'],
  approvalGates: ['create_branch', 'merge', 'deploy', 'rollback', 'secrets-change', 'dns-change'],
  sensitiveFieldsIncluded: false,
  approvalCarryForward: false,
});

export function reasonAboutCloudflare(input: CloudflareReasoningInput): CloudflareReasoningReport {
  const nowMs = timestampMs(input.now ?? new Date().toISOString()) ?? Date.now();
  const generatedAt = new Date(nowMs).toISOString();
  const maxAgeMinutes = boundedEvidenceAge(input.maxEvidenceAgeMinutes);
  const maxAgeMs = maxAgeMinutes * 60_000;

  const freshSignals: CloudflareSignal[] = [];
  const staleSignals: CloudflareSignal[] = [];

  for (const signal of input.signals) {
    const observedMs = timestampMs(signal.observedAt);
    if (observedMs === null || observedMs > nowMs + 60_000 || nowMs - observedMs > maxAgeMs) {
      staleSignals.push(signal);
    } else {
      freshSignals.push(signal);
    }
  }

  const desiredCommit = normalizeSha(input.desired.commitSha);
  const worker = latestByKind(freshSignals, 'worker_deployment');
  const pages = latestPagesProof(freshSignals);
  const health = latestByKind(freshSignals, 'runtime_health');
  const authFailureSignal = newest(freshSignals.filter(
    (signal) => signal.kind === 'credential'
      && signal.status === 'failure'
      && AUTH_FAILURE_CODES.has(signal.detailCode ?? ''),
  ));

  const authorities = new Set(
    freshSignals
      .map((signal) => signal.authority)
      .filter((value): value is NonNullable<CloudflareSignal['authority']> => Boolean(value)),
  );
  if (input.desired.deploymentAuthority) authorities.add(input.desired.deploymentAuthority);
  authorities.delete('unknown');

  const freshFailures = freshSignals.filter((signal) => signal.status === 'failure');
  const authFailure = Boolean(authFailureSignal);
  const duplicateAuthority = authorities.size > 1;
  const workerMismatch = Boolean(desiredCommit && worker?.commitSha && !commitMatches(worker, desiredCommit));
  const pagesMismatch = Boolean(desiredCommit && pages?.commitSha && !commitMatches(pages, desiredCommit));
  const exactWorker = successful(worker) && commitMatches(worker, desiredCommit);
  const exactPages = successful(pages) && commitMatches(pages, desiredCommit);
  const healthyRuntime = successful(health);

  const missingEvidence: string[] = [];
  if (!desiredCommit) missingEvidence.push('desired_commit');
  if (!worker) missingEvidence.push('worker_deployment');
  if (!pages) missingEvidence.push('pages_deployment_or_release_marker');
  if (!health) missingEvidence.push('runtime_health');

  let outcome: CloudflareReasoningOutcome;
  if (
    freshFailures.length > 0
    || workerMismatch
    || pagesMismatch
    || (authFailure && duplicateAuthority)
  ) {
    outcome = 'blocked';
  } else if (exactWorker && exactPages && healthyRuntime && missingEvidence.length === 0) {
    outcome = 'verified';
  } else if (pending(worker) || pending(pages)) {
    outcome = 'observing';
  } else {
    outcome = 'degraded';
  }

  const confidence = freshSignals.length >= 4 && desiredCommit
    ? 'high'
    : freshSignals.length >= 2
      ? 'medium'
      : 'low';

  const reality: string[] = [
    `Desired state: ${desiredSummary(input.desired)}.`,
    `${freshSignals.length} fresh Cloudflare signal(s) and ${staleSignals.length} stale or invalid signal(s) were evaluated.`,
    worker
      ? `Latest Worker evidence is ${worker.status}${worker.commitSha ? ` at ${worker.commitSha}` : ''}.`
      : 'No fresh Worker deployment evidence exists.',
    pages
      ? `Latest Pages evidence is ${pages.status}${pages.commitSha ? ` at ${pages.commitSha}` : ''}.`
      : 'No fresh Pages deployment or release-marker evidence exists.',
    health
      ? `Latest runtime health evidence is ${health.status}.`
      : 'No fresh runtime health evidence exists.',
  ];

  if (workerMismatch || pagesMismatch) {
    reality.push('The observed deployed commit does not match the desired commit.');
  }
  if (duplicateAuthority) {
    reality.push(`Multiple deployment authorities are visible: ${[...authorities].sort().join(', ')}.`);
  }
  if (authFailure) {
    reality.push(`Cloudflare authentication failure code ${authFailureSignal?.detailCode ?? 'unknown'} is present.`);
  }

  const redteamPremise = [
    'A Cloudflare check badge is not equivalent to a verified production release.',
    'A failed token upload does not prove the application code is broken; it may reveal a duplicate or obsolete deployment path.',
    'A successful build does not prove DNS, routes, bindings, secrets, or runtime health are correct.',
    'Cloudflare must remain an execution and evidence provider, not the owner of founder approvals or durable mission state.',
  ];

  const lindy = [
    'Prefer exact commit identifiers, immutable build evidence, runtime health, and reversible configuration over dashboard memory.',
    'Prefer one documented deployment authority over parallel native-Git and token-upload paths.',
    'Keep credentials in provider secret stores and keep public evidence intentionally non-sensitive.',
    'Treat deploy, DNS, secret rotation, and rollback as separate founder gates.',
  ];

  const redteamPlan = [
    'Do not repair a credential before confirming that credential-based deployment is still the chosen authority.',
    'Do not deploy again merely to clear a stale status; first prove which commit is serving traffic.',
    'Do not change DNS or routes while commit drift, runtime failure, or missing rollback evidence remains unresolved.',
    'Do not let a reasoning report execute production mutations or convert model confidence into authorization.',
  ];

  const actions: CloudflareReasoningAction[] = [];

  actions.push(action({
    id: 'collect-current-cloudflare-evidence',
    summary: 'Refresh sanitized Worker, Pages, runtime-health, route, and release-marker evidence.',
    safeToAutoRun: true,
    requiresFounderApproval: false,
    evidenceRequired: ['provider timestamp', 'resource identifier', 'status', 'commit SHA when applicable'],
  }));

  if (authFailure && duplicateAuthority) {
    actions.push(action({
      id: 'prepare-single-authority-patch',
      summary: 'Prepare a repository change that removes the obsolete deployment path and documents one Cloudflare authority.',
      safeToAutoRun: false,
      requiresFounderApproval: true,
      approvalGate: 'create_branch',
      evidenceRequired: ['current native deployment proof', 'current token-path failure', 'rollback diff'],
      rollback: 'Revert the configuration commit and restore the previous workflow without rotating credentials.',
    }));
  } else if (authFailure) {
    actions.push(action({
      id: 'repair-cloudflare-credential',
      summary: 'Replace or re-scope the Cloudflare credential only after confirming token-based deployment remains required.',
      safeToAutoRun: false,
      requiresFounderApproval: true,
      approvalGate: 'secrets-change',
      evidenceRequired: ['required API permissions', 'target account', 'token verification result'],
      rollback: 'Restore the prior secret version and keep deployment disabled until verification passes.',
    }));
  }

  if (workerMismatch || pagesMismatch) {
    actions.push(action({
      id: 'record-release-drift',
      summary: 'Record the desired-versus-observed commit mismatch and block release claims.',
      safeToAutoRun: true,
      requiresFounderApproval: false,
      evidenceRequired: ['desired commit', 'Worker commit', 'Pages commit or release marker'],
    }));
    actions.push(action({
      id: 'prepare-cloudflare-rollback',
      summary: 'Prepare, but do not execute, a rollback to the last verified Worker and Pages release.',
      safeToAutoRun: false,
      requiresFounderApproval: true,
      approvalGate: 'rollback',
      evidenceRequired: ['last verified commit', 'affected resources', 'post-rollback smoke plan'],
      rollback: 'Cancel the rollback proposal before execution or redeploy the newer verified commit through a separate deploy gate.',
    }));
  }

  if (health?.status === 'failure') {
    actions.push(action({
      id: 'inspect-runtime-bindings',
      summary: 'Inspect runtime logs, routes, compatibility flags, and required bindings before considering another deploy.',
      safeToAutoRun: true,
      requiresFounderApproval: false,
      evidenceRequired: ['runtime error code', 'binding names only', 'route target', 'health response'],
    }));
  }

  if (outcome === 'verified') {
    actions.push(action({
      id: 'record-verified-cloudflare-release',
      summary: 'Persist a sanitized exact-commit release verification in the Control Room evidence ledger.',
      safeToAutoRun: true,
      requiresFounderApproval: false,
      evidenceRequired: ['exact Worker commit', 'exact Pages commit', 'runtime health timestamp'],
    }));
  } else if (missingEvidence.length > 0) {
    actions.push(action({
      id: 'hold-production-claim',
      summary: 'Keep the release unverified until every required evidence category is fresh.',
      safeToAutoRun: true,
      requiresFounderApproval: false,
      evidenceRequired: missingEvidence,
    }));
  }

  const nextAction = actions.find((item) => item.safeToAutoRun)
    ?? actions[0];
  const decision = outcome === 'verified'
    ? 'Record the verified release; no production mutation is justified.'
    : outcome === 'blocked'
      ? 'Freeze production mutation and resolve the highest-confidence drift or failure first.'
      : outcome === 'observing'
        ? 'Wait for the current deployment to reach a terminal state, then refresh evidence.'
        : 'Remain in degraded read-only mode and gather missing evidence.';

  const deletionTarget = duplicateAuthority
    ? 'Delete the obsolete deployment authority from the automatic release path; do not optimize two competing systems.'
    : authFailure && input.desired.deploymentAuthority !== 'token_upload'
      ? 'Delete the assumption that a failing API token must be repaired when token upload is not the chosen authority.'
      : missingEvidence.length > 0
        ? 'Delete release-complete claims that are not backed by fresh exact-commit and runtime evidence.'
        : 'Delete no functioning production path; the current evidence does not justify removal.';

  return {
    version: '1.1.0',
    mode: 'read_only_reasoning',
    projectId: input.projectId,
    generatedAt,
    outcome,
    confidence,
    reality,
    redteamPremise,
    lindy,
    l99: {
      authority: duplicateAuthority
        ? `Conflicting authorities detected: ${[...authorities].sort().join(', ')}.`
        : `Deployment authority: ${[...authorities][0] ?? 'unknown'}.`,
      provenance: freshSignals.length > 0
        ? 'Reasoning is based on timestamped normalized provider evidence; raw provider payloads are excluded.'
        : 'No fresh provider evidence is available; conclusions are intentionally limited.',
      stateContinuity: desiredCommit && exactWorker && exactPages
        ? 'Worker and Pages evidence agree with the desired commit.'
        : 'Desired, built, deployed, and runtime-verified states are not fully aligned.',
      secretBoundary: 'Tokens, service-role keys, secret values, and private project payloads are outside the reasoning contract.',
      rollback: actions.some((item) => item.approvalGate === 'rollback')
        ? 'A rollback may be prepared, but execution requires a separate founder rollback approval.'
        : 'No rollback is currently justified by the available evidence.',
      drift: workerMismatch || pagesMismatch
        ? 'Commit drift is present and release claims must remain blocked.'
        : missingEvidence.length > 0
          ? `Drift cannot be disproved because evidence is missing: ${missingEvidence.join(', ')}.`
          : 'No commit drift is visible in the fresh evidence.',
    },
    redteamPlan,
    billGates: {
      bottleneck: outcome === 'verified'
        ? 'The bottleneck has moved from deployment proof to the next product verification gate.'
        : freshFailures[0]?.kind ?? missingEvidence[0] ?? 'provider evidence freshness',
      leveragePoint: duplicateAuthority
        ? 'Reduce the system to one deployment authority and one evidence contract.'
        : 'Make exact commit and runtime evidence machine-readable and reusable across releases.',
      standardize: 'Use the same desired → built → deployed → healthy → verified state model for every project.',
      doNotScaleYet: 'Do not automate Cloudflare mutations until one project completes deploy, verify, rollback, and recovery drills end to end.',
    },
    elonMusk: {
      questionRequirements: duplicateAuthority
        ? 'Why are two deployment authorities required? Preserve both only if independent evidence proves each is necessary.'
        : 'Which release requirement is directly tied to production truth, and which exists only because a provider workflow once made it convenient?',
      deleteBeforeOptimize: deletionTarget,
      simplify: 'Use one deployment authority, one exact-commit evidence contract, one runtime health proof, and separate approval gates for every mutation.',
      accelerateFeedback: 'Collect sanitized provider state and runtime health in one short observe → reason → verify loop before editing credentials, DNS, or deployment code.',
      automateLast: 'Automate only the evidence refresh and classification loop until repeated deploy, rollback, and recovery drills prove the mutation path is stable.',
    },
    ooda: {
      observe: reality,
      orient: [
        `Current outcome is ${outcome} with ${confidence} confidence.`,
        `Missing evidence: ${missingEvidence.length > 0 ? missingEvidence.join(', ') : 'none'}.`,
        `Fresh failures: ${freshFailures.length}.`,
        `Deployment authorities: ${authorities.size > 0 ? [...authorities].sort().join(', ') : 'unknown'}.`,
      ],
      decide: decision,
      act: nextAction ? [nextAction, ...actions.filter((item) => item.id !== nextAction.id)] : [],
      verify: [
        'Confirm the exact commit independently for Worker and Pages.',
        'Confirm runtime health after deployment, not merely build completion.',
        'Confirm every mutation has its own founder approval and rollback evidence.',
        'Re-run reasoning after new evidence arrives; do not reuse stale conclusions.',
      ],
    },
    freshSignalIds: freshSignals.map((signal) => signal.id),
    staleSignalIds: staleSignals.map((signal) => signal.id),
    missingEvidence,
    sensitiveFieldsIncluded: false,
    approvalCarryForward: false,
  };
}
