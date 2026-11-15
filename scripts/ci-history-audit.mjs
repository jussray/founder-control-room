import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export function parseLedger(markdown) {
  return markdown.split('\n').filter(line => line.startsWith('| `') && line.includes(' (run ')).map(line => {
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    const sha = cells[0].match(/\x60([0-9a-f]{40})\x60/)?.[1];
    const run = cells[1].match(/^(.*?) \(run (\d+)\)$/);
    const candidate = cells[4]?.match(/[0-9a-f]{40}/)?.[0];
    return { sha, name: run?.[1], runId: Number(run?.[2]), outcome: cells[2], status: cells[6], candidate };
  });
}

// The ledger declares which main SHA it was reconciled against. When main moves, the binding
// no longer matches and every row must be re-verified; stale rows are never reused.
export function parseLedgerBase(markdown) {
  return markdown.match(/^Base-bound: `([0-9a-f]{40})`/m)?.[1];
}

// This ledger is authored for a specific PR. Other PRs must not compare their
// base or run history to it, but recorded-row structure remains checked.
export function parseLedgerPr(markdown) {
  const match = markdown.match(/^# Historical CI accountability — PR #([1-9]\d*)\s*$/m);
  return match ? Number(match[1]) : null;
}

export function auditRecordedRows(rows) {
  const errors = [];
  const seen = new Set();
  for (const row of rows) {
    const id = String(row.runId);
    if (!/^[0-9a-f]{40}$/.test(row.sha || '') ||
        !Number.isSafeInteger(row.runId) || row.runId <= 0 || !row.name)
      errors.push(`MALFORMED_ENTRY ${id}`);
    if (seen.has(id)) errors.push(`DUPLICATE_RUN ${id}`);
    seen.add(id);
    if (!['failure', 'cancelled'].includes(row.outcome))
      errors.push(`INVALID_OUTCOME ${id}`);
    if (!['OPEN', 'REMEDIATED', 'EXPLAINED-NONDEFECT'].includes(row.status))
      errors.push(`INVALID_STATUS ${id}`);
    if (row.status === 'REMEDIATED' && !/^[0-9a-f]{40}$/.test(row.candidate || ''))
      errors.push(`UNVERIFIED_REMEDIATION missing candidate SHA for run ${id}`);
  }
  return errors;
}

export function auditBase(ledgerBase, liveBase) {
  if (!/^[0-9a-f]{40}$/.test(liveBase || '')) return ['LIVE_BASE_UNKNOWN'];
  if (ledgerBase !== liveBase) return [`STALE_BASE_BINDING ledger=${ledgerBase ?? 'none'} live=${liveBase}`];
  return [];
}

export function auditLedger(rows, runs, expectedSha) {
  const errors = [];
  const seen = new Set();
  for (const row of rows.filter(r => r.sha === expectedSha)) {
    const key = String(row.runId);
    if (!Number.isSafeInteger(row.runId) || row.runId <= 0 || !row.name) errors.push(`MALFORMED_ENTRY ${key}`);
    if (seen.has(key)) errors.push(`DUPLICATE_RUN ${key}`);
    seen.add(key);
  }
  const observed = runs.filter(r => r.head_sha === expectedSha && ['failure', 'cancelled'].includes(r.conclusion));
  for (const run of observed) {
    const entry = rows.find(r => r.sha === expectedSha && r.runId === run.id && r.name === run.name);
    if (!entry) errors.push(`MISSING ${run.name} run ${run.id} (${run.conclusion})`);
    else if (entry.outcome !== run.conclusion) errors.push(`OUTCOME_MISMATCH ${run.id}`);
  }
  for (const row of rows.filter(r => r.sha === expectedSha)) {
    const run = runs.find(r => r.id === row.runId && r.head_sha === expectedSha);
    if (!run) errors.push(`UNVERIFIED_RUN ${row.runId}`);
    else if (run.name !== row.name || run.conclusion !== row.outcome) errors.push(`EVIDENCE_MISMATCH ${row.runId}`);
    if (!['OPEN', 'REMEDIATED', 'EXPLAINED-NONDEFECT'].includes(row.status)) errors.push(`INVALID_STATUS ${row.runId}`);
  }
  return errors;
}

async function githubGet(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`);
  return response.json();
}

async function allPages(path, token) {
  const results = [];
  for (let page = 1; page <= 30; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await githubGet(`${path}${separator}per_page=100&page=${page}`, token);
    const batch = Array.isArray(response) ? response : response.workflow_runs;
    if (!Array.isArray(batch)) throw new Error('Expected GitHub array response');
    results.push(...batch);
    if (batch.length < 100) return results;
  }
  throw new Error('Pagination limit exceeded; fail closed');
}

// history is ordered oldest -> newest. A REMEDIATED row is accepted only when its candidate
// commit comes later in the PR and has a successful run of the same check name.
export function verifyRemediation(row, history, index) {
  if (!row.candidate) return 'UNVERIFIED_REMEDIATION no candidate SHA';
  const successorIndex = history.findIndex((h, i) => i > index && h.sha === row.candidate);
  if (successorIndex < 0) return `UNVERIFIED_REMEDIATION candidate ${row.candidate.slice(0, 12)} is not a later PR commit`;
  const green = history[successorIndex].runs.some(r => r.name === row.name && r.conclusion === 'success');
  return green ? null : `UNVERIFIED_REMEDIATION no successful ${row.name} run on ${row.candidate.slice(0, 12)}`;
}

export function auditAllCommits(rows, history) {
  const errors = [];
  const report = [];
  for (const [index, { sha, runs }] of history.entries()) {
    const failures = runs.filter(r => ['failure', 'cancelled'].includes(r.conclusion));
    let commitErrors = auditLedger(rows, runs, sha);
    // A cancelled run is superseded when a LATER PR commit has a successful run of the same check.
    // Failures are never superseded automatically; they still need a verified REMEDIATED row.
    const supersededIds = runs
      .filter(r => r.conclusion === 'cancelled' && history.slice(index + 1).some(h => h.runs.some(x => x.name === r.name && x.conclusion === 'success')))
      .map(r => r.id);
    commitErrors = commitErrors.filter(e => !supersededIds.some(id => e.includes(`run ${id} (cancelled)`)));
    for (const row of rows.filter(r => r.sha === sha && r.status === 'REMEDIATED')) {
      const problem = verifyRemediation(row, history, index);
      if (problem) commitErrors.push(`${problem} (run ${row.runId})`);
    }
    report.push({ sha, runs: runs.length, failures: failures.filter(r => r.conclusion === 'failure').length,
      cancelled: failures.filter(r => r.conclusion === 'cancelled').length,
      pending: runs.filter(r => r.status !== 'completed').length, errors: commitErrors });
    errors.push(...commitErrors.map(error => `${sha.slice(0, 12)} ${error}`));
  }
  return { report, errors };
}


/**
 * A live GitHub run can become cancelled *after* a newer PR commit triggers this
 * check. Writing the missing row to the source ledger creates yet another
 * cancellation. Keep the gap visible and machine-readable rather than using
 * ever-newer commit history as a self-referential merge blocker.
 *
 * Invalid or contradicted *existing* ledger claims remain blocking. Missing
 * observations are INCOMPLETE, never remediated and never silently green.
 */
export function classifyHistoricalCoverage(errors) {
  const unrecorded = errors.filter(error => /(?:^|\s)MISSING [^\n]+ run [1-9]\d* \((?:failure|cancelled)\)$/.test(error));
  const integrityErrors = errors.filter(error => !unrecorded.includes(error));
  return {
    state: integrityErrors.length ? 'INVALID_EVIDENCE'
      : unrecorded.length ? 'INCOMPLETE_HISTORICAL_COVERAGE' : 'RECONCILED_SNAPSHOT',
    unrecorded,
    integrityErrors,
    complete: !unrecorded.length && !integrityErrors.length,
    authorizesMerge: false,
    authorizesDeployment: false,
  };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const pr = process.env.PR_NUMBER;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !token || !/^[1-9]\d*$/.test(pr || ''))
    throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN and PR_NUMBER required');
  const ledgerText = readFileSync('docs/ci-historical-accountability.md', 'utf8');
  const rows = parseLedger(ledgerText);
  const ledgerPr = parseLedgerPr(ledgerText);
  if (!ledgerPr) throw new Error('LEDGER_OWNER_UNKNOWN; refusing an unscoped audit');
  const inScope = Number(pr) === ledgerPr;
  const rowErrors = auditRecordedRows(rows);
  let report = [];
  let errors = [...rowErrors];
  if (inScope) {
    const pull = await githubGet(`/repos/${repo}/pulls/${pr}`, token);
    errors.push(...auditBase(parseLedgerBase(ledgerText), pull.base?.sha));
    const commits = await allPages(`/repos/${repo}/pulls/${pr}/commits`, token);
    if (!commits.length) throw new Error('PR commit list empty; fail closed');
    const history = [];
    for (const commit of commits) {
      const sha = commit.sha;
      if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Malformed PR commit SHA');
      const runs = await allPages(`/repos/${repo}/actions/runs?head_sha=${sha}`, token);
      history.push({ sha, runs: runs.filter(r => r.head_sha === sha) });
    }
    const observed = auditAllCommits(rows, history);
    report = observed.report;
    errors.push(...observed.errors);
  }
  const classification = classifyHistoricalCoverage(errors);
  const state = !inScope && !classification.integrityErrors.length
    ? 'NOT_APPLICABLE' : classification.state;
  const receipt = {
    contract: 'fcr/historical-ci-observation@v1',
    repository: repo,
    pullRequest: Number(pr),
    ledgerPullRequest: ledgerPr,
    auditScope: inScope ? 'LEDGER_OWNER' : 'OTHER_PR',
    recordedAt: new Date().toISOString(),
    status: state,
    evidenceComplete: inScope && classification.complete,
    authorizesMerge: false,
    authorizesDeployment: false,
    commitObservations: report,
    unrecordedRuns: classification.unrecorded,
    integrityErrors: classification.integrityErrors,
  };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/ci-historical-accountability.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({
    contract: receipt.contract, status: receipt.status, commits: report.length,
    ledgerPullRequest: ledgerPr, auditScope: receipt.auditScope,
    unrecorded: classification.unrecorded.length, integrityErrors: classification.integrityErrors.length,
    receipt: 'artifacts/ci-historical-accountability.json',
    evidenceComplete: receipt.evidenceComplete, authorizesMerge: false,
  }, null, 2));
  for (const error of classification.unrecorded) console.warn('UNRECORDED_HISTORICAL_CI ' + error);
  for (const error of classification.integrityErrors) console.error('INVALID_HISTORICAL_EVIDENCE ' + error);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### Historical CI evidence: ' + state + '\n'
      + '- Ledger owner: PR #' + ledgerPr + '; checked PR: #' + pr + '\n'
      + '- Scope: ' + (inScope ? 'owning PR; live audit' : 'other PR; recorded-row structure only') + '\n'
      + '- Unrecorded failures/cancellations: ' + classification.unrecorded.length + '\n'
      + '- Invalid/contradicted ledger claims: ' + classification.integrityErrors.length + '\n'
      + '- Full immutable run observation: ci-historical-accountability artifact\n'
      + '- This audit never authorizes merge or deployment.\n');
  }
  if (classification.integrityErrors.length) process.exitCode = 1;
}
if (process.argv[1]?.endsWith('ci-history-audit.mjs')) main().catch(e => { console.error(e); process.exitCode = 1; });
