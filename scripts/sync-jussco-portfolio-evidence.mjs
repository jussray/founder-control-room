import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const CONTRACT = 'juss/fcr-portfolio-evidence@v1';
const DEFAULT_TARGET = 'jussray/jussray';
const DEFAULT_BRANCH = 'main';
const MAX_STABLE_AGE_MS = 24 * 60 * 60 * 1000;
const HARD_FAILURES = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure']);
const PASSING_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);

class GitHubHttpError extends Error {
  constructor(status, path, body) {
    super(`GitHub ${status} for ${path}`);
    this.name = 'GitHubHttpError';
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function parseRepository(value) {
  const parts = String(value || '').split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`INVALID_REPOSITORY:${value}`);
  return { owner: parts[0], repo: parts[1], fullName: `${parts[0]}/${parts[1]}` };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function semanticEvidence(value) {
  if (!value || typeof value !== 'object') return value;
  const { observedAt: _observedAt, ...rest } = value;
  return stable(rest);
}

function evidenceEqual(a, b) {
  return JSON.stringify(semanticEvidence(a)) === JSON.stringify(semanticEvidence(b));
}

function evidenceIsFresh(evidence, nowMs) {
  const observed = Date.parse(evidence?.observedAt || '');
  return Number.isFinite(observed) && nowMs - observed < MAX_STABLE_AGE_MS;
}

function summarizeChecks(checkRuns) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  if (!runs.length) {
    return { state: 'unknown', total: 0, completed: 0, passing: 0, failing: 0, pending: 0, ci: 'UNKNOWN · no exact-head checks observed' };
  }
  let completed = 0;
  let passing = 0;
  let failing = 0;
  let pending = 0;
  for (const run of runs) {
    if (run?.status !== 'completed') {
      pending += 1;
      continue;
    }
    completed += 1;
    if (HARD_FAILURES.has(run?.conclusion)) failing += 1;
    else if (PASSING_CONCLUSIONS.has(run?.conclusion)) passing += 1;
  }
  if (failing > 0) return { state: 'failed', total: runs.length, completed, passing, failing, pending, ci: `FAIL · ${failing}/${runs.length} exact-head checks` };
  if (pending > 0) return { state: 'pending', total: runs.length, completed, passing, failing, pending, ci: `PENDING · ${pending}/${runs.length} exact-head checks` };
  if (passing === runs.length) return { state: 'passed', total: runs.length, completed, passing, failing, pending, ci: `PASS · ${runs.length} exact-head checks` };
  return { state: 'unknown', total: runs.length, completed, passing, failing, pending, ci: 'UNKNOWN · exact-head check conclusions incomplete' };
}

function repositoryEvidence(observation, observedAt) {
  if (!observation || observation.status === 'unavailable') {
    return {
      contract: CONTRACT,
      observedAt,
      authority: 'observation-only',
      source: 'founder-control-room',
      status: 'unknown',
      repository: observation?.repository || null,
      reason: observation?.reason || 'PROVIDER_READ_UNAVAILABLE',
    };
  }
  const evidence = {
    contract: CONTRACT,
    observedAt,
    authority: 'observation-only',
    source: 'founder-control-room',
    status: 'observed',
    repository: observation.repository,
    visibility: observation.visibility,
    defaultBranch: observation.defaultBranch,
    archived: Boolean(observation.archived),
    headSha: observation.headSha,
    headDate: observation.headDate,
    checks: observation.checks,
    ci: observation.checks.ci,
  };
  if (observation.defaultBranch === 'main') {
    evidence.mainSha = observation.headSha;
    evidence.mainDate = observation.headDate;
  }
  if (observation.latestMergedPr) evidence.latestMergedPr = observation.latestMergedPr;
  return evidence;
}

function nonGithubEvidence(entry, observedAt) {
  const builder = entry?.builder || {};
  return {
    contract: CONTRACT,
    observedAt,
    authority: 'observation-only',
    source: 'founder-control-room',
    status: 'unknown',
    provider: builder.provider || 'unknown',
    carrierId: builder.appId || builder.projectId || null,
    reason: 'NO_AUTHORIZED_GITHUB_SOURCE_FOR_THIS_PRODUCT',
  };
}

function stripMutableEvidence(registry) {
  const copy = structuredClone(registry);
  delete copy.generatedAt;
  if (Array.isArray(copy.worlds)) for (const item of copy.worlds) delete item.evidence;
  if (Array.isArray(copy.systems)) for (const item of copy.systems) delete item.evidence;
  return stable(copy);
}

export function applyEvidence({ worldsRegistry, systemsRegistry, observations, now }) {
  const observedAt = now.toISOString();
  const nowMs = now.getTime();
  const worldsBefore = structuredClone(worldsRegistry);
  const systemsBefore = structuredClone(systemsRegistry);
  const worlds = structuredClone(worldsRegistry);
  const systems = structuredClone(systemsRegistry);
  const changedWorlds = [];
  const changedSystems = [];

  for (const world of worlds.worlds || []) {
    const repository = world.repo || (world.carriers || []).find((c) => c?.platform === 'github' && c?.role?.includes('canonical'))?.ref;
    const candidate = repository
      ? repositoryEvidence(observations.get(repository) || { status: 'unavailable', repository, reason: 'REPOSITORY_NOT_OBSERVED' }, observedAt)
      : nonGithubEvidence(world, observedAt);
    if (!evidenceEqual(world.evidence, candidate) || !evidenceIsFresh(world.evidence, nowMs)) {
      world.evidence = candidate;
      changedWorlds.push(world.name);
    }
  }

  for (const system of systems.systems || []) {
    if (system.public === false || system.kind !== 'standalone_os') continue;
    const repository = system.repo?.name;
    const candidate = repository
      ? repositoryEvidence(observations.get(repository) || { status: 'unavailable', repository, reason: 'REPOSITORY_NOT_OBSERVED' }, observedAt)
      : nonGithubEvidence(system, observedAt);
    if (!evidenceEqual(system.evidence, candidate) || !evidenceIsFresh(system.evidence, nowMs)) {
      system.evidence = candidate;
      changedSystems.push(system.name);
    }
  }

  if (changedWorlds.length) worlds.generatedAt = observedAt;
  if (changedSystems.length) systems.generatedAt = observedAt;

  assert.deepEqual(stripMutableEvidence(worlds), stripMutableEvidence(worldsBefore), 'world sync crossed the evidence-only boundary');
  assert.deepEqual(stripMutableEvidence(systems), stripMutableEvidence(systemsBefore), 'system sync crossed the evidence-only boundary');

  return { worlds, systems, changedWorlds, changedSystems, observedAt };
}

async function githubRequest(token, path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'founder-control-room-portfolio-evidence-sync',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  if (!response.ok) throw new GitHubHttpError(response.status, path, parsed);
  return parsed;
}

async function optionalProviderRead(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof GitHubHttpError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

async function observeRepository(token, repository) {
  const { owner, repo } = parseRepository(repository);
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  let metadata;
  try {
    metadata = await githubRequest(token, root);
  } catch (error) {
    if (error instanceof GitHubHttpError && (error.status === 403 || error.status === 404)) {
      return { status: 'unavailable', repository, reason: error.status === 404 ? 'REPOSITORY_NOT_INSTALLED_OR_NOT_FOUND' : 'REPOSITORY_READ_FORBIDDEN' };
    }
    throw error;
  }

  const defaultBranch = metadata.default_branch;
  const commit = await githubRequest(token, `${root}/commits/${encodeURIComponent(defaultBranch)}`);
  const headSha = commit.sha;
  const headDate = commit.commit?.committer?.date || commit.commit?.author?.date || metadata.pushed_at || null;

  const pulls = await optionalProviderRead(() => githubRequest(token, `${root}/pulls?state=closed&sort=updated&direction=desc&per_page=30`));
  const latestMerged = Array.isArray(pulls) ? pulls.find((pull) => pull?.merged_at) : null;
  const latestMergedPr = latestMerged ? {
    number: latestMerged.number,
    title: String(latestMerged.title || '').slice(0, 180),
    mergedAt: latestMerged.merged_at,
    mergeCommitSha: latestMerged.merge_commit_sha || null,
  } : null;

  const checksResponse = await optionalProviderRead(() => githubRequest(token, `${root}/commits/${encodeURIComponent(headSha)}/check-runs?per_page=100`));
  const checks = checksResponse
    ? summarizeChecks(checksResponse.check_runs)
    : { state: 'unavailable', total: 0, completed: 0, passing: 0, failing: 0, pending: 0, ci: 'UNKNOWN · exact-head check read unavailable' };

  return {
    status: 'observed',
    repository,
    visibility: metadata.visibility || (metadata.private ? 'private' : 'public'),
    archived: Boolean(metadata.archived),
    defaultBranch,
    headSha,
    headDate,
    latestMergedPr,
    checks,
  };
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= values.length) return;
      results[current] = await mapper(values[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function decodeContent(file) {
  return Buffer.from(String(file.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
}

async function readTargetState(token, targetRepository, branch) {
  const { owner, repo } = parseRepository(targetRepository);
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const ref = await githubRequest(token, `${root}/git/ref/heads/${encodeURIComponent(branch)}`);
  const headSha = ref.object.sha;
  const commit = await githubRequest(token, `${root}/git/commits/${encodeURIComponent(headSha)}`);
  const [worldsFile, systemsFile] = await Promise.all([
    githubRequest(token, `${root}/contents/site/data/worlds.json?ref=${encodeURIComponent(headSha)}`),
    githubRequest(token, `${root}/contents/site/data/systems.json?ref=${encodeURIComponent(headSha)}`),
  ]);
  return {
    root,
    headSha,
    treeSha: commit.tree.sha,
    worlds: JSON.parse(decodeContent(worldsFile)),
    systems: JSON.parse(decodeContent(systemsFile)),
  };
}

async function publishAtomicRegistryCommit(token, target, branch, beforeHead, baseTreeSha, worlds, systems) {
  const currentRef = await githubRequest(token, `${target.root}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (currentRef.object.sha !== beforeHead) throw new Error(`STALE_TARGET_HEAD:${beforeHead}:${currentRef.object.sha}`);

  const [worldBlob, systemBlob] = await Promise.all([
    githubRequest(token, `${target.root}/git/blobs`, { method: 'POST', body: { content: `${JSON.stringify(worlds, null, 2)}\n`, encoding: 'utf-8' } }),
    githubRequest(token, `${target.root}/git/blobs`, { method: 'POST', body: { content: `${JSON.stringify(systems, null, 2)}\n`, encoding: 'utf-8' } }),
  ]);
  const tree = await githubRequest(token, `${target.root}/git/trees`, {
    method: 'POST',
    body: {
      base_tree: baseTreeSha,
      tree: [
        { path: 'site/data/worlds.json', mode: '100644', type: 'blob', sha: worldBlob.sha },
        { path: 'site/data/systems.json', mode: '100644', type: 'blob', sha: systemBlob.sha },
      ],
    },
  });
  const commit = await githubRequest(token, `${target.root}/git/commits`, {
    method: 'POST',
    body: {
      message: 'chore(site): refresh FCR portfolio evidence',
      tree: tree.sha,
      parents: [beforeHead],
    },
  });

  const refReadback = await githubRequest(token, `${target.root}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (refReadback.object.sha !== beforeHead) throw new Error(`STALE_TARGET_HEAD_BEFORE_REF_UPDATE:${beforeHead}:${refReadback.object.sha}`);
  await githubRequest(token, `${target.root}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });
  const finalRef = await githubRequest(token, `${target.root}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (finalRef.object.sha !== commit.sha) throw new Error(`TARGET_REF_READBACK_MISMATCH:${commit.sha}:${finalRef.object.sha}`);
  return commit.sha;
}

async function writeReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

async function runSync() {
  const token = requiredEnv('PORTFOLIO_SYNC_TOKEN');
  const targetRepository = process.env.TARGET_REPOSITORY?.trim() || DEFAULT_TARGET;
  const branch = process.env.TARGET_BRANCH?.trim() || DEFAULT_BRANCH;
  const receiptPath = process.env.PORTFOLIO_SYNC_RECEIPT?.trim() || 'artifacts/portfolio-evidence-sync/receipt.json';
  const target = await readTargetState(token, targetRepository, branch);

  const repositories = new Set();
  for (const world of target.worlds.worlds || []) {
    const repository = world.repo || (world.carriers || []).find((c) => c?.platform === 'github' && c?.role?.includes('canonical'))?.ref;
    if (repository) repositories.add(repository);
  }
  for (const system of target.systems.systems || []) {
    if (system.public !== false && system.kind === 'standalone_os' && system.repo?.name) repositories.add(system.repo.name);
  }

  const repoList = [...repositories].sort();
  const observed = await mapLimit(repoList, 5, async (repository) => [repository, await observeRepository(token, repository)]);
  const observations = new Map(observed);
  const now = new Date();
  const result = applyEvidence({ worldsRegistry: target.worlds, systemsRegistry: target.systems, observations, now });
  const changed = result.changedWorlds.length + result.changedSystems.length > 0;
  const targetCommit = changed
    ? await publishAtomicRegistryCommit(token, target, branch, target.headSha, target.treeSha, result.worlds, result.systems)
    : target.headSha;
  const unavailableRepositories = observed.filter(([, value]) => value.status === 'unavailable').map(([repository, value]) => ({ repository, reason: value.reason }));
  const receipt = {
    contract: CONTRACT,
    state: changed ? 'PUBLISHED' : 'NO_CHANGE',
    targetRepository,
    branch,
    previousTargetHead: target.headSha,
    targetCommit,
    worldsGeneratedAt: result.worlds.generatedAt,
    systemsGeneratedAt: result.systems.generatedAt,
    observedRepositoryCount: repoList.length,
    unavailableRepositories,
    changedWorlds: result.changedWorlds,
    changedSystems: result.changedSystems,
    mutationBoundary: 'evidence fields + registry generatedAt only',
  };
  await writeReceipt(receiptPath, receipt);
  console.log(JSON.stringify(receipt));
}

async function runSelfTest() {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const baseWorlds = {
    generatedAt: '2026-09-30T00:00:00.000Z',
    source: 'founder-declared',
    worlds: [{ name: 'Alpha', repo: 'jussray/alpha', label: 'Founder label', evidence: {} }],
  };
  const baseSystems = {
    generatedAt: '2026-09-30T00:00:00.000Z',
    rules: { internalUltrathinkIsNotPublicFacing: true },
    systems: [
      { name: 'Git OS', kind: 'standalone_os', public: true, repo: { name: 'jussray/git-os' }, label: 'Founder OS label' },
      { name: 'Base44 OS', kind: 'standalone_os', public: true, builder: { provider: 'Base44', appId: 'app-1' }, label: 'Founder Base44 label' },
      { name: 'Internal', kind: 'standalone_internal_os', public: false, builder: { provider: 'Base44', appId: 'internal-1' } },
    ],
  };
  const observation = (repository, sha) => ({
    status: 'observed', repository, visibility: 'private', archived: false, defaultBranch: 'main', headSha: sha,
    headDate: '2026-10-01T11:55:00Z', latestMergedPr: { number: 7, title: 'Focused fix', mergedAt: '2026-10-01T11:50:00Z', mergeCommitSha: sha },
    checks: summarizeChecks([{ status: 'completed', conclusion: 'success' }]),
  });
  const observations = new Map([
    ['jussray/alpha', observation('jussray/alpha', 'a'.repeat(40))],
    ['jussray/git-os', observation('jussray/git-os', 'b'.repeat(40))],
  ]);
  const first = applyEvidence({ worldsRegistry: baseWorlds, systemsRegistry: baseSystems, observations, now });
  assert.equal(first.changedWorlds.length, 1);
  assert.equal(first.changedSystems.length, 2);
  assert.equal(first.worlds.worlds[0].label, 'Founder label');
  assert.equal(first.worlds.worlds[0].evidence.mainSha, 'a'.repeat(40));
  assert.match(first.worlds.worlds[0].evidence.ci, /^PASS/);
  assert.equal(first.systems.systems[1].evidence.status, 'unknown');
  assert.equal(first.systems.systems[2].evidence, undefined);
  assert.deepEqual(stripMutableEvidence(first.worlds), stripMutableEvidence(baseWorlds));
  assert.deepEqual(stripMutableEvidence(first.systems), stripMutableEvidence(baseSystems));

  const second = applyEvidence({ worldsRegistry: first.worlds, systemsRegistry: first.systems, observations, now: new Date(now.getTime() + 60 * 60 * 1000) });
  assert.deepEqual(second.changedWorlds, []);
  assert.deepEqual(second.changedSystems, []);
  assert.equal(second.worlds.generatedAt, first.worlds.generatedAt);

  const stale = applyEvidence({ worldsRegistry: first.worlds, systemsRegistry: first.systems, observations, now: new Date(now.getTime() + 25 * 60 * 60 * 1000) });
  assert.equal(stale.changedWorlds.length, 1);
  assert.equal(stale.changedSystems.length, 2);

  const unavailable = applyEvidence({
    worldsRegistry: baseWorlds,
    systemsRegistry: { systems: [] },
    observations: new Map([['jussray/alpha', { status: 'unavailable', repository: 'jussray/alpha', reason: 'REPOSITORY_NOT_INSTALLED_OR_NOT_FOUND' }]]),
    now,
  });
  assert.equal(unavailable.worlds.worlds[0].evidence.status, 'unknown');
  assert.equal(unavailable.worlds.worlds[0].evidence.mainSha, undefined);
  console.log('portfolio evidence sync self-test passed');
}

async function runLiveProof() {
  const expectedWorldsGeneratedAt = requiredEnv('EXPECTED_WORLDS_GENERATED_AT');
  const expectedSystemsGeneratedAt = requiredEnv('EXPECTED_SYSTEMS_GENERATED_AT');
  const urls = (process.env.JUSSCO_URLS || 'https://jussco.company,https://www.jussco.company').split(',').map((v) => v.trim()).filter(Boolean);
  const outputDir = process.env.PORTFOLIO_PROOF_DIR || 'proof/portfolio-evidence-sync';
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch();
  let failed = false;
  try {
    for (const baseUrl of urls) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      let registries = null;
      for (let attempt = 1; attempt <= 24; attempt += 1) {
        await page.goto(`${baseUrl}/?portfolio-proof=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        registries = await page.evaluate(async ({ expectedWorldsGeneratedAt, expectedSystemsGeneratedAt }) => {
          const bust = Date.now();
          const [worlds, systems] = await Promise.all([
            fetch(`/data/worlds.json?proof=${bust}`, { cache: 'no-store' }).then((r) => r.json()),
            fetch(`/data/systems.json?proof=${bust}`, { cache: 'no-store' }).then((r) => r.json()),
          ]);
          return { worlds, systems, ready: worlds.generatedAt === expectedWorldsGeneratedAt && systems.generatedAt === expectedSystemsGeneratedAt };
        }, { expectedWorldsGeneratedAt, expectedSystemsGeneratedAt });
        if (registries.ready) break;
        if (attempt === 24) throw new Error(`${baseUrl}: deployed registries did not reach expected evidence generation timestamps`);
        await page.waitForTimeout(10000);
      }
      await page.waitForFunction(() => document.querySelectorAll('.card').length === 15 && document.querySelectorAll('.os-card').length === 5, null, { timeout: 20000 });
      const publicSystems = (registries.systems.systems || []).filter((item) => item.public !== false && item.kind === 'standalone_os');
      const worldEvidenceReady = (registries.worlds.worlds || []).length === 15 && registries.worlds.worlds.every((item) => item.evidence?.contract === CONTRACT);
      const systemEvidenceReady = publicSystems.length === 5 && publicSystems.every((item) => item.evidence?.contract === CONTRACT);
      const fcrCard = page.locator('.card', { hasText: 'Founder Control Room' });
      await fcrCard.click();
      await page.waitForTimeout(150);
      const drawerText = await page.innerText('#dFacts');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const ok = worldEvidenceReady && systemEvidenceReady && /Main\s+[0-9a-f]{7}/i.test(drawerText) && /CI on main/i.test(drawerText) && overflow === 0 && errors.length === 0;
      console.log(`${baseUrl}: evidence-live ${ok ? 'verified' : 'FAILED'} · 15 worlds + 5 systems`);
      if (!ok) failed = true;
      const label = new URL(baseUrl).hostname.replace(/[^a-z0-9.-]/gi, '_');
      await page.screenshot({ path: `${outputDir}/${label}.png`, fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (failed) process.exitCode = 1;
}

const mode = process.argv[2];
if (mode === '--self-test') await runSelfTest();
else if (mode === '--live-proof') await runLiveProof();
else await runSync();
