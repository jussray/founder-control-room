import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RECEIPT = 'artifacts/portfolio-actions-audit/receipt.json';
const MAX_PAGES = 20;
const MAX_HEAD_RUNS = 100;
const STALE_DAYS = 30;
const MAX_NEXT_TASKS = 20;
const MAX_JOB_INSPECTIONS = 20;
const MAX_JOBS_PER_ATTEMPT = 100;
const MAX_REPAIR_PLAN_JOBS = 10;
const MAX_HISTORY_BYTES = 2 * 1024 * 1024;
const HISTORY_REPO = 'jussray/founder-control-room';
const TERMINAL_FAILURES = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);
const hash = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

const FOLLOW_UP = Object.freeze({
  FAILED_EXACT_HEAD: [1, 'INSPECT_EXACT_HEAD_FAILURE', 'Read failed jobs and classify the first causal failure before proposing a focused fix.'],
  UNKNOWN_READ_BLOCKED: [2, 'RESTORE_AUDIT_READ_ACCESS', 'Resolve read access through the authorized owner, then repeat the read-only audit.'],
  UNKNOWN_HEAD: [3, 'RESOLVE_CURRENT_HEAD', 'Resolve the current default-branch head before reusing any check evidence.'],
  UNKNOWN_WORKFLOW_COVERAGE: [3, 'RESOLVE_WORKFLOW_COVERAGE', 'Read the workflow inventory before making a coverage claim.'],
  NO_WORKFLOWS: [3, 'REVIEW_WORKFLOW_COVERAGE', 'Review the missing workflow coverage without claiming repository or runtime verification.'],
  INCOMPLETE_EXACT_HEAD_COVERAGE: [3, 'COMPLETE_EXACT_HEAD_COVERAGE', 'Complete the exact-head run observation before making an aggregate check claim.'],
  NO_EXACT_HEAD_ACTION_EVIDENCE: [4, 'COLLECT_EXACT_HEAD_ACTION_EVIDENCE', 'Read current exact-head runs; do not reuse predecessor success.'],
  NO_SUCCESSFUL_EXACT_HEAD_RUN: [4, 'COLLECT_EXECUTED_CHECK_EVIDENCE', 'Determine which applicable checks genuinely executed; skipped checks are not proof.'],
  CANCELLED_EXACT_HEAD: [4, 'REVIEW_CANCELLED_CHECKS', 'Inspect why the exact-head checks were cancelled before proposing a rerun.'],
  UNKNOWN_ACTION_CONCLUSION: [4, 'RESOLVE_ACTION_CONCLUSION', 'Inspect the unknown action conclusion before making a check claim.'],
  PENDING_EXACT_HEAD: [5, 'REOBSERVE_PENDING_EXACT_HEAD', 'Read the pending exact-head runs again after completion.'],
  STALE_SOURCE_30D: [6, 'REVALIDATE_STALE_EVIDENCE', 'Reobserve current source and applicable evidence before reusing historical success.'],
  UNKNOWN_FRESHNESS: [6, 'RESOLVE_EVIDENCE_FRESHNESS', 'Resolve observation freshness before reusing the evidence.'],
});

function latestExactRuns(runs, head) {
  if (!Array.isArray(runs) || !/^[a-f0-9]{40}$/.test(head || '')) return [];
  const latest = new Map();
  for (const run of runs) {
    if (!run || run.head_sha !== head) continue;
    if (!Number.isSafeInteger(run.id) || run.id < 1 ||
        !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
      // Missing identity is not sufficient evidence of a successful current attempt.
      latest.set(Symbol(), { status: 'completed', conclusion: 'unknown' });
      continue;
    }
    const previous = latest.get(run.id);
    if (!previous || run.run_attempt > previous.run_attempt) latest.set(run.id, run);
    else if (run.run_attempt === previous.run_attempt &&
      (run.status !== previous.status || run.conclusion !== previous.conclusion)) latest.set(run.id, {
        id: run.id, run_attempt: run.run_attempt, status: 'unknown', conclusion: null
      });
  }
  return [...latest.values()];
}

function selectFailedRuns(runs, head) {
  return latestExactRuns(runs, head).filter(run => run.status === 'completed' && TERMINAL_FAILURES.has(run.conclusion))
    .map(run => ({ runId: run.id, attempt: run.run_attempt, conclusion: run.conclusion }))
    .sort((a,b) => a.runId - b.runId || a.attempt - b.attempt);
}

const REPAIR_RECIPES = Object.freeze({
  PR_METADATA_REVIEW: ['PR_METADATA', 'Read the exact PR evidence gate and original failure log; supply truthful required sections only.', 'Re-run the evidence gate against the current PR event.'],
  TYPECHECK_REVIEW: ['SOURCE_PATCH', 'Locate the first compiler diagnostic and reproduce with the repository typecheck command.', 'Run typecheck and the affected regression tests.'],
  LINT_REVIEW: ['SOURCE_PATCH', 'Reproduce the exact lint diagnostic and make the smallest rule-compliant change.', 'Run the repository lint command and affected tests.'],
  TEST_REVIEW: ['SOURCE_PATCH', 'Reproduce the first failing assertion or browser flow; distinguish infrastructure from behavior.', 'Run the failing test, then the required regression suite.'],
  DEPENDENCY_SETUP_REVIEW: ['DEPENDENCY_REVIEW', 'Inspect the failing install or setup log and authoritative lockfile and action pins.', 'Run the same clean install and applicable repository checks.'],
  TIMEOUT_REVIEW: ['INFRASTRUCTURE_REVIEW', 'Inspect timeout evidence and distinguish slow code from runner or provider capacity.', 'Reproduce or obtain provider recovery evidence before a bounded retry.'],
  AUTHORITY_REVIEW: ['AUTHORITY_HOLD', 'Identify the missing approval or scoped permission; do not broaden it.', 'Require authorized owner resolution and fresh exact-head evidence.'],
  STARTUP_REVIEW: ['INFRASTRUCTURE_REVIEW', 'Inspect workflow startup evidence before diagnosing source code.', 'Confirm workflow initialization and actual check execution.'],
  UNCLASSIFIED_FAILURE: ['EVIDENCE_REVIEW', 'Inspect the original failed-job log and reproduce the first causal failure.', 'Obtain a scoped regression criterion before proposing a change.'],
});

