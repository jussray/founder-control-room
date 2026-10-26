import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const RECEIPT = 'artifacts/portfolio-actions-audit/receipt.json';
const MAX_PAGES = 20;
const MAX_HEAD_RUNS = 100;
const STALE_DAYS = 30;
const TERMINAL_FAILURES = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);
const hash = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

function assess({ archived, workflowCount, runs, head, headCommittedAt, now, truncated }) {
  if (archived) return 'ARCHIVED';
  if (workflowCount === null) return 'UNKNOWN_WORKFLOW_COVERAGE';
  if (workflowCount === 0) return 'NO_WORKFLOWS';
  if (!head || !/^[a-f0-9]{40}$/.test(head)) return 'UNKNOWN_HEAD';
  const exact = runs.filter((r) => r.head_sha === head);
  if (exact.some((r) => TERMINAL_FAILURES.has(r.conclusion))) return 'FAILED_EXACT_HEAD';
  if (exact.some((r) => r.status !== 'completed')) return 'PENDING_EXACT_HEAD';
  if (exact.some((r) => r.conclusion === 'cancelled')) return 'CANCELLED_EXACT_HEAD';
  if (exact.length === 0) return 'NO_EXACT_HEAD_ACTION_EVIDENCE';
  if (truncated) return 'INCOMPLETE_EXACT_HEAD_COVERAGE';
  if (exact.some((r) => !['success', 'skipped', 'neutral'].includes(r.conclusion))) {
    return 'UNKNOWN_ACTION_CONCLUSION';
  }
  const age = (now - Date.parse(headCommittedAt || '')) / 86_400_000;
  if (!Number.isFinite(age) || age < 0) return 'UNKNOWN_FRESHNESS';
  if (age > STALE_DAYS) return 'STALE_SOURCE_30D';
  return 'OBSERVED_CHECKS_ONLY';
}
function selfTest() {
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
  console.log('Portfolio classification regression: 10 assertions passed; this does NOT verify any external repository');
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
        defaultBranch: r.default_branch || null,
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
        const [headResponse, workflowResponse, actionResponse] = await Promise.all([
          api('/repos/' + key + '/branches/' + encodeURIComponent(branch)),
          api('/repos/' + key + '/actions/workflows?per_page=1'),
          api('/repos/' + key + '/actions/runs?per_page=' + MAX_HEAD_RUNS + '&branch=' + encodeURIComponent(branch))
        ]);
        const head = headResponse.commit?.sha;
        const headCommittedAt = headResponse.commit?.commit?.committer?.date || null;
        result.head = typeof head === 'string' && /^[a-f0-9]{40}$/.test(head) ? head : null;
        result.workflowCount = Number.isInteger(workflowResponse.total_count) ? workflowResponse.total_count : null;
        const runs = Array.isArray(actionResponse.workflow_runs) ? actionResponse.workflow_runs : [];
        const matching = runs.filter((run) => run.head_sha === head);
        result.sampledExactHeadRuns = matching.length;
        result.sampledFailures = matching.filter((run) => TERMINAL_FAILURES.has(run.conclusion)).length;
        result.state = assess({ archived: r.archived, workflowCount: result.workflowCount,
          runs, head: result.head, headCommittedAt, now,
          truncated: Number(actionResponse.total_count || 0) > MAX_HEAD_RUNS });
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
    reason = error instanceof Error && /^(PORTFOLIO_|INVALID_|INSTALLATION_|GITHUB_READ_STATUS_)/.test(error.message)
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
      'Latest 100 branch workflow runs are sampled and may omit older exact-head runs',
      'Freshness is based on the default-branch head commit date, not other branch pushes',
      'Passing checks are NOT proof of successful deployed actions',
      'Private repository names are per-run pseudonyms, not published names'
    ]
  };
  document.evidenceFingerprint = hash(document);
  await mkdir('artifacts/portfolio-actions-audit', { recursive: true });
  await writeFile(RECEIPT, JSON.stringify(document, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ state, reason, repositoryCount: accessible, discoveryComplete,
    states: counts, fingerprint: document.evidenceFingerprint }));
  if (state !== 'OBSERVED_CHECKS_ONLY') process.exitCode = 1;
}
await main();