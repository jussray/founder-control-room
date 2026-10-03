#!/usr/bin/env node
// Juss & Co status sync: fills evidence fields in jussray/jussray data/worlds.json from
// live GitHub state of each world's repository. Founder-declared fields are never touched.
// Delivery: with JUSS_AND_CO_SYNC_TOKEN → branch fcr/status-sync + PR on the site repo.
// Without it → receipt-only (JSON printed + written to $SYNC_OUT), nothing delivered.

const API = 'https://api.github.com';
const TARGET = process.env.SYNC_TARGET_REPO || 'jussray/jussray';
const DECLARED = ['name', 'repo', 'st', 'label', 'link', 'held', 'contact'];

export function summarizeChecks(runs) {
  if (!runs || !runs.length) return 'no checks';
  const c = runs.map((r) => r.conclusion || r.status);
  const failing = c.filter((x) => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(x)).length;
  if (failing) return `red (${failing} failing)`;
  if (c.some((x) => ['in_progress', 'queued', 'pending'].includes(x))) return 'running';
  return 'green';
}

export function mergeEvidence(current, evidenceByName, now = new Date()) {
  const next = JSON.parse(JSON.stringify(current));
  let changed = false;
  for (const w of next.worlds) {
    const e = evidenceByName[w.name];
    if (!e) continue;
    const before = JSON.stringify(w.evidence || {});
    w.evidence = { ...(w.evidence || {}), ...e };
    if (JSON.stringify(w.evidence) !== before) changed = true;
    for (const k of Object.keys(w)) if (!DECLARED.includes(k) && k !== 'evidence') delete w[k];
  }
  if (changed) next.generatedAt = now.toISOString();
  return { next, changed };
}

async function gh(path, token, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function observeRepo(fullName, token) {
  const repo = await gh(`/repos/${fullName}`, token);
  const branch = repo.default_branch;
  const head = await gh(`/repos/${fullName}/commits/${branch}`, token);
  const pulls = await gh(`/repos/${fullName}/pulls?state=closed&sort=updated&direction=desc&per_page=30`, token);
  const merged = pulls.find((p) => p.merged_at);
  const checks = await gh(`/repos/${fullName}/commits/${head.sha}/check-runs?per_page=100`, token);
  return {
    mainSha: head.sha,
    mainDate: head.commit.committer.date,
    latestMergedPr: merged ? { number: merged.number, title: merged.title.slice(0, 90), mergedAt: merged.merged_at } : null,
    ci: summarizeChecks(checks.check_runs),
    observedAt: new Date().toISOString(),
  };
}

async function run() {
  const readToken = process.env.GITHUB_TOKEN;
  const syncToken = process.env.JUSS_AND_CO_SYNC_TOKEN || '';
  if (!readToken) { console.error('::error::GITHUB_TOKEN missing'); process.exit(2); }
  const file = await gh(`/repos/${TARGET}/contents/site/data/worlds.json`, readToken);
  const current = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  const evidence = {};
  for (const w of current.worlds) {
    if (!w.repo) continue;
    try { evidence[w.name] = await observeRepo(w.repo, readToken); console.log(`observed ${w.repo}: ${evidence[w.name].mainSha.slice(0, 7)} ${evidence[w.name].ci}`); }
    catch (error) { console.log(`::warning::${w.repo}: ${String(error).slice(0, 200)}`); }
  }
  const { next, changed } = mergeEvidence(current, evidence);
  const body = JSON.stringify(next, null, 2) + '\n';
  if (process.env.SYNC_OUT) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.SYNC_OUT, body); }
  if (!changed) { console.log('no evidence change; nothing to deliver'); return; }
  if (!syncToken) { console.log('::notice::receipt-only: JUSS_AND_CO_SYNC_TOKEN not set, evidence computed but NOT delivered'); console.log(body); return; }
  const target = await gh(`/repos/${TARGET}`, syncToken);
  const base = target.default_branch;
  const baseRef = await gh(`/repos/${TARGET}/git/ref/heads/${base}`, syncToken);
  const branch = 'fcr/status-sync';
  let branchSha = null;
  try { branchSha = (await gh(`/repos/${TARGET}/git/ref/heads/${branch}`, syncToken)).object.sha; }
  catch { await gh(`/repos/${TARGET}/git/refs`, syncToken, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }) }); branchSha = baseRef.object.sha; }
  let existingSha; try { existingSha = (await gh(`/repos/${TARGET}/contents/site/data/worlds.json?ref=${branch}`, syncToken)).sha; } catch { existingSha = undefined; }
  await gh(`/repos/${TARGET}/contents/site/data/worlds.json`, syncToken, { method: 'PUT', body: JSON.stringify({ message: `chore(status): sync world evidence from Founder Control Room (${new Date().toISOString().slice(0, 16)}Z)`, content: Buffer.from(body).toString('base64'), branch, sha: existingSha }) });
  const open = await gh(`/repos/${TARGET}/pulls?state=open&head=${TARGET.split('/')[0]}:${branch}`, syncToken);
  if (!open.length) {
    const pr = await gh(`/repos/${TARGET}/pulls`, syncToken, { method: 'POST', body: JSON.stringify({ title: 'chore(status): sync world evidence from Founder Control Room', head: branch, base, body: 'Evidence fields in `data/worlds.json` refreshed from live GitHub state (main SHA, latest merged PR, CI on main). Founder-declared fields untouched. Opened by the FCR `juss-and-co-status-sync` workflow; merge only on founder approval.' }) });
    console.log(`opened PR ${pr.html_url}`);
  } else console.log(`refreshed open PR ${open[0].html_url}`);
}

import { fileURLToPath } from 'node:url'; import { resolve } from 'node:path';
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) run().catch((e) => { console.error(e); process.exit(1); });