function buildRepairPlan(diagnostic) {
  const base = { authority: 'proposal_only', mutationAuthorized: false, rootCauseVerified: false,
    requiresCurrentHeadRevalidation: true, requiresIndependentReview: true,
    mergeAuthorized: false, deploymentAuthorized: false };
  if (!diagnostic || diagnostic.state !== 'FAILED_JOB_METADATA_OBSERVED' || !diagnostic.jobs.length) {
    return { ...base, state: 'INSUFFICIENT_JOB_EVIDENCE', steps: [], omittedJobs: 0 };
  }
  const steps = diagnostic.jobs.slice(0, MAX_REPAIR_PLAN_JOBS).map(job => {
    const [kind, investigate, verify] = REPAIR_RECIPES[job.category] || REPAIR_RECIPES.UNCLASSIFIED_FAILURE;
    return { jobId: job.jobId, firstFailedStep: job.firstFailedStep, category: job.category,
      kind, investigate, verify, executionAllowed: false };
  });
  return { ...base, state: steps.some(step => step.kind === 'AUTHORITY_HOLD') ||
    diagnostic.jobs.some(job => job.category === 'AUTHORITY_REVIEW') ? 'AUTHORITY_HOLD' : 'EVIDENCE_REQUIRED',
    steps, omittedJobs: Math.max(0, diagnostic.jobs.length - steps.length) };
}

// Retained audit receipts are observations, never execution claims or locks.
function reconcileRepairHistory(document, prior, binding) {
  const info = { state: 'HISTORY_UNAVAILABLE', matchedTasks: 0, authority: 'observation_only',
    executionLedger: false, mutationAuthorized: false };
  if (!prior || !binding || prior.schema !== 'fcr/portfolio-actions-audit@v1' ||
      prior.auditIdentity?.sourceRepository !== HISTORY_REPO ||
      prior.auditIdentity?.runId !== String(binding.id) ||
      prior.auditIdentity?.runAttempt !== String(binding.run_attempt) ||
      prior.auditIdentity?.sourceSha !== binding.head_sha ||
      document.auditIdentity?.sourceRepository !== HISTORY_REPO ||
      prior.auditIdentity.runId === document.auditIdentity.runId ||
      !Array.isArray(prior.nextTasks) || prior.nextTasks.length > MAX_NEXT_TASKS ||
      !Number.isFinite(Date.parse(prior.observedAt)) ||
      !Number.isFinite(Date.parse(document.observedAt)) ||
      Date.parse(prior.observedAt) >= Date.parse(document.observedAt)) return info;
  const { evidenceFingerprint, ...payload } = prior;
  if (evidenceFingerprint !== hash(payload)) return info;
  info.state = 'PRIOR_RECEIPT_MATCHED';
  info.priorRunId = String(binding.id);
  for (const task of document.nextTasks) {
    if (task.subject?.identityScope !== 'public_exact_head' || !task.subject.failedRun) continue;
    const previous = prior.nextTasks.filter(candidate => candidate?.taskFingerprint === task.taskFingerprint &&
      candidate?.subject?.identityScope === 'public_exact_head' &&
      JSON.stringify(candidate.subject) === JSON.stringify(task.subject) &&
      candidate.action === task.action);
    if (previous.length !== 1) continue;
    const count = previous[0].recurrence?.consecutiveReceiptCount;
    task.recurrence = { state: 'REOBSERVED_IN_PRIOR_RECEIPT',
      consecutiveReceiptCount: Number.isSafeInteger(count) && count >= 2 && count < 10000 ? count + 1 : 2,
      priorAuditRunId: info.priorRunId, executionAuthorized: false };
    info.matchedTasks++;
  }
  return info;
}

