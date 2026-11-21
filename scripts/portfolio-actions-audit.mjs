import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RECEIPT = 'artifacts/portfolio-actions-audit/receipt.json';
const MAX_PAGES = 20;
const MAX_HEAD_RUNS = 100;
const STALE_DAYS = 30;
const MAX_NEXT_TASKS = 20;
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
  function propose(subject, observedState, followUp) {
    const [priority, action, instruction] = followUp;
    candidates.push({
      taskFingerprint: hash({ sourceRepository, sourceSha, subject, observedState, action }),
      subject, observedState, priority, action, instruction,
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
    propose({ scope: 'repository', repository, visibility: isPrivate ? 'private' : 'public', head,
      identityScope: isPrivate ? 'run_local_alias' : 'public_exact_head' }, observedState,
    FOLLOW_UP[observedState] || [3, 'RESOLVE_UNKNOWN_AUDIT_STATE', 'Resolve the unknown audit state before reusing the evidence.']);
  }
  if (candidates.length === 0) {
    propose({ scope: 'installation' }, state,
      [7, 'REOBSERVE_CURRENT_HEAD', 'Reobserve current default-branch heads before the next task; Actions observations do not prove production behavior.']);
  }
  candidates.sort((a, b) => a.priority - b.priority || a.taskFingerprint.localeCompare(b.taskFingerprint));
  const nextTasks = candidates.slice(0, MAX_NEXT_TASKS);
  return {
    auditIdentity, nextAction: nextTasks[0], nextTasks,
    omittedNextTaskCount: Math.max(0, candidates.length - nextTasks.length),
    handoffScope: 'default-branch-github-actions-observation-only',
    requiresCurrentHeadRevalidation: true,
  };
}

function assess({ archived, workflowCount, runs, head, headCommittedAt, now, truncated }) {
  if (archived) return 'ARCHIVED';
  if (workflowCount === null) return 'UNKNOWN_WORKFLOW_COVERAGE';
  if (workflowCount === 0) return 'NO_WORKFLOWS';
  if (!head || !/^[a-f0-9]{40}$/.test(head)) return 'UNKNOWN_HEAD';
  const exact = runs.filter((r) => r.head_sha === head);
  if (exact.some((r) => TERMINAL_FAILURES.has(r.conclusion))) return 'FAILED_EXACT_HEAD';
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
const PARALLEL_AUDIT_CONTRACT = 'juss/portfolio-parallel-audit@v1';
const EVIDENCE_RUN_NAME = /(?:^|\b)(?:CI|Playwright|E2E|Security|Quality Gate|Test Ledger|ProofMode)(?:\b|$)/i;
const MAX_ARTIFACT_PROBES = 2;

// A reusable Juss-owned portfolio receipt, not an agent approval or release gate.
// Each evidence plane is evaluated independently; unknown is never promoted to pass.
export function classifyParallelEvidence({ head, runs = [], artifactProbes = [] }) {
  const hasHead = typeof head === 'string' && /^[a-f0-9]{40}$/.test(head);
  const exact = hasHead && Array.isArray(runs) ? runs.filter((run) => run.head_sha === head) : [];
  const artifactReads = artifactProbes.filter((probe) => probe?.head === head);
  const verifiedArtifacts = artifactReads.filter((probe) => probe.status === 'READ');
  const artifactCount = verifiedArtifacts.reduce((sum, probe) => sum + probe.count, 0);
  let artifactState = 'UNKNOWN_NOT_SAMPLED';
  if (verifiedArtifacts.some((probe) => probe.truncated)) artifactState = 'UNKNOWN_TRUNCATED';
  else if (artifactCount > 0) artifactState = 'RETAINED_IN_SAMPLED_RUN';
  else if (artifactReads.some((probe) => probe.status !== 'READ')) artifactState = 'UNKNOWN_READ_BLOCKED';
  else if (verifiedArtifacts.length) artifactState = 'NONE_IN_SAMPLED_RUNS';
  const ciState = !hasHead || !exact.length ? 'UNKNOWN'
    : exact.some((run) => TERMINAL_FAILURES.has(run.conclusion)) ? 'FAILED'
    : exact.some((run) => run.status !== 'completed') ? 'PENDING'
    : exact.some((run) => run.conclusion === 'success') ? 'OBSERVED_SUCCESS' : 'UNKNOWN';
  return {
    contract: PARALLEL_AUDIT_CONTRACT,
    source: hasHead ? 'EXACT_HEAD_OBSERVED' : 'UNKNOWN',
    ci: { state: ciState, exactHeadRunsSampled: exact.length },
    artifacts: { state: artifactState, runsSampled: artifactReads.length,
      retainedArtifactCount: artifactCount },
    prMergeBase: 'UNKNOWN_NOT_OBSERVED',
    deployment: 'UNKNOWN_NOT_OBSERVED',
    productionPlaywright: 'UNKNOWN_NOT_OBSERVED',
    releaseAuthorized: false,
    mutationAuthorized: false,
    note: 'Independent source, CI and artifact observations; no PR, deployed runtime or production-browser claim',
  };
}

function selfTest() {
  const head = 'a'.repeat(40);
  const sampleRun = { id: 10, name: 'Protect Me CI', head_sha: head,
    status: 'completed', conclusion: 'success' };
  const proof = classifyParallelEvidence({ head, runs: [sampleRun],
    artifactProbes: [{ head, status: 'READ', count: 1, truncated: false }] });
  assert.equal(proof.source, 'EXACT_HEAD_OBSERVED');
  assert.equal(proof.ci.state, 'OBSERVED_SUCCESS');
  assert.equal(proof.artifacts.state, 'RETAINED_IN_SAMPLED_RUN');
  assert.equal(proof.deployment, 'UNKNOWN_NOT_OBSERVED');
  assert.equal(proof.prMergeBase, 'UNKNOWN_NOT_OBSERVED');
  assert.equal(proof.productionPlaywright, 'UNKNOWN_NOT_OBSERVED');
  assert.equal(proof.releaseAuthorized, false);
  assert.equal(proof.mutationAuthorized, false);
  assert.equal(classifyParallelEvidence({ head, runs: [sampleRun],
    artifactProbes: [{ head, status: 'READ', count: 0 }] }).artifacts.state, 'NONE_IN_SAMPLED_RUNS');
  assert.equal(classifyParallelEvidence({ head, runs: [sampleRun],
    artifactProbes: [{ head, status: 'UNAVAILABLE' }] }).artifacts.state, 'UNKNOWN_READ_BLOCKED');
  assert.equal(classifyParallelEvidence({ head, runs: [sampleRun],
    artifactProbes: [{ head, status: 'READ', count: 0, truncated: true }] }).artifacts.state, 'UNKNOWN_TRUNCATED');
  assert.equal(classifyParallelEvidence({ head, runs: [sampleRun],
    artifactProbes: [{ head: 'b'.repeat(40), status: 'READ', count: 1 }] }).artifacts.state, 'UNKNOWN_NOT_SAMPLED');
  assert.equal(classifyParallelEvidence({ head: null, runs: [sampleRun] }).ci.state, 'UNKNOWN');
  assert.equal(classifyParallelEvidence({ head, runs: [{ ...sampleRun, head_sha: 'b'.repeat(40) }] }).ci.state, 'UNKNOWN');
  assert.equal(classifyParallelEvidence({ head, runs: [{ ...sampleRun, conclusion: 'failure' }] }).ci.state, 'FAILED');
  assert.ok(EVIDENCE_RUN_NAME.test(sampleRun.name));
  assert.ok(!EVIDENCE_RUN_NAME.test('Repo Reality Evidence'));
  const base = { archived: false, workflowCount: 1, runs: [], head: 'a'.repeat(40),
    headCommittedAt: new Date().toISOString(), now: Date.now(), truncated: false };
  assert.equal(assess(base), 'NO_EXACT_HEAD_ACTION_EVIDENCE');
  assert.equal(assess({ ...base, workflowCount: 0 }), 'NO_WORKFLOWS');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'failure' }] }), 'FAILED_EXACT_HEAD');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'success' }] }), 'OBSERVED_CHECKS_ONLY');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'success' }], truncated: true }), 'INCOMPLETE_EXACT_HEAD_COVERAGE');
  assert.equal(assess({ ...base, archived: true }), 'ARCHIVED');
  assert.equal(assess({ ...base, workflowCount: null }), 'UNKNOWN_WORKFLOW_COVERAGE');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'cancelled' }] }), 'CANCELLED_EXACT_HEAD');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'in_progress', conclusion: null }] }), 'PENDING_EXACT_HEAD');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'success' }],
    headCommittedAt: new Date(base.now - 31 * 86_400_000).toISOString() }), 'STALE_SOURCE_30D');
  assert.equal(assess({ ...base, truncated: true }), 'INCOMPLETE_EXACT_HEAD_COVERAGE');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'skipped' }] }), 'NO_SUCCESSFUL_EXACT_HEAD_RUN');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'neutral' }] }), 'NO_SUCCESSFUL_EXACT_HEAD_RUN');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'weird' }] }), 'UNKNOWN_ACTION_CONCLUSION');
  assert.equal(assess({ ...base, runs: [{ head_sha: base.head, status: 'completed', conclusion: 'success' }], headCommittedAt: '' }), 'UNKNOWN_FRESHNESS');
  assert.equal(assess({ ...base, runs: [{ head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'failure' }] }), 'NO_EXACT_HEAD_ACTION_EVIDENCE');
  const identity = { GITHUB_REPOSITORY: 'jussray/founder-control-room',
    PORTFOLIO_AUDIT_SOURCE_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '1234', GITHUB_RUN_ATTEMPT: '2' };
  const item = { repository: 'jussray/example', visibility: 'public', head: base.head, state: 'FAILED_EXACT_HEAD' };
  const failed = buildAuditHandoff({ state: 'ATTENTION', items: [item] }, identity);
  assert.equal(failed.nextAction.action, 'INSPECT_EXACT_HEAD_FAILURE');
  assert.equal(failed.nextAction.subject.head, base.head);
  assert.equal(failed.auditIdentity.sourceSha, identity.PORTFOLIO_AUDIT_SOURCE_SHA);
  assert.equal(failed.auditIdentity.runUrl, 'https://github.com/jussray/founder-control-room/actions/runs/1234/attempts/2');
  assert.equal(failed.auditIdentity.bindingState, 'ENVIRONMENT_DECLARED');
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
  console.log('Portfolio classification and parallel-evidence self-tests passed; this does NOT verify any external repository');
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
        limitation: 'No production actions or end-user operations are verified by GitHub checks',
        parallelAudit: classifyParallelEvidence({ head: null })
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
        result.sampledExactHeadRuns = matching.length;
        result.sampledFailures = matching.filter((run) => TERMINAL_FAILURES.has(run.conclusion)).length;
        result.state = assess({ archived: r.archived, workflowCount: result.workflowCount,
          runs, head: validHead, headCommittedAt, now,
          truncated: !Number.isInteger(actionResponse.total_count) ||
            actionResponse.total_count > runs.length });
        // Two bounded independent Actions-artifact reads per repository. GitHub
        // cannot prove deployment or PR merge-base from this read-only token.
        const candidates = matching.filter((run) => Number.isSafeInteger(run.id)
          && run.status === 'completed' && EVIDENCE_RUN_NAME.test(run.name || ''))
          .slice(0, MAX_ARTIFACT_PROBES);
        const artifactProbes = await Promise.all(candidates.map(async (run) => {
          try {
            const data = await api('/repos/' + key + '/actions/runs/' + run.id + '/artifacts?per_page=100');
            if (!Array.isArray(data.artifacts) || !Number.isSafeInteger(data.total_count)) {
              return { head: validHead, status: 'UNAVAILABLE' };
            }
            return { head: validHead, status: 'READ', count: data.artifacts.length,
              truncated: data.total_count > data.artifacts.length };
          } catch {
            return { head: validHead, status: 'UNAVAILABLE' };
          }
        }));
        result.parallelAudit = classifyParallelEvidence({ head: validHead, runs, artifactProbes });
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
    parallelAuditContract: PARALLEL_AUDIT_CONTRACT,
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
      'Parallel project evidence lanes inspect sampled exact-head Actions artifacts but not PR merge-base, production runtime or browser proof',
      'No artifact found in sampled runs does not prove the repository requires an artifact or that no other run has one',
      'Private names use per-run pseudonyms; private branch names and head SHAs are omitted'
    ]
  };
  Object.assign(document, buildAuditHandoff(document, process.env));
  document.evidenceFingerprint = hash(document);
  await mkdir('artifacts/portfolio-actions-audit', { recursive: true });
  await writeFile(RECEIPT, JSON.stringify(document, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ state, reason, repositoryCount: accessible, discoveryComplete,
    states: counts, fingerprint: document.evidenceFingerprint }));
  if (state !== 'OBSERVED_CHECKS_ONLY') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
