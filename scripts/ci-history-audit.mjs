import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export function parseLedger(markdown) {
  return markdown.split('\n').filter(line => line.startsWith('| `') && line.includes(' (run ')).map(line => {
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    const sha = cells[0].match(/\x60([0-9a-f]{40})\x60/)?.[1];
    const run = cells[1].match(/^(.*?) \(run (\d+)\)$/);
    return { sha, name: run?.[1], runId: Number(run?.[2]), outcome: cells[2], status: cells[6] };
  });
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

export function auditAllCommits(rows, history) {
  const errors = [];
  const report = [];
  for (const { sha, runs } of history) {
    const failures = runs.filter(r => ['failure', 'cancelled'].includes(r.conclusion));
    const commitErrors = auditLedger(rows, runs, sha);
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
  const rows = parseLedger(readFileSync('docs/ci-historical-accountability.md', 'utf8'));
  const commits = await allPages(`/repos/${repo}/pulls/${pr}/commits`, token);
  if (!commits.length) throw new Error('PR commit list empty; fail closed');
  const history = [];
  for (const commit of commits) {
    const sha = commit.sha;
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Malformed PR commit SHA');
    const runs = await allPages(`/repos/${repo}/actions/runs?head_sha=${sha}`, token);
    history.push({ sha, runs: runs.filter(r => r.head_sha === sha) });
  }
  const { report, errors } = auditAllCommits(rows, history);
  const classification = classifyHistoricalCoverage(errors);
  const receipt = {
    contract: 'fcr/historical-ci-observation@v1',
    repository: repo,
    pullRequest: Number(pr),
    recordedAt: new Date().toISOString(),
    status: classification.state,
    evidenceComplete: classification.complete,
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
    unrecorded: classification.unrecorded.length, integrityErrors: classification.integrityErrors.length,
    receipt: 'artifacts/ci-historical-accountability.json',
    evidenceComplete: receipt.evidenceComplete, authorizesMerge: false,
  }, null, 2));
  for (const error of classification.unrecorded) console.warn('UNRECORDED_HISTORICAL_CI ' + error);
  for (const error of classification.integrityErrors) console.error('INVALID_HISTORICAL_EVIDENCE ' + error);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### Historical CI evidence: ' + classification.state + '\n'
      + '- Unrecorded failures/cancellations: ' + classification.unrecorded.length + '\n'
      + '- Invalid/contradicted ledger claims: ' + classification.integrityErrors.length + '\n'
      + '- Full immutable run observation: ci-historical-accountability artifact\n'
      + '- This audit never authorizes merge or deployment.\n');
  }
  if (classification.integrityErrors.length) process.exitCode = 1;
}
if (process.argv[1]?.endsWith('ci-history-audit.mjs')) main().catch(e => { console.error(e); process.exitCode = 1; });