// This is a resumable observation proposal, never an execution or approval queue.
// Run identities are sanitized environment declarations, not provider readback.
export function buildAuditHandoff({ state, reason, items = [] }, env = {}) {
  const sourceRepository = env.GITHUB_REPOSITORY === 'jussray/founder-control-room'
    ? env.GITHUB_REPOSITORY : null;
  const sourceSha = /^[a-f0-9]{40}$/.test(env.PORTFOLIO_AUDIT_SOURCE_SHA || '')
    && !/^0{40}$/.test(env.PORTFOLIO_AUDIT_SOURCE_SHA) ? env.PORTFOLIO_AUDIT_SOURCE_SHA : null;
  const runId = /^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID || '') ? env.GITHUB_RUN_ID : null;
  const runAttempt = /^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT || '') ? env.GITHUB_RUN_ATTEMPT : null;
  const auditIdentity = {
    sourceRepository, sourceSha, runId, runAttempt,
    runUrl: sourceRepository && runId && runAttempt
      ? `https://github.com/${sourceRepository}/actions/runs/${runId}/attempts/${runAttempt}` : null,
    bindingState: sourceRepository && sourceSha && runId && runAttempt ? 'ENVIRONMENT_DECLARED' : 'INCOMPLETE',
  };
  const candidates = [];
  function propose(subject, observedState, followUp, diagnostic = null) {
    const [priority, action, instruction] = followUp;
    candidates.push({
      taskFingerprint: hash({ sourceRepository, ...(subject.identityScope === 'public_exact_head' && subject.failedRun ? {} : { sourceSha }), subject, observedState, action }),
      subject, observedState, priority, action, instruction,
      ...(diagnostic ? { diagnostic } : {}),
      ...(subject.failedRun ? { repairPlan: buildRepairPlan(diagnostic) } : {}),
      owner: action === 'RESTORE_AUDIT_READ_ACCESS' ? 'AUTHORIZED_ACCESS_OWNER' : 'REPOSITORY_OPERATOR',
      authority: 'proposal_only', mutationAuthorized: false,
      requiresCurrentHeadRevalidation: true,
    });
  }
  if (state === 'BLOCKED') {
    const accessBlocked = /^(PORTFOLIO_INSTALLATION_READ_TOKEN_REQUIRED|GITHUB_READ_STATUS_(401|403))$/.test(reason || '');
    propose({ scope: 'installation' }, 'BLOCKED', accessBlocked
      ? [0, 'RESTORE_AUDIT_READ_ACCESS', 'Restore the approved read-only audit connection without exposing or inventing credentials, then rerun the audit.']
      : [0, 'INSPECT_BLOCKED_AUDIT', 'Inspect the bound workflow failure and restore a complete read-only audit receipt.']);
  } else if (state === 'INCOMPLETE_COVERAGE') {
    propose({ scope: 'installation' }, state,
      [0, 'RECONCILE_INSTALLATION_COVERAGE', 'Reconcile the installation repository inventory before claiming portfolio coverage.']);
  }
  for (const item of items) {
    if (item.archived || item.state === 'ARCHIVED' || item.state === 'OBSERVED_CHECKS_ONLY') continue;
    const isPrivate = item.visibility === 'private';
    const repository = isPrivate
      ? (/^private-[a-f0-9]{12}$/.test(item.repository || '') ? item.repository : null)
      : (/^[-\w.]+\/[-\w.]+$/.test(item.repository || '') ? item.repository : null);
    const head = !isPrivate && /^[a-f0-9]{40}$/.test(item.head || '') ? item.head : null;
    const observedState = Object.hasOwn(FOLLOW_UP, item.state) ? item.state : 'UNKNOWN';
    const subject = { scope: 'repository', repository, visibility: isPrivate ? 'private' : 'public', head,
      identityScope: isPrivate ? 'run_local_alias' : 'public_exact_head' };
    // Public run routing is evidence only; never export private run IDs or log contents.
    const failedRuns = !isPrivate && repository && head && observedState === 'FAILED_EXACT_HEAD'
      && Array.isArray(item.failedRuns) ? item.failedRuns : [];
    const distinct = new Map();
    for (const run of failedRuns) {
      if (!run || !Number.isSafeInteger(run.runId) || run.runId < 1 ||
          !Number.isSafeInteger(run.attempt) || run.attempt < 1 || !TERMINAL_FAILURES.has(run.conclusion)) continue;
      distinct.set(run.runId + ':' + run.attempt, { runId: run.runId, attempt: run.attempt, conclusion: run.conclusion });
    }
    if (distinct.size) {
      for (const failedRun of distinct.values()) {
        const matchingDiagnostics = Array.isArray(item.failureDiagnostics) ? item.failureDiagnostics.filter(d =>
          d?.runId === failedRun.runId && d.attempt === failedRun.attempt) : [];
        const candidate = matchingDiagnostics.length === 1 ? matchingDiagnostics[0] : null;
        // Only copy the closed enum and validated numeric metadata; never forward arbitrary strings.
        const allowedStates = ['FAILED_JOB_METADATA_OBSERVED', 'NO_FAILED_JOB_METADATA', 'INCOMPLETE_JOB_EVIDENCE',
          'JOB_EVIDENCE_READ_BLOCKED', 'DEFERRED_JOB_INSPECTION_BUDGET'];
        const categories = ['UNCLASSIFIED_FAILURE', 'TIMEOUT_REVIEW', 'AUTHORITY_REVIEW', 'STARTUP_REVIEW',
          'PR_METADATA_REVIEW', 'TYPECHECK_REVIEW', 'LINT_REVIEW', 'TEST_REVIEW', 'DEPENDENCY_SETUP_REVIEW'];
        const diagnostic = candidate && allowedStates.includes(candidate.state) ? {
          state: candidate.state,
          jobs: Array.isArray(candidate.jobs) ? candidate.jobs.slice(0, MAX_JOBS_PER_ATTEMPT)
            .filter(j => j && Number.isSafeInteger(j.jobId) && j.jobId > 0 && TERMINAL_FAILURES.has(j.conclusion) && categories.includes(j.category))
            .map(j => ({ jobId: j.jobId, conclusion: j.conclusion, category: j.category,
              firstFailedStep: Number.isSafeInteger(j.firstFailedStep) && j.firstFailedStep > 0 ? j.firstFailedStep : null })) : [],
        } : null;
        propose({ ...subject, failedRun }, observedState,
          [1, 'INSPECT_EXACT_HEAD_FAILURE', 'Revalidate head, run and attempt; inspect failed job logs before proposing a root-cause repair.'], diagnostic);
      }
    } else {
      propose(subject, observedState,
        FOLLOW_UP[observedState] || [3, 'RESOLVE_UNKNOWN_AUDIT_STATE', 'Resolve the unknown audit state before reusing the evidence.']);
    }
  }
  if (candidates.length === 0) {
    propose({ scope: 'installation' }, state,
      [7, 'REOBSERVE_CURRENT_HEAD', 'Reobserve current default-branch heads before the next task; Actions observations do not prove production behavior.']);
  }
  candidates.sort((a, b) => a.priority - b.priority || a.taskFingerprint.localeCompare(b.taskFingerprint));
  const distinctCandidates = [...new Map(candidates.map(candidate => [candidate.taskFingerprint, candidate])).values()];
  const nextTasks = distinctCandidates.slice(0, MAX_NEXT_TASKS);
  return {
    auditIdentity, nextAction: nextTasks[0], nextTasks,
    omittedNextTaskCount: Math.max(0, distinctCandidates.length - nextTasks.length),
    duplicateProposalsOmitted: candidates.length - distinctCandidates.length,
    handoffScope: 'default-branch-github-actions-observation-only',
    requiresCurrentHeadRevalidation: true,
  };
}

