#!/usr/bin/env node
// PR hygiene: keep open drafts and PRs from piling up.
//
// Policy (pure, see planPrHygiene):
// - Any PR labelled `keep-open` is never touched.
// - Draft PR idle >= DRAFT_STALE_DAYS and not yet `stale`: label `stale` + comment.
// - Draft PR already `stale` and idle >= DRAFT_STALE_DAYS + DRAFT_CLOSE_DAYS: close.
//   Closing is reversible (reopen); branches are never deleted.
// - Ready-for-review PR idle >= READY_STALE_DAYS and not yet `stale`: label + comment.
//   Ready PRs are never auto-closed; they need a human decision.
//
// "Idle" is measured from the PR's last real (non-merge) commit, falling back to
// created_at. updated_at is not used: automated base-merges ("roll main through
// every open PR") and this job's own labels/comments bump it constantly, so it
// would never show a PR as idle. A new real commit removes the stale label.

export const DRAFT_STALE_DAYS = 21;
export const DRAFT_CLOSE_DAYS = 7;
export const READY_STALE_DAYS = 30;
export const STALE_LABEL = 'stale';
export const KEEP_LABEL = 'keep-open';

const DAY_MS = 24 * 60 * 60 * 1000;

export function planPrHygiene(pulls, now = new Date()) {
  const actions = [];
  for (const pr of pulls) {
    const labels = new Set((pr.labels ?? []).map((label) => label.name));
    if (labels.has(KEEP_LABEL)) continue;
    const idleDays = (now.getTime() - new Date(pr.last_activity_at).getTime()) / DAY_MS;
    if (!Number.isFinite(idleDays)) continue;
    const stale = labels.has(STALE_LABEL);
    const staleAfter = pr.draft ? DRAFT_STALE_DAYS : READY_STALE_DAYS;
    if (stale && idleDays < staleAfter) {
      actions.push({ number: pr.number, action: 'unmark-stale' });
    } else if (pr.draft && stale && idleDays >= DRAFT_STALE_DAYS + DRAFT_CLOSE_DAYS) {
      actions.push({ number: pr.number, action: 'close' });
    } else if (!stale && idleDays >= staleAfter) {
      actions.push({ number: pr.number, action: 'mark-stale' });
    }
  }
  return actions;
}

const MARK_DRAFT = `This draft has had no new commits for ${DRAFT_STALE_DAYS} days (automated merges of main do not count) and is now labelled \`${STALE_LABEL}\`. It will be closed in ${DRAFT_CLOSE_DAYS} days unless it gets a new commit or labelled \`${KEEP_LABEL}\`. Closing is reversible and the branch is kept.`;
const MARK_READY = `This pull request has had no new commits for ${READY_STALE_DAYS} days (automated merges of main do not count) and is now labelled \`${STALE_LABEL}\`. Ready pull requests are never closed automatically: merge it, update it, close it, or label it \`${KEEP_LABEL}\`.`;
const CLOSE_DRAFT = `Closed by PR hygiene: no new commits for ${DRAFT_STALE_DAYS + DRAFT_CLOSE_DAYS} days (automated merges of main do not count). The branch is kept; reopen this pull request to resume.`;

async function github(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

// Latest committer date among non-merge commits; created_at if there are none.
async function lastRealCommitAt(repo, pr) {
  const commits = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await github(`/repos/${repo}/pulls/${pr.number}/commits?per_page=100&page=${page}`);
    commits.push(...batch);
    if (batch.length < 100) break;
  }
  const dates = commits
    .filter((commit) => (commit.parents ?? []).length === 1)
    .map((commit) => Date.parse(commit.commit?.committer?.date ?? ''))
    .filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : pr.created_at;
}

async function listOpenPulls(repo) {
  const pulls = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await github(`/repos/${repo}/pulls?state=open&per_page=100&page=${page}`);
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  return pulls;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const dryRun = process.env.PR_HYGIENE_DRY_RUN !== 'false';
  if (!repo || !process.env.GITHUB_TOKEN) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');

  const pulls = await listOpenPulls(repo);
  for (const pr of pulls) pr.last_activity_at = await lastRealCommitAt(repo, pr);
  const byNumber = new Map(pulls.map((pr) => [pr.number, pr]));
  const plan = planPrHygiene(pulls);
  console.log(`open PRs: ${pulls.length}; planned actions: ${plan.length}; dry run: ${dryRun}`);

  for (const step of plan) {
    const pr = byNumber.get(step.number);
    console.log(`#${step.number} ${step.action} (${pr.draft ? 'draft' : 'ready'}, last real commit ${pr.last_activity_at}) ${pr.title}`);
    if (dryRun) continue;
    if (step.action === 'mark-stale') {
      await github(`/repos/${repo}/issues/${step.number}/labels`, { method: 'POST', body: { labels: [STALE_LABEL] } });
      await github(`/repos/${repo}/issues/${step.number}/comments`, {
        method: 'POST',
        body: { body: pr.draft ? MARK_DRAFT : MARK_READY },
      });
    } else if (step.action === 'unmark-stale') {
      await github(`/repos/${repo}/issues/${step.number}/labels/${STALE_LABEL}`, { method: 'DELETE' });
    } else if (step.action === 'close') {
      await github(`/repos/${repo}/issues/${step.number}/comments`, { method: 'POST', body: { body: CLOSE_DRAFT } });
      await github(`/repos/${repo}/pulls/${step.number}`, { method: 'PATCH', body: { state: 'closed' } });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
