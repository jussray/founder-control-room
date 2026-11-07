import { readFileSync } from 'node:fs';

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

async function main() {
  const sha = process.env.HISTORICAL_SHA;
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!sha || !/^[a-f0-9]{40}$/.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !token) throw new Error('Missing required audit environment');
  const markdown = readFileSync('docs/ci-historical-accountability.md', 'utf8');
  const rows = parseLedger(markdown);
  const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) throw new Error(`GitHub run query failed: ${response.status}`);
  const payload = await response.json();
  if (payload.total_count > 100) throw new Error('Pagination required: fail closed');
  const runs = payload.workflow_runs || [];
  if (!runs.length) throw new Error('No historical runs returned: fail closed');
  const errors = auditLedger(rows, runs, sha);
  for (const error of errors) console.error(error);
  console.log(JSON.stringify({ historicalSha: sha, observedRuns: runs.length, failuresAndCancellations: runs.filter(r => ['failure', 'cancelled'].includes(r.conclusion)).length, errors: errors.length }));
  if (errors.length) process.exitCode = 1;
}
if (process.argv[1]?.endsWith('ci-history-audit.mjs')) main().catch(e => { console.error(e); process.exitCode = 1; });