function assess({ archived, workflowCount, runs, head, headCommittedAt, now, truncated }) {
  if (archived) return 'ARCHIVED';
  if (workflowCount === null) return 'UNKNOWN_WORKFLOW_COVERAGE';
  if (workflowCount === 0) return 'NO_WORKFLOWS';
  if (!head || !/^[a-f0-9]{40}$/.test(head)) return 'UNKNOWN_HEAD';
  const exact = latestExactRuns(runs, head);
  if (exact.some((r) => r.status === 'completed' && TERMINAL_FAILURES.has(r.conclusion))) return 'FAILED_EXACT_HEAD';
  if (exact.some((r) => r.status !== 'completed')) return 'PENDING_EXACT_HEAD';
  if (exact.some((r) => r.conclusion === 'cancelled')) return 'CANCELLED_EXACT_HEAD';
  if (truncated) return 'INCOMPLETE_EXACT_HEAD_COVERAGE';
  if (exact.length === 0) return 'NO_EXACT_HEAD_ACTION_EVIDENCE';
  if (exact.some((r) => !['success', 'skipped', 'neutral'].includes(r.conclusion))) {
    return 'UNKNOWN_ACTION_CONCLUSION';
  }
  if (!exact.some((r) => r.conclusion === 'success')) return 'NO_SUCCESSFUL_EXACT_HEAD_RUN';
  const age = (now - Date.parse(headCommittedAt || '')) / 86_400_000;
  if (!Number.isFinite(age) || age < 0) return 'UNKNOWN_FRESHNESS';
  if (age > STALE_DAYS) return 'STALE_SOURCE_30D';
  return 'OBSERVED_CHECKS_ONLY';
}
// Only fixed categories and numeric IDs leave this classifier. Job names, step
// names and logs are untrusted evidence, not instructions or artifact content.
function summarizeFailedJobs(payload, expectedHead, failure) {
  const result = { runId: failure.runId, attempt: failure.attempt, state: 'INCOMPLETE_JOB_EVIDENCE', jobs: [] };
  if (!payload || !Array.isArray(payload.jobs) || !Number.isSafeInteger(payload.total_count)
      || payload.total_count !== payload.jobs.length || payload.jobs.length > MAX_JOBS_PER_ATTEMPT) return result;
  const ids = new Set();
  for (const job of payload.jobs) {
    if (!job || job.head_sha !== expectedHead || job.run_id !== failure.runId || (job.run_attempt != null && job.run_attempt !== failure.attempt) ||
        !Number.isSafeInteger(job.id) || job.id < 1 || ids.has(job.id) || job.status !== 'completed') return result;
    ids.add(job.id);
  }
  const jobs = payload.jobs.filter(job => TERMINAL_FAILURES.has(job.conclusion));
  result.jobs = jobs.map(job => {
    const failedSteps = Array.isArray(job.steps) ? job.steps.filter(step => step && step.status === 'completed' &&
      TERMINAL_FAILURES.has(step.conclusion) && Number.isSafeInteger(step.number) && step.number > 0) : [];
    const step = failedSteps.sort((a,b) => a.number - b.number)[0];
    const name = typeof step?.name === 'string' ? step.name.slice(0, 200) : '';
    let category = 'UNCLASSIFIED_FAILURE';
    if (job.conclusion === 'timed_out') category = 'TIMEOUT_REVIEW';
    else if (job.conclusion === 'action_required') category = 'AUTHORITY_REVIEW';
    else if (job.conclusion === 'startup_failure') category = 'STARTUP_REVIEW';
    else if (/structured PR evidence fields/i.test(name)) category = 'PR_METADATA_REVIEW';
    else if (/type.?check|typescript|\btsc\b/i.test(name)) category = 'TYPECHECK_REVIEW';
    else if (/\blint\b|eslint/i.test(name)) category = 'LINT_REVIEW';
    else if (/\btest\b|playwright|vitest|pytest/i.test(name)) category = 'TEST_REVIEW';
    else if (/install dependencies|npm ci|setup node|setup python/i.test(name)) category = 'DEPENDENCY_SETUP_REVIEW';
    return { jobId: job.id, conclusion: job.conclusion, firstFailedStep: step?.number ?? null, category };
  }).sort((a,b) => a.jobId - b.jobId);
  result.state = jobs.length ? 'FAILED_JOB_METADATA_OBSERVED' : 'NO_FAILED_JOB_METADATA';
  return result;
}

