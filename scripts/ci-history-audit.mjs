import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

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
  const seenShas = new Set();
  for (const { sha, runs } of history) {
    if (!/^[0-9a-f]{40}$/.test(sha) || seenShas.has(sha)) errors.push(`INVALID_OR_DUPLICATE_COMMIT_SHA ${sha}`);
    seenShas.add(sha);
    const failures = runs.filter(r => ['failure', 'cancelled'].includes(r.conclusion));
    const commitErrors = auditLedger(rows, runs, sha);
    const redRuns = failures.map(run => ({ id: run.id, name: run.name, conclusion: run.conclusion,
      ledgerRecorded: rows.some(row => row.sha === sha && row.runId === run.id && row.name === run.name && row.outcome === run.conclusion),
    }));
    const pending = runs.filter(r => r.status !== 'completed' && !r.conclusion).length;
    const otherNonSuccess = runs.some(r => r.status === 'completed' && !['success', 'failure', 'cancelled'].includes(r.conclusion));
    const observation = redRuns.length ? 'RED_OBSERVED' : pending ? 'PENDING_OBSERVED'
      : !runs.length ? 'UNKNOWN_NO_RUNS' : otherNonSuccess ? 'NON_SUCCESS_UNVERIFIED' : 'ALL_OBSERVED_RUNS_SUCCESS';
    report.push({ sha, runs: runs.length, failures: failures.filter(r => r.conclusion === 'failure').length,
      cancelled: failures.filter(r => r.conclusion === 'cancelled').length,
      pending, observation, redRuns, errors: commitErrors });
    errors.push(...commitErrors.map(error => `${sha.slice(0, 12)} ${error}`));
  }
  const current = report.at(-1) ?? null;
  const historical = report.slice(0, -1);
  const summary = {
    scope: 'PR_COMMIT_HISTORY_OBSERVED_WORKFLOW_RUNS_ONLY',
    currentHeadSha: current?.sha ?? null,
    currentHeadObservation: current?.observation ?? 'UNKNOWN_NO_COMMITS',
    historicalRedRuns: historical.flatMap(commit => commit.redRuns.map(run => ({ sha: commit.sha, ...run }))),
    historicalRedCommitCount: historical.filter(commit => commit.redRuns.length).length,
    ledgerErrorCount: errors.length,
    unrecordedHistoricalRuns: historical.flatMap(({ sha, redRuns }) =>
      redRuns.filter(run => !run.ledgerRecorded).map(run => ({ sha, ...run }))),
    manualLedgerComplete: errors.length === 0,
    requiredCheckReadinessProven: false,
    productionReadinessProven: false,
  };
  return { report, errors, summary };
}

// An unlisted failed/cancelled run is always retained in the machine-generated
// receipt. It remains untriaged; only a fabricated, contradictory or unverifiable
// manual claim is an integrity failure of the observation itself.
export function classifyLedgerIntegrity(errors) {
  const untriaged = errors.filter(e => /^[0-9a-f]{12} MISSING /.test(e));
  const invalid = errors.filter(e => !/^[0-9a-f]{12} MISSING /.test(e));
  return { untriaged, invalid };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const pr = process.env.PR_NUMBER;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !token || !/^[1-9]\d*$/.test(pr || ''))
    throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN and PR_NUMBER required');
  const rows = parseLedger(readFileSync('docs/ci-historical-accountability.md', 'utf8'));
  const prBefore = await githubGet(`/repos/${repo}/pulls/${pr}`, token);
  const exactHead = prBefore?.head?.sha;
  const exactBase = prBefore?.base?.sha;
  if (!/^[0-9a-f]{40}$/.test(exactHead || '') || !/^[0-9a-f]{40}$/.test(exactBase || ''))
    throw new Error('PR head/base SHA unavailable; fail closed');
  const liveMainBefore = await githubGet(`/repos/${repo}/branches/main`, token);
  const liveMainSha = liveMainBefore?.commit?.sha;
  if (!/^[0-9a-f]{40}$/.test(liveMainSha || '')) throw new Error('Live main unavailable; fail closed');
  const compare = await githubGet(`/repos/${repo}/compare/${liveMainSha}...${exactHead}`, token);
  if (compare?.merge_base_commit?.sha !== liveMainSha) {
    throw new Error('PR does not contain independently observed live main; fail closed');
  }
  const commits = await allPages(`/repos/${repo}/pulls/${pr}/commits`, token);
  if (!commits.length) throw new Error('PR commit list empty; fail closed');
  if (commits.at(-1)?.sha !== exactHead) throw new Error('PR commits do not match current head; fail closed');
  const history = [];
  for (const commit of commits) {
    const sha = commit.sha;
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Malformed PR commit SHA');
    const runs = await allPages(`/repos/${repo}/actions/runs?head_sha=${sha}`, token);
    history.push({ sha, runs: runs.filter(r => r.head_sha === sha) });
  }
  const prAfter = await githubGet(`/repos/${repo}/pulls/${pr}`, token);
  if (prAfter?.head?.sha !== exactHead || prAfter?.base?.sha !== exactBase)
    throw new Error('PR head/base moved during history audit; fail closed');
  const liveMainAfter = await githubGet(`/repos/${repo}/branches/main`, token);
  if (liveMainAfter?.commit?.sha !== liveMainSha) throw new Error('Live main changed during audit; fail closed');
  const { report, errors, summary } = auditAllCommits(rows, history);
  const { untriaged, invalid } = classifyLedgerIntegrity(errors);
  const receipt = {
    schema: 'juss/ci-history-observation@v1',
    repository: repo,
    pr: Number(pr),
    exactHeadSha: exactHead,
    liveMainSha,
    historicalBaseSha: exactBase,
    auditIntegrity: invalid.length ? 'FAIL' : 'OBSERVED',
    journalCompleteness: untriaged.length ? 'INCOMPLETE_UNTRIAGED' : 'ALL_OBSERVED_RUNS_RECORDED',
    historicalFailuresRemediated: false,
    authorizesMergeOrRelease: false,
    summary, report, untriaged, invalid,
  };
  mkdirSync('artifacts/ci-history-audit', { recursive: true });
  writeFileSync('artifacts/ci-history-audit/receipt.json', JSON.stringify(receipt, null, 2) + '\\n');
  console.log(`FCR_CI_HISTORY_VISIBILITY ${JSON.stringify(summary)}`);
  console.log(JSON.stringify({ pr: Number(pr), commits: report.length,
    exactHeadSha: exactHead, liveMainSha, auditIntegrity: receipt.auditIntegrity,
    journalCompleteness: receipt.journalCompleteness,
    untriagedCount: untriaged.length, invalidCount: invalid.length }, null, 2));
  for (const error of untriaged) console.warn(`UNTRIAGED_HISTORICAL_RUN ${error}`);
  for (const error of invalid) console.error(`INVALID_LEDGER_EVIDENCE ${error}`);
  if (invalid.length) process.exitCode = 1;
}
if (process.argv[1]?.endsWith('ci-history-audit.mjs')) main().catch(e => { console.error(e); process.exitCode = 1; });