function selfTest() {
  const base = { archived: false, workflowCount: 1, runs: [], head: 'a'.repeat(40),
    headCommittedAt: new Date().toISOString(), now: Date.now(), truncated: false };
  assert.equal(assess(base), 'NO_EXACT_HEAD_ACTION_EVIDENCE');
  assert.equal(assess({ ...base, workflowCount: 0 }), 'NO_WORKFLOWS');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'failure' }] }), 'FAILED_EXACT_HEAD');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'success' }] }), 'OBSERVED_CHECKS_ONLY');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'success' }], truncated: true }), 'INCOMPLETE_EXACT_HEAD_COVERAGE');
  assert.equal(assess({ ...base, archived: true }), 'ARCHIVED');
  assert.equal(assess({ ...base, workflowCount: null }), 'UNKNOWN_WORKFLOW_COVERAGE');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'cancelled' }] }), 'CANCELLED_EXACT_HEAD');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'in_progress', conclusion: null }] }), 'PENDING_EXACT_HEAD');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'success' }],
    headCommittedAt: new Date(base.now - 31 * 86_400_000).toISOString() }), 'STALE_SOURCE_30D');
  assert.equal(assess({ ...base, truncated: true }), 'INCOMPLETE_EXACT_HEAD_COVERAGE');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'skipped' }] }), 'NO_SUCCESSFUL_EXACT_HEAD_RUN');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'neutral' }] }), 'NO_SUCCESSFUL_EXACT_HEAD_RUN');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'weird' }] }), 'UNKNOWN_ACTION_CONCLUSION');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, id: 1, run_attempt: 1, status: 'completed', conclusion: 'success' }], headCommittedAt: '' }), 'UNKNOWN_FRESHNESS');
  assert.equal(assess({ ...base, runs: [{ head_sha: 'b'.repeat(40), id: 1, run_attempt: 1, status: 'completed', conclusion: 'failure' }] }), 'NO_EXACT_HEAD_ACTION_EVIDENCE');
  const identity = { GITHUB_REPOSITORY: 'jussray/founder-control-room',
    PORTFOLIO_AUDIT_SOURCE_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '2' };
  const item = { repository: 'jussray/example', visibility: 'public', head: base.head, state: 'FAILED_EXACT_HEAD' };
  const failed = buildAuditHandoff({ state: 'ATTENTION', items: [item] }, identity);
  assert.equal(failed.nextAction.action, 'INSPECT_EXACT_HEAD_FAILURE');
  assert.equal(failed.nextAction.subject.head, base.head);
  assert.equal(failed.auditIdentity.sourceSha, identity.PORTFOLIO_AUDIT_SOURCE_SHA);
  assert.equal(failed.auditIdentity.runUrl, 'https://github.com/jussray/founder-control-room/actions/runs/1234/attempts/2');
  assert.equal(failed.auditIdentity.bindingState, 'ENVIRONMENT_DECLARED');
  const failedRun = { head_sha: base.head, id: 123, run_attempt: 1, status: 'completed', conclusion: 'failure' };
  const completedRetry = { ...failedRun, run_attempt: 2, conclusion: 'success' };
  assert.equal(assess({ ...base, runs: [failedRun, completedRetry] }), 'OBSERVED_CHECKS_ONLY');
  assert.equal(assess({ ...base, runs: [failedRun, { ...completedRetry, status: 'in_progress', conclusion: null }] }), 'PENDING_EXACT_HEAD');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'success' }] }), 'UNKNOWN_ACTION_CONCLUSION');
  const failure = { runId: 123, attempt: 1, conclusion: 'failure' };
  const job = { id: 99, run_id: 123, run_attempt: 1, head_sha: base.head, status: 'completed', conclusion: 'failure',
    steps: [{ number: 4, status: 'completed', conclusion: 'failure', name: 'Require structured PR evidence fields' },
      { number: 6, status: 'completed', conclusion: 'failure', name: 'untrusted secret-looking text' }] };
  const diagnostic = summarizeFailedJobs({ total_count: 1, jobs: [job] }, base.head, failure);
  assert.deepEqual(diagnostic.jobs, [{ jobId: 99, conclusion: 'failure', firstFailedStep: 4, category: 'PR_METADATA_REVIEW' }]);
  assert.equal(diagnostic.state, 'FAILED_JOB_METADATA_OBSERVED');
  const { run_attempt: omittedAttempt, ...documentedJobShape } = job;
  assert.deepEqual(summarizeFailedJobs({ total_count: 1, jobs: [documentedJobShape] }, base.head, failure), diagnostic);
  assert.equal(JSON.stringify(diagnostic).includes('untrusted'), false);
  assert.equal(summarizeFailedJobs({ total_count: 2, jobs: [job] }, base.head, failure).state, 'INCOMPLETE_JOB_EVIDENCE');
  assert.equal(summarizeFailedJobs({ total_count: 1, jobs: [{ ...job, run_attempt: 2 }] }, base.head, failure).state, 'INCOMPLETE_JOB_EVIDENCE');
  assert.equal(summarizeFailedJobs({ total_count: 2, jobs: [job, job] }, base.head, failure).state, 'INCOMPLETE_JOB_EVIDENCE');
  assert.equal(summarizeFailedJobs({ total_count: 1, jobs: [{ ...job, head_sha: 'b'.repeat(40) }] }, base.head, failure).state, 'INCOMPLETE_JOB_EVIDENCE');
  assert.equal(summarizeFailedJobs({ total_count: 0, jobs: [] }, base.head, failure).state, 'NO_FAILED_JOB_METADATA');
  const routedRuns = selectFailedRuns([failedRun, failedRun, { ...failedRun, id: 456 }], base.head);
  assert.deepEqual(routedRuns, [
    { runId: 123, attempt: 1, conclusion: 'failure' },
    { runId: 456, attempt: 1, conclusion: 'failure' }
  ]);
  assert.deepEqual(selectFailedRuns([failedRun, { ...failedRun, run_attempt: 2, conclusion: 'success' }], base.head), []);
  assert.deepEqual(selectFailedRuns([failedRun, { ...failedRun, run_attempt: 2, status: 'in_progress', conclusion: null }], base.head), []);
  assert.deepEqual(selectFailedRuns([failedRun, { ...failedRun, conclusion: 'success' }], base.head), []);
  assert.deepEqual(selectFailedRuns([{ ...failedRun, head_sha: 'c'.repeat(40) }, { ...failedRun, id: 0 }], base.head), []);
  const routed = buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, failedRuns: routedRuns }] }, identity);
  assert.equal(routed.nextTasks.length, 2);
  assert.equal(routed.nextTasks[0].subject.failedRun.attempt, 1);
  assert.notEqual(routed.nextTasks[0].taskFingerprint, routed.nextTasks[1].taskFingerprint);
  assert.deepEqual(routed.nextTasks, buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, failedRuns: routedRuns }] },
    { ...identity, PORTFOLIO_AUDIT_SOURCE_SHA: 'd'.repeat(40) }).nextTasks);
  assert.equal(buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, visibility: 'private',
    repository: 'private-' + 'a'.repeat(12), failedRuns: routedRuns }] }, identity).nextAction.subject.failedRun, undefined);
  const routedWithDiagnosis = buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item,
    failedRuns: [failure], failureDiagnostics: [{ ...diagnostic, jobs: [{ ...diagnostic.jobs[0], raw: 'private log' }] }] }] }, identity);
  assert.equal(routedWithDiagnosis.nextAction.diagnostic.jobs[0].category, 'PR_METADATA_REVIEW');
  assert.equal(routedWithDiagnosis.nextAction.repairPlan.state, 'EVIDENCE_REQUIRED');
  assert.equal(routedWithDiagnosis.nextAction.repairPlan.steps[0].kind, 'PR_METADATA');
  assert.equal(routedWithDiagnosis.nextAction.repairPlan.rootCauseVerified, false);
  assert.equal(routedWithDiagnosis.nextAction.repairPlan.steps[0].executionAllowed, false);
  assert.equal(buildRepairPlan(null).state, 'INSUFFICIENT_JOB_EVIDENCE');
  const authorityJob = { ...diagnostic.jobs[0], category: 'AUTHORITY_REVIEW' };
  const manyJobs = Array.from({ length: 11 }, (_, i) => ({ ...diagnostic.jobs[0], jobId: i + 1 }));
  const held = buildRepairPlan({ state: 'FAILED_JOB_METADATA_OBSERVED', jobs: [...manyJobs, authorityJob] });
  assert.equal(held.state, 'AUTHORITY_HOLD');
  assert.equal(held.steps.length, MAX_REPAIR_PLAN_JOBS);
  assert.equal(held.omittedJobs, 2);
  assert.equal(held.mergeAuthorized, false);
  assert.equal(held.deploymentAuthorized, false);
  for (const category of Object.keys(REPAIR_RECIPES)) {
    const plan = buildRepairPlan({ state: 'FAILED_JOB_METADATA_OBSERVED', jobs: [{ ...diagnostic.jobs[0], category }] });
    assert.equal(plan.steps[0].category, category);
    assert.equal(plan.mutationAuthorized, false);
    assert.equal(plan.steps[0].executionAllowed, false);
  }
  assert.equal(JSON.stringify(routedWithDiagnosis).includes('private log'), false);
  assert.equal(routedWithDiagnosis.nextAction.taskFingerprint,
    routed.nextTasks.find(task => task.subject.failedRun.runId === failure.runId).taskFingerprint);
  const historyRun = { id: 1234, run_attempt: 2, head_sha: identity.PORTFOLIO_AUDIT_SOURCE_SHA };
  const earlier = { schema: 'fcr/portfolio-actions-audit@v1', observedAt: '2026-01-01T00:00:00Z',
    ...routedWithDiagnosis };
  earlier.evidenceFingerprint = hash(earlier);
  const current = () => ({ observedAt: '2026-01-02T00:00:00Z',
    ...buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, failedRuns: [failure] }] },
      { ...identity, GITHUB_RUN_ID: '5678' }) });
  const next = current();
  assert.equal(reconcileRepairHistory(next, earlier, historyRun).matchedTasks, 1);
  assert.equal(next.nextTasks[0].recurrence.consecutiveReceiptCount, 2);
  assert.equal(next.nextTasks[0].recurrence.executionAuthorized, false);
  assert.equal(next.nextTasks.length, 1);
  assert.equal(reconcileRepairHistory(current(), { ...earlier, observedAt: '2025-12-31T00:00:00Z' }, historyRun).state, 'HISTORY_UNAVAILABLE');
  assert.equal(reconcileRepairHistory(current(), earlier, { ...historyRun, run_attempt: 3 }).state, 'HISTORY_UNAVAILABLE');
  assert.equal(reconcileRepairHistory(current(), null, historyRun).state, 'HISTORY_UNAVAILABLE');
  const pending = buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, state: 'PENDING_EXACT_HEAD' }] }, identity);
  assert.equal(pending.nextAction.action, 'REOBSERVE_PENDING_EXACT_HEAD');
  const incomplete = buildAuditHandoff({ state: 'INCOMPLETE_COVERAGE', items: [item] }, identity);
  assert.equal(incomplete.nextAction.action, 'RECONCILE_INSTALLATION_COVERAGE');
  assert.equal(incomplete.nextTasks[1].action, 'INSPECT_EXACT_HEAD_FAILURE');
  const noChecks = buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, state: 'NO_EXACT_HEAD_ACTION_EVIDENCE' }] }, identity);
  assert.equal(noChecks.nextAction.action, 'COLLECT_EXACT_HEAD_ACTION_EVIDENCE');
  const blocked = buildAuditHandoff({ state: 'BLOCKED', reason: 'PORTFOLIO_INSTALLATION_READ_TOKEN_REQUIRED' }, identity);
  assert.equal(blocked.nextAction.action, 'RESTORE_AUDIT_READ_ACCESS');
  assert.equal(blocked.nextAction.owner, 'AUTHORIZED_ACCESS_OWNER');
  const fallback = buildAuditHandoff({ state: 'BLOCKED', reason: 'AUDIT_DID_NOT_PRODUCE_RECEIPT' }, identity);
  assert.equal(fallback.nextAction.action, 'INSPECT_BLOCKED_AUDIT');
  const observed = buildAuditHandoff({ state: 'OBSERVED_CHECKS_ONLY', items: [{ ...item, state: 'OBSERVED_CHECKS_ONLY' }] }, identity);
  assert.equal(observed.nextAction.action, 'REOBSERVE_CURRENT_HEAD');
  assert.equal(observed.handoffScope, 'default-branch-github-actions-observation-only');
  const repeat = buildAuditHandoff({ state: 'ATTENTION', items: [item], observedAt: 'tomorrow' }, { ...identity, GITHUB_RUN_ID: '5678' });
  assert.equal(repeat.nextAction.taskFingerprint, failed.nextAction.taskFingerprint);
  assert.notEqual(buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, head: 'c'.repeat(40) }] }, identity)
    .nextAction.taskFingerprint, failed.nextAction.taskFingerprint);
  assert.notEqual(buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, state: 'PENDING_EXACT_HEAD' }] }, identity)
    .nextAction.taskFingerprint, failed.nextAction.taskFingerprint);
  const privateHandoff = buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item,
    visibility: 'private', repository: 'private-' + 'a'.repeat(12) }] }, identity);
  assert.equal(privateHandoff.nextAction.subject.head, null);
  assert.equal(privateHandoff.nextAction.subject.identityScope, 'run_local_alias');
  const unsafe = buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item,
    visibility: 'private', repository: 'private-owner/secret-name' }] },
  { GITHUB_REPOSITORY: 'https://attacker.invalid', PORTFOLIO_AUDIT_SOURCE_SHA: 'main', GITHUB_RUN_ID: '../token' });
  assert.equal(unsafe.auditIdentity.sourceSha, null);
  assert.equal(unsafe.auditIdentity.runUrl, null);
  assert.equal(unsafe.auditIdentity.bindingState, 'INCOMPLETE');
  assert.equal(JSON.stringify(unsafe).includes('secret-name'), false);
  const many = buildAuditHandoff({ state: 'ATTENTION', items: Array.from({ length: 25 }, (_, i) => ({ ...item, repository: 'jussray/repo-' + i })) }, identity);
  assert.equal(many.nextTasks.length, MAX_NEXT_TASKS);
  assert.equal(many.omittedNextTaskCount, 5);
  const duplicateItems = buildAuditHandoff({ state: 'ATTENTION', items: [item, item] }, identity);
  assert.equal(duplicateItems.nextTasks.length, 1);
  assert.equal(duplicateItems.duplicateProposalsOmitted, 1);
  const ordered = buildAuditHandoff({ state: 'ATTENTION', items: [item, { ...item, repository: 'jussray/z' }] }, identity);
  const reversed = buildAuditHandoff({ state: 'ATTENTION', items: [{ ...item, repository: 'jussray/z' }, item] }, identity);
  assert.deepEqual(ordered.nextTasks, reversed.nextTasks);
  for (const handoff of [failed, pending, incomplete, noChecks, blocked, fallback, observed, many, unsafe]) {
    assert.equal(handoff.requiresCurrentHeadRevalidation, true);
    for (const task of handoff.nextTasks) {
      assert.equal(task.authority, 'proposal_only');
      assert.equal(task.mutationAuthorized, false);
      assert.equal(task.requiresCurrentHeadRevalidation, true);
    }
  }
  const workflow = readFileSync(new URL('../.github/workflows/portfolio-actions-audit.yml', import.meta.url), 'utf8');
  const observeJob = workflow.slice(workflow.indexOf('\n  observe:'));
  const observeCondition = observeJob.match(/\n    if: >-\n([\s\S]*?)(?=\n    needs:)/)?.[1].replace(/\s+/g, ' ').trim();
  assert.equal(observeCondition, "github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'schedule' || github.event_name == 'workflow_dispatch')",
    'credential-bearing observation must allow only trusted-main push, schedule, and dispatch events');
  const trustAt = observeJob.indexOf('- name: Verify trusted main immediately before token mint');
  const mintAt = observeJob.indexOf('- name: Mint read-only portfolio installation token');
  assert.ok(trustAt > 0 && mintAt > trustAt, 'trusted-main verification must precede the credential-bearing step');
  const trustStep = observeJob.slice(trustAt, mintAt);
  assert.match(trustStep, /git fetch --no-tags --depth=1 origin refs\/heads\/main:refs\/remotes\/origin\/main/);
  assert.match(trustStep, /test "\$actual" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(trustStep, /current_main="\$\(git rev-parse refs\/remotes\/origin\/main\)"/);
  assert.match(trustStep, /test "\$current_main" = "\$actual"/);
  assert.equal(trustStep.slice(trustStep.indexOf('\n')).includes('\n      - '), false,
    'no intervening action may separate trusted-main verification from credential minting');
  assert.match(trustStep, /set -euo pipefail/);
  console.log('Portfolio classification and failed-job routing assertions passed; this does NOT verify any external repository');
  console.log('PORTFOLIO_HANDOFF_REGRESSION_PASSED');
}

async function main() {
  if (process.argv.includes('--self-test')) { selfTest(); return; }
  const token = process.env.PORTFOLIO_AUDIT_TOKEN || '';
  const expectedMinimum = Number(process.env.PORTFOLIO_EXPECTED_MIN_REPOSITORIES || '46');
  const observedAt = new Date().toISOString();
  const privateAliasKey = randomBytes(32);
  const privateName = (name) => 'private-' + createHmac('sha256', privateAliasKey).update(name).digest('hex').slice(0, 12);
  let state = 'BLOCKED';
  let reason = '';
  let items = [];
  let accessible = 0;
  let discoveryComplete = false;
  let priorReceipt = null;
  let priorBinding = null;
  try {
    // A failed prerequisite uses the same writer without making any API call.
    if (process.argv.includes('--blocked-receipt')) throw new Error('AUDIT_DID_NOT_PRODUCE_RECEIPT');
    if (!token) throw new Error('PORTFOLIO_INSTALLATION_READ_TOKEN_REQUIRED');
    if (!Number.isInteger(expectedMinimum) || expectedMinimum < 1 || expectedMinimum > 2000) throw new Error('INVALID_EXPECTED_MINIMUM');
    const root = 'https://api.github.com';
    async function api(path) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(root + path, {
          signal: controller.signal,
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'fcr-portfolio-actions-truth'
          }
        });
        if (!response.ok) throw new Error('GITHUB_READ_STATUS_' + response.status);
        return await response.json();
      } finally { clearTimeout(timer); }
    }
    // Read one prior trusted-main audit artifact with the same read-only token.
    // Failure to retrieve history must never hide current failures or imply novelty.
    if (process.env.GITHUB_REPOSITORY === HISTORY_REPO && /^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID || '')) {
      let historyDir;
      try {
        const response = await api('/repos/' + HISTORY_REPO +
          '/actions/workflows/portfolio-actions-audit.yml/runs?branch=main&status=completed&per_page=10');
        const eligible = (Array.isArray(response.workflow_runs) ? response.workflow_runs : []).filter(run =>
          Number.isSafeInteger(run.id) && run.id > 0 && String(run.id) !== process.env.GITHUB_RUN_ID &&
          Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 && run.head_branch === 'main' &&
          run.status === 'completed' && ['push', 'schedule', 'workflow_dispatch'].includes(run.event) &&
          run.repository?.full_name === HISTORY_REPO && run.head_repository?.full_name === HISTORY_REPO &&
          /^[a-f0-9]{40}$/.test(run.head_sha || '') && Number.isFinite(Date.parse(run.created_at)));
        eligible.sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
        const prior = eligible[0];
        if (prior) {
          const name = 'portfolio-actions-audit-' + prior.id;
          const metadata = await api('/repos/' + HISTORY_REPO + '/actions/runs/' + prior.id + '/artifacts?per_page=100');
          const artifacts = (Array.isArray(metadata.artifacts) ? metadata.artifacts : []).filter(artifact =>
            artifact.name === name && artifact.expired === false && Number.isSafeInteger(artifact.size_in_bytes) &&
            artifact.size_in_bytes > 0 && artifact.size_in_bytes <= MAX_HISTORY_BYTES);
          if (artifacts.length === 1) {
            historyDir = await mkdtemp(join(tmpdir(), 'fcr-audit-history-'));
            execFileSync('gh', ['run', 'download', String(prior.id), '--repo', HISTORY_REPO, '--name', name, '--dir', historyDir],
              { env: { ...process.env, GH_TOKEN: token, GH_PROMPT_DISABLED: '1' }, timeout: 30000, stdio: 'ignore' });
            const file = join(historyDir, 'receipt.json');
            const size = (await stat(file)).size;
            if (size > 0 && size <= MAX_HISTORY_BYTES) {
              priorReceipt = JSON.parse(readFileSync(file, 'utf8'));
              priorBinding = prior;
            }
          }
        }
      } catch {
        // No raw provider errors or credentials are exported.
      } finally {
        if (historyDir) await rm(historyDir, { recursive: true, force: true }).catch(() => {});
      }
    }
    const repos = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await api('/installation/repositories?per_page=100&page=' + page);
      if (!Array.isArray(data.repositories)) throw new Error('INVALID_INSTALLATION_REPOSITORY_LIST');
      repos.push(...data.repositories);
      if (data.repositories.length < 100) { discoveryComplete = true; break; }
    }
    accessible = repos.length;
    if (!discoveryComplete) throw new Error('INSTALLATION_REPOSITORY_PAGINATION_INCOMPLETE');
    const now = Date.now();
    async function observe(r) {
      const fullName = String(r.full_name || '');
      const repository = r.private ? privateName(fullName) : fullName;
      const result = {
        repository,
        visibility: r.private ? 'private' : 'public',
        archived: Boolean(r.archived),
        defaultBranch: r.private ? null : (r.default_branch || null),
        head: null,
        workflowCount: null,
        sampledExactHeadRuns: 0,
        sampledFailures: 0,
        state: 'UNKNOWN',
        limitation: 'No production actions or end-user operations are verified by GitHub checks'
      };
      if (result.archived) {
        result.state = 'ARCHIVED';
        return result;
      }
      try {
        if (!/^[-\w.]+\/[-\w.]+$/.test(fullName)) throw new Error('INVALID_REPO_NAME');
        const key = fullName.split('/').map(encodeURIComponent).join('/');
        const branch = String(r.default_branch || 'main');
        const [headResponse, workflowResponse] = await Promise.all([
          api('/repos/' + key + '/branches/' + encodeURIComponent(branch)),
          api('/repos/' + key + '/actions/workflows?per_page=1')
        ]);
        const head = headResponse.commit?.sha;
        const validHead = typeof head === 'string' && /^[a-f0-9]{40}$/.test(head) ? head : null;
        const headCommittedAt = headResponse.commit?.commit?.committer?.date || null;
        // Query exact-head runs rather than sampling unrelated branch activity.
        const actionResponse = validHead
          ? await api('/repos/' + key + '/actions/runs?per_page=' + MAX_HEAD_RUNS +
            '&branch=' + encodeURIComponent(branch) + '&head_sha=' + encodeURIComponent(validHead))
          : { workflow_runs: [], total_count: 0 };
        result.head = r.private ? null : validHead;
        result.workflowCount = Number.isInteger(workflowResponse.total_count) ? workflowResponse.total_count : null;
        if (!Array.isArray(actionResponse.workflow_runs)) throw new Error('INVALID_ACTION_RUN_LIST');
        const runs = actionResponse.workflow_runs;
        const matching = runs.filter((run) => run.head_sha === head);
        const effective = latestExactRuns(matching, validHead);
        result.sampledExactHeadRuns = effective.length;
        result.sampledFailures = effective.filter((run) => run.status === 'completed' && TERMINAL_FAILURES.has(run.conclusion)).length;
        if (!r.private) result.failedRuns = selectFailedRuns(matching, validHead);
        result.state = assess({ archived: r.archived, workflowCount: result.workflowCount,
          runs, head: validHead, headCommittedAt, now,
          truncated: !Number.isInteger(actionResponse.total_count) ||
            actionResponse.total_count > runs.length });
      } catch (error) {
        result.state = 'UNKNOWN_READ_BLOCKED';
        result.blocker = error instanceof Error && /^GITHUB_READ_STATUS_\d+$/.test(error.message)
          ? error.message : 'READ_OR_VALIDATION_UNAVAILABLE';
      }
      return result;
    }
    for (let i = 0; i < repos.length; i += 6) {
      items.push(...await Promise.all(repos.slice(i, i + 6).map(observe)));
    }
    items.sort((a, b) => a.repository.localeCompare(b.repository));
    // Deterministic bounded public diagnosis; do not export private job identities.
    const queue = items.filter(item => item.visibility === 'public' && item.state === 'FAILED_EXACT_HEAD')
      .flatMap(item => (item.failedRuns || []).map(failure => ({ item, failure })));
    for (let i = 0; i < queue.length; i++) {
      const { item, failure } = queue[i];
      let diagnostic = { runId: failure.runId, attempt: failure.attempt, state: 'DEFERRED_JOB_INSPECTION_BUDGET', jobs: [] };
      if (i < MAX_JOB_INSPECTIONS) {
        try {
          const key = item.repository.split('/').map(encodeURIComponent).join('/');
          const payload = await api('/repos/' + key + '/actions/runs/' + failure.runId +
            '/attempts/' + failure.attempt + '/jobs?per_page=' + MAX_JOBS_PER_ATTEMPT);
          diagnostic = summarizeFailedJobs(payload, item.head, failure);
        } catch {
          diagnostic.state = 'JOB_EVIDENCE_READ_BLOCKED';
        }
      }
      (item.failureDiagnostics ??= []).push(diagnostic);
    }
    const nonArchived = items.filter((r) => !r.archived);
    const needsAttention = nonArchived.filter((r) => r.state !== 'OBSERVED_CHECKS_ONLY');
    state = accessible < expectedMinimum ? 'INCOMPLETE_COVERAGE'
      : needsAttention.length > 0 ? 'ATTENTION' : 'OBSERVED_CHECKS_ONLY';
    reason = accessible < expectedMinimum ? 'INSTALLATION_ACCESS_BELOW_ACCOUNT_INVENTORY' : '';
  } catch (error) {
    reason = error instanceof Error && /^(AUDIT_DID_NOT_PRODUCE_RECEIPT$|PORTFOLIO_|INVALID_|INSTALLATION_|GITHUB_READ_STATUS_)/.test(error.message)
      ? error.message : 'PORTFOLIO_AUDIT_UNAVAILABLE';
  }
  const counts = Object.fromEntries([...new Set(items.map((i) => i.state))].sort().map((s) => [
    s, items.filter((r) => r.state === s).length
  ]));
  const document = {
    schema: 'fcr/portfolio-actions-audit@v1',
    observedAt,
    subject: 'GitHub App installation repositories only',
    expectedMinimum,
    installationRepositories: accessible,
    discoveryComplete,
    state,
    reason: reason || null,
    states: counts,
    items,
    mutationAuthorized: false,
    operationVerified: false,
    productionVerified: false,
    limitations: [
      'Accessible installation repositories can be fewer than the authenticated user portfolio',
      'Only the first 100 exact-head runs are inspected; missing pagination or counts is incomplete',
      'Freshness is based on the default-branch head commit date, not other branch pushes',
      'Passing checks are NOT proof of successful deployed actions',
      'At most 20 public failed attempts receive job metadata triage; categories are hypotheses, not root-cause proof; logs are not exported',
      'Private names use per-run pseudonyms; private branch names and head SHAs are omitted',
      'Recurrence is limited to the previous retained trusted-main receipt and does not suppress unresolved failures or reserve execution'
    ]
  };
  Object.assign(document, buildAuditHandoff(document, process.env));
  document.repairHistory = reconcileRepairHistory(document, priorReceipt, priorBinding);
  document.evidenceFingerprint = hash(document);
  await mkdir('artifacts/portfolio-actions-audit', { recursive: true });
  await writeFile(RECEIPT, JSON.stringify(document, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ state, reason, repositoryCount: accessible, discoveryComplete,
    states: counts, fingerprint: document.evidenceFingerprint }));
  if (state !== 'OBSERVED_CHECKS_ONLY') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
