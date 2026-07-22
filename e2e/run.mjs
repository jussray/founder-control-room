// Real end-to-end proof: boots the actual compiled server (real Express
// app, real routes, real static frontend), backed by in-memory fakes for
// Supabase (via a Node ESM loader redirecting the two client modules) and
// GitHub (via Octokit's own baseUrl option pointing at a real local HTTP
// server implementing the exact REST calls GitHubProvider makes) — and
// drives the real served frontend with a real headless Chromium. Nothing
// at the route/controller/browser level is mocked; only the two external
// providers are swapped, at the network boundary, for faithful in-memory
// equivalents.
//
// What this proves: the founder can, through the real browser UI, sign in
// via the real magic-link + callback-redirect flow; register a project;
// create a mission with required checks and an assigned multitool agent;
// create its sandbox branch; have a real signed CI webhook advance it to
// in_review; edit a file and commit it; run the proof gate; execute a real
// merge; and see the merged content in the (fake) repository's default
// branch — plus log an Agent Council round, a cost entry, register an MCP
// connector with an authority level, and run a real command through the
// guarded terminal against this actual checked-out repo. All through real
// route handlers. See e2e/README.md for the full, numbered list of real
// bugs this harness has caught while being built.
//
// What this still does NOT prove: production auth, deployment, or
// migrations against a real Supabase/Cloudflare account, or the guarded
// terminal's write/verify-risk command paths. Those need the founder's own
// credentials/infrastructure and cannot be faked without pretending to
// have authority nobody granted.

import { spawn, execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createFakeGitHubServer } from './fakeGitHubServer.mjs';

const PORT = 8802;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FOUNDER_EMAIL = 'founder@example.com';
const BRIDGE_FILE = new URL('./.auth-bridge.json', import.meta.url).pathname;
const GITHUB_OWNER = 'jussray';
const GITHUB_REPO = 'demo-project';
const GITHUB_WEBHOOK_SECRET = 'e2e-webhook-secret';

// The guarded terminal's command registry (src/terminal/registry.ts) hard-codes
// project slug "founder-control-room" with relativeCwd "founder-control-room"
// under CONTROL_ROOM_WORKSPACE_ROOT — it's meant to run real, read-only git
// commands against this very repo's own real checkout, not a fake. So this repo
// root is real; only its GitHub-facing branch/commit history is faked, same as
// the "demo-project" repo above.
const REPO_ROOT = dirname(fileURLToPath(new URL('.', import.meta.url)));
const REPO_WORKSPACE_ROOT = dirname(REPO_ROOT);
const REAL_REPO_HEAD_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().toLowerCase();

if (existsSync(BRIDGE_FILE)) unlinkSync(BRIDGE_FILE);

let failures = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`  ok — ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL — ${message}`);
  }
}

/** Polls via the auto-retrying Locator API instead of page.waitForFunction, which proved flaky against this app's full-shell re-renders (destroys and rebuilds the whole DOM tree on every state change). */
async function waitForText(page, selector, text, timeoutMs = 15000) {
  // .innerText() reflects CSS text-transform (several .meta/.h3 rules here
  // are uppercase), so compare case-insensitively — this is a presentation
  // detail, not a functional one.
  const needle = text.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  let lastSeen = '';
  while (Date.now() < deadline) {
    try {
      lastSeen = await page.locator(selector).first().innerText({ timeout: 500 });
      if (lastSeen.toLowerCase().includes(needle)) return lastSeen;
    } catch {
      // node not present yet / mid-rerender — retry
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for "${text}" in ${selector}. Last seen: ${lastSeen.slice(0, 500)}`);
}

/** For <textarea>/<input>: .innerText() doesn't reflect form-control value, .inputValue() does. */
async function waitForValue(page, selector, text, timeoutMs = 15000) {
  const needle = text.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  let lastSeen = '';
  while (Date.now() < deadline) {
    try {
      lastSeen = await page.locator(selector).first().inputValue({ timeout: 500 });
      if (lastSeen.toLowerCase().includes(needle)) return lastSeen;
    } catch {
      // not present yet / mid-rerender — retry
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for value "${text}" in ${selector}. Last seen: ${lastSeen.slice(0, 500)}`);
}

async function waitForCount(page, selector, minCount, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await page.locator(selector).count();
    if (count >= minCount) return count;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for at least ${minCount} of "${selector}"`);
}

/**
 * The frontend has no live polling/websocket — a mission that transitions
 * status asynchronously (via the background reconciler reacting to a
 * webhook, same as this app's own real-world CI integration) will never
 * appear updated in the browser until something re-fetches. This mirrors
 * what a founder would actually have to do: click Refresh, then reopen the
 * mission. Not a workaround for a bug — this IS the real, current behavior;
 * a live-refresh mechanism is a legitimate product gap, not something to
 * paper over here.
 */
async function waitForMissionStatusByPolling(page, text, timeoutMs = 30000) {
  // One request per cycle (refresh-missions), not four (which would also
  // reopen the detail panel and its 3 sub-fetches) — real rate limiting
  // (rateLimitGeneral, 60 req/min/IP) is wired up for real here, and a tight
  // poll loop trips it just like it would for an actual client hammering
  // the API. The lane board alone shows status (which lane a card is in),
  // so that's enough to detect the transition before opening the detail view.
  const needle = text.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  let found = false;
  while (Date.now() < deadline) {
    await page.click('#refresh-missions');
    const targetLane = page.locator('.lane').filter({ has: page.locator('h4', { hasText: needle }) });
    if ((await targetLane.count()) > 0 && (await targetLane.locator('.card').count()) > 0) {
      found = true;
      break;
    }
    await sleep(3000);
  }
  await page.click('.lane .card');
  // page.click() only waits for the click event to dispatch, not for the
  // click handler's own async chain (selectMission awaits 3 fetches, then
  // renders) to finish — poll .innerText() rather than reading it once,
  // so this doesn't race a render that's still in flight.
  let detailText = '';
  const detailDeadline = Date.now() + 5000;
  while (Date.now() < detailDeadline) {
    detailText = await page.locator('#mission-detail').innerText().catch(() => '');
    if (detailText.toLowerCase().includes(needle)) break;
    await sleep(150);
  }
  if (!found || !detailText.toLowerCase().includes(needle)) {
    throw new Error(`Timed out polling for mission status "${text}". Detail seen: ${detailText.slice(0, 300)}`);
  }
  return detailText;
}

async function waitForServer(url) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error(`Server at ${url} did not become healthy in time`);
}

// --- fake GitHub server (in-process, no subprocess needed) ------------------
// One process serves both repos below, since GitHubProvider is configured
// from a single process-wide GITHUB_API_BASE_URL — see fakeGitHubServer.mjs's
// module comment on why it's multi-repo.
const { app: fakeGitHubApp, addRepo, getRepo } = createFakeGitHubServer();
const demoRepo = addRepo({
  owner: GITHUB_OWNER,
  repo: GITHUB_REPO,
  defaultBranch: 'main',
  seedFiles: { 'README.md': '# Demo Project\n', 'src/index.ts': 'console.log("hello");\n' },
});
const { branches: fakeGitHubBranches, trees: fakeGitHubTrees } = demoRepo;
// This repo's "main" tip is pinned to the real, current HEAD of this actual
// checkout — see REAL_REPO_HEAD_SHA above — so that when the guarded
// terminal proof (below) creates a branch off it, GitHubProvider.resolveRef
// returns exactly the sha the real local `git rev-parse HEAD` will also
// return, letting the terminal's exact-head check pass for real.
const TERMINAL_PROOF_REPO = 'founder-control-room';
addRepo({
  owner: GITHUB_OWNER,
  repo: TERMINAL_PROOF_REPO,
  defaultBranch: 'main',
  rootCommitSha: REAL_REPO_HEAD_SHA,
});
const fakeGitHubServer = fakeGitHubApp.listen(0);
const fakeGitHubPort = await new Promise((resolve) => fakeGitHubServer.once('listening', () => resolve(fakeGitHubServer.address().port)));
const fakeGitHubUrl = `http://127.0.0.1:${fakeGitHubPort}`;

// --- real Control Room server (subprocess, Supabase faked via loader) -------
const server = spawn(
  process.execPath,
  ['--import', new URL('./register-loader.mjs', import.meta.url).pathname, new URL('../dist/index.js', import.meta.url).pathname],
  {
    env: {
      ...process.env,
      SUPABASE_URL: 'https://fake.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key',
      SUPABASE_PUBLISHABLE_KEY: 'fake-publishable-key',
      FOUNDER_EMAIL,
      E2E_SEED_FOUNDER_EMAIL: FOUNDER_EMAIL,
      E2E_AUTH_BRIDGE_FILE: BRIDGE_FILE,
      PORT: String(PORT),
      NODE_ENV: 'development',
      CONTROL_ROOM_TERMINAL_ENABLED: 'true',
      CONTROL_ROOM_WORKSPACE_ROOT: REPO_WORKSPACE_ROOT,
      FOUNDER_API_URL: BASE_URL,
      FOUNDER_ALLOWED_ORIGINS: BASE_URL,
      GITHUB_TOKEN: 'fake-github-token',
      GITHUB_API_BASE_URL: fakeGitHubUrl,
      GITHUB_WEBHOOK_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

function signWebhook(body) {
  return `sha256=${createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(body).digest('hex')}`;
}

async function sendCheckRunWebhook({ headSha, conclusion }) {
  const payload = {
    action: 'completed',
    repository: { full_name: `${GITHUB_OWNER}/${GITHUB_REPO}` },
    check_run: { id: Math.floor(Math.random() * 1e9), name: 'unit test suite', conclusion, head_sha: headSha, details_url: null },
  };
  const rawBody = JSON.stringify(payload);
  const res = await fetch(`${BASE_URL}/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'check_run',
      'X-GitHub-Delivery': randomUUID(),
      'X-Hub-Signature-256': signWebhook(rawBody),
    },
    body: rawBody,
  });
  if (!res.ok) throw new Error(`check_run webhook rejected: ${res.status} ${await res.text()}`);
}

async function main() {
  await waitForServer(`${BASE_URL}/health`);
  console.log(`Server up on ${BASE_URL}, fake GitHub up on ${fakeGitHubUrl}`);

  // No executablePath override: Playwright resolves its own installed browser
  // (via PLAYWRIGHT_BROWSERS_PATH when set), so this doesn't drift out of sync
  // with whatever chromium revision `playwright install` actually fetched.
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  // Uncaught JS exceptions are real bugs (this is how el() single-element
  // truncation got caught). Chrome's own "Failed to load resource" console
  // messages for a non-2xx fetch are network diagnostics, not JS errors —
  // the app's own try/catch already turns those into a founder-visible
  // banner, so they're tracked separately and not treated as failures.
  const jsExceptions = [];
  const networkDiagnostics = [];
  page.on('pageerror', (err) => jsExceptions.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (msg.text().startsWith('Failed to load resource:')) networkDiagnostics.push(msg.text());
    else jsExceptions.push(msg.text());
  });

  console.log('\n[1] Sign-in screen renders for real, unauthenticated');
  await page.goto(`${BASE_URL}/control-room/`);
  await page.waitForSelector('#magic-link-form');
  assert(await page.locator('.sign-in-card h2').innerText() === 'Founder Control Room', 'sign-in card is shown');

  console.log('\n[2] Request a magic link through the real UI and real API');
  await page.fill('input[name="email"]', FOUNDER_EMAIL);
  await page.click('#magic-link-form button[type=submit]');
  await page.waitForSelector('.notice');

  let bridge;
  for (let i = 0; i < 30 && !bridge; i += 1) {
    if (existsSync(BRIDGE_FILE)) bridge = JSON.parse(readFileSync(BRIDGE_FILE, 'utf8'));
    else await sleep(50);
  }
  assert(Boolean(bridge?.tokenHash), 'the server generated a real token_hash for the magic link');

  console.log('\n[3] Follow the real /auth/callback redirect (simulating clicking the emailed link)');
  await page.goto(`${BASE_URL}/auth/callback?token_hash=${bridge.tokenHash}`);
  await page.waitForSelector('.topbar', { timeout: 5000 });
  assert(await page.locator('.founder-email').innerText() === FOUNDER_EMAIL, 'landed on the app shell signed in as the founder');

  console.log('\n[4] Register a project (with a real repo identifier) through the real UI');
  await page.fill('#new-project-form input[name="slug"]', 'demo-project');
  await page.fill('#new-project-form input[name="name"]', 'Demo Project');
  await page.fill('#new-project-form input[name="repoIdentifier"]', `${GITHUB_OWNER}/${GITHUB_REPO}`);
  await page.click('#new-project-form button[type=submit]');
  await waitForCount(page, '#project-list .card', 1);
  assert((await page.locator('#project-list .card').innerText()).includes('Demo Project'), 'project appears in the real list after registering');

  console.log('\n[4b] Bind the project to the repo via a git connection, so the webhook can route to it');
  {
    // Registered through the API directly here (not the connections form,
    // which doesn't expose a raw `config` field) — this is the same
    // resolveProject() lookup src/http/webhooks/github.ts performs for
    // real, against the real project_connections table.
    const founderToken = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fcr_session')).access_token);
    const res = await fetch(`${BASE_URL}/projects/demo-project/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${founderToken}` },
      body: JSON.stringify({ connectionType: 'git', config: { repository: `${GITHUB_OWNER}/${GITHUB_REPO}` } }),
    });
    assert(res.ok, `git connection registered for webhook routing (status ${res.status})`);
  }

  console.log('\n[5] Open the project and create a mission with an assigned agent and a required check');
  await page.click('#project-list .card');
  await page.waitForSelector('#new-mission-form');
  await page.fill('#new-mission-form input[name="title"]', 'Ship the onboarding flow');
  await page.fill('#new-mission-form input[name="builderAgent"]', 'claude-code');
  await page.fill('#new-mission-form input[name="reviewerAgent"]', 'codex');
  await page.fill('#new-mission-form input[name="requiredChecks"]', 'unit_test');
  await page.click('#new-mission-form button[type=submit]');
  await page.waitForSelector('.notice');

  console.log('\n[6] Confirm the mission shows up on the real task board with its agent assignment');
  await page.click('.tabs button[data-tab=missions]');
  await page.click('#refresh-missions');
  await waitForCount(page, '.lane .card', 1);
  const boardText = await page.locator('#mission-lanes').innerText();
  assert(boardText.includes('Ship the onboarding flow'), 'mission appears on the real task board');

  await page.click('.lane .card');
  await page.waitForSelector('#assign-agents-form');
  const detailText = await page.locator('#mission-detail').innerText();
  assert(detailText.includes('Builder:') && detailText.includes('claude-code') && detailText.includes('codex'), 'multitool assignment (builder=claude-code, reviewer=codex) round-tripped through the real API');

  console.log('\n[6b] Create the real sandbox branch on the (fake) GitHub repo, leaving name/base blank to exercise the default-fallback fix');
  // create_branch is ALSO a proof-gated action (PROOF_GATED_ACTIONS in
  // approvals.ts) — it 403s without a fresh passing gate result first, same
  // as merge below.
  await page.selectOption('#proof-gate-form select[name=gateId]', 'create_branch');
  await page.fill('#proof-gate-form input[name=filesChanged]', 'mission-plan');
  await page.fill('#proof-gate-form input[name=checksRun]', 'plan_reviewed');
  await page.fill('#proof-gate-form input[name=behaviorChanged]', 'No behavior change yet — opening the sandbox.');
  await page.fill('#proof-gate-form input[name=securityImpact]', 'none');
  await page.fill('#proof-gate-form input[name=deploymentImpact]', 'none');
  await page.fill('#proof-gate-form input[name=rollbackPath]', 'Delete the sandbox branch.');
  await page.click('#proof-gate-form button[type=submit]');
  await page.waitForSelector('.notice');

  await page.click('#create-branch-form button[type=submit]');
  const sandboxedText = await waitForText(page, '#mission-detail', 'sandboxed');
  assert(sandboxedText.toLowerCase().includes('sandboxed'), 'mission moved to sandboxed after real branch creation');
  const createdBranches = [...fakeGitHubBranches.keys()].filter((name) => name !== 'main');
  assert(
    createdBranches.length === 1 && createdBranches[0].startsWith('mission/'),
    `exactly one sandbox branch was created using the backend's default mission/<id> name, not an empty string (created: ${JSON.stringify(createdBranches)})`,
  );
  const branchName = createdBranches[0];

  console.log('\n[6c] Edit a file on the real sandbox branch through the real UI (real GitHub git-object calls: blob/tree/commit/updateRef)');
  await page.fill('#mission-file-path', 'src/index.ts');
  await page.click('#mission-file-load');
  await waitForValue(page, '#mission-file-editor', 'hello');
  await page.fill('#mission-file-editor', 'console.log("edited by e2e");\n');
  await page.fill('#mission-commit-message', 'E2E: edit index.ts');
  await page.click('#mission-commit-btn');
  await waitForText(page, '.notice', 'Committed');
  const branchTreeSha = fakeGitHubBranches.get(branchName)?.treeSha;
  const branchFileContent = fakeGitHubTrees.get(branchTreeSha)?.get('src/index.ts');
  assert(branchFileContent === 'console.log("edited by e2e");\n', 'the fake GitHub branch tree was actually updated by a real commitPatch call');

  console.log('\n[6d] Deliver a real signed CI webhook (check_run success) — should advance the mission to in_review via the real background reconciler');
  const branchHeadSha = fakeGitHubBranches.get(branchName)?.sha;
  await sendCheckRunWebhook({ headSha: branchHeadSha, conclusion: 'success' });
  const inReviewText = await waitForMissionStatusByPolling(page, 'in_review', 25000);
  assert(inReviewText.toLowerCase().includes('in_review'), 'a real signed webhook drove CheckRunController -> evidence -> MissionController -> in_review, through the real background reconciler (2s poll) — the frontend itself has no live refresh, so the test polls the way a founder would (Refresh, reopen)');

  console.log('\n[6e] Run the merge proof gate through the real UI — pins policy_snapshot.expectedHeadSha and approves');
  // This app re-renders the WHOLE shell on every guarded() action, and a
  // DOM click handler's async chain (fetch -> render) isn't awaited by
  // Playwright's page.click() — it can resolve and re-render at any later
  // point, including mid-fill of an unrelated form. Rather than chase every
  // individual race, retry the whole fill+submit sequence as one unit: by
  // the time a retry runs, any straggling render has long since settled.
  let approvedText = '';
  for (let attempt = 1; attempt <= 5 && !approvedText.toLowerCase().includes('approved'); attempt += 1) {
    await page.selectOption('#proof-gate-form select[name=gateId]', 'merge');
    await page.fill('#proof-gate-form input[name=filesChanged]', 'src/index.ts');
    await page.fill('#proof-gate-form input[name=checksRun]', 'unit_test');
    await page.fill('#proof-gate-form input[name=behaviorChanged]', 'index.ts now logs a different message');
    await page.fill('#proof-gate-form input[name=securityImpact]', 'none');
    await page.fill('#proof-gate-form input[name=deploymentImpact]', 'none');
    await page.fill('#proof-gate-form input[name=rollbackPath]', 'git revert the merge commit');
    if ((await page.locator('#proof-gate-form select[name=gateId]').inputValue()) !== 'merge') {
      console.log(`  (attempt ${attempt}: gateId select got reset by a late re-render before submit — retrying the whole fill)`);
      await sleep(500);
      continue;
    }
    await page.click('#proof-gate-form button[type=submit]');
    try {
      approvedText = await waitForText(page, '#mission-detail', 'approved', 5000);
    } catch {
      console.log(`  (attempt ${attempt}: mission not yet approved — retrying)`);
    }
  }
  assert(approvedText.toLowerCase().includes('approved'), 'proof gate passed and mission moved to approved');

  console.log('\n[6f] Execute the real merge through the real UI');
  const resolvedHeadSha = fakeGitHubBranches.get(branchName)?.sha;
  await page.fill('#execute-merge-form input[name=expectedHeadSha]', resolvedHeadSha);
  await page.click('#execute-merge-form button[type=submit]');
  const integratedText = await waitForText(page, '#mission-detail', 'integrated');
  assert(integratedText.toLowerCase().includes('integrated'), 'mission moved to integrated after a real merge execution');
  const mainTreeSha = fakeGitHubBranches.get('main')?.treeSha;
  const mainFileContent = fakeGitHubTrees.get(mainTreeSha)?.get('src/index.ts');
  assert(mainFileContent === 'console.log("edited by e2e");\n', "the (fake) repo's real default branch actually contains the merged edit");

  console.log('\n[7] Log an Agent Council round and a cost entry through the real UI');
  await page.fill('#log-council-form input[name="participants"]', 'claude-code, codex, redteam');
  await page.fill('#log-council-form input[name="outcome"]', 'approved');
  await page.click('#log-council-form button[type=submit]');
  const councilText = await waitForText(page, '#mission-detail', 'redteam');
  assert(councilText.includes('approved'), 'council round appears in the real UI after logging it');

  await page.fill('#log-cost-form input[name="agentName"]', 'perplexity');
  await page.fill('#log-cost-form input[name="costUsd"]', '0.05');
  await page.click('#log-cost-form button[type=submit]');
  const costText = await waitForText(page, '#mission-detail', 'Total: $');
  assert(costText.includes('0.0500'), 'cost entry round-tripped and totals correctly');

  console.log('\n[8] Register an MCP connector and record a health check');
  // The project detail panel is already showing from step 5's selection
  // (state.selectedProjectSlug persists across tabs) — re-clicking the
  // card here would trigger a redundant re-fetch mid-fill and wipe the
  // form the test is actively filling in, a real timing hazard worth not
  // repeating in the app's own click handlers either.
  await page.click('.tabs button[data-tab=projects]');
  await page.waitForSelector('#new-connection-form');
  await page.selectOption('#new-connection-form select[name=connectionType]', 'figma');
  await page.fill('#new-connection-form input[name=label]', 'design-system');
  await page.selectOption('#new-connection-form select[name=authorityLevel]', 'L2');
  await page.fill('#new-connection-form input[name=capabilities]', 'inspect_designs, compare_design_vs_implementation');
  await page.click('#new-connection-form button[type=submit]');
  await waitForText(page, '[data-connection-id]', 'figma');
  assert(true, 'figma connector registered with authority level L2 and capabilities');

  // There are two connections by now (the git one from step 4b, and this
  // figma one) — target the figma card specifically rather than assume order.
  const figmaCard = page.locator('[data-connection-id]', { hasText: 'figma' });
  await figmaCard.locator('.connection-check-btn').click();
  const connectionText = await waitForText(page, '[data-connection-id]:has-text("figma")', 'last checked');
  assert(connectionText.toLowerCase().includes('last checked'), 'connector health check recorded a real last_checked_at');

  console.log('\n[9] Guarded terminal: run a real read-only command against this actual checked-out repo, through the real UI');
  // Unlike every step above, this one doesn't touch the fake GitHub repo at
  // all for its actual execution — CONTROL_ROOM_WORKSPACE_ROOT points at this
  // real repo's real parent directory, and the terminal spawns a real `git`
  // process against it (src/terminal/runner.ts). The fake repo above is only
  // used to legitimately pin policy_snapshot.expectedHeadSha to the real
  // local HEAD sha, through the same real create_branch proof-gate + execute
  // flow already proven in [6b] — not a shortcut around it.
  {
    const founderToken = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fcr_session')).access_token);
    const projectRes = await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${founderToken}` },
      body: JSON.stringify({
        slug: TERMINAL_PROOF_REPO,
        name: 'Founder Control Room (self)',
        repoIdentifier: `${GITHUB_OWNER}/${TERMINAL_PROOF_REPO}`,
      }),
    });
    assert(projectRes.ok, `registered the ${TERMINAL_PROOF_REPO} project so the terminal's command registry (keyed on this exact slug) has somewhere real to run (status ${projectRes.status})`);

    const missionRes = await fetch(`${BASE_URL}/projects/${TERMINAL_PROOF_REPO}/missions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${founderToken}` },
      body: JSON.stringify({ title: 'Prove the guarded terminal end to end' }),
    });
    const missionBody = await missionRes.json();
    assert(missionRes.ok, `created a mission on ${TERMINAL_PROOF_REPO} (status ${missionRes.status})`);
    const terminalMissionId = missionBody.mission.id;

    const gateRes = await fetch(`${BASE_URL}/approvals/${terminalMissionId}/run-proof-gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${founderToken}` },
      body: JSON.stringify({
        gateId: 'create_branch',
        evidence: {
          filesChanged: ['mission-plan'],
          behaviorChanged: 'No behavior change yet — opening the sandbox.',
          checksRun: ['plan_reviewed'],
          failures: [],
          securityImpact: 'none',
          deploymentImpact: 'none',
          rollbackPath: 'Delete the sandbox branch.',
          unresolvedRisks: [],
        },
      }),
    });
    assert(gateRes.ok, `create_branch proof gate passed for the terminal mission (status ${gateRes.status})`);

    const executeRes = await fetch(`${BASE_URL}/approvals/${terminalMissionId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${founderToken}` },
      body: JSON.stringify({
        actionType: 'create_branch',
        idempotencyKey: `terminal-proof-branch-${terminalMissionId}`,
        payload: { branchName: 'terminal-proof', baseRef: 'main' },
      }),
    });
    const executeBody = await executeRes.json();
    assert(
      executeRes.ok && executeBody.result?.expectedHeadSha === REAL_REPO_HEAD_SHA,
      `branch creation pinned policy_snapshot.expectedHeadSha to this real repo's actual HEAD (${REAL_REPO_HEAD_SHA}), not just a fake sha — this is the fix for bug #7 below (expectedHeadSha was previously only ever written at merge time, which the guarded terminal's own sandboxed/in_review precondition can never reach)`,
    );
    assert(
      getRepo(GITHUB_OWNER, TERMINAL_PROOF_REPO)?.branches.get('terminal-proof')?.sha === REAL_REPO_HEAD_SHA,
      "the fake repo's new branch head really does equal this checkout's real git HEAD",
    );

    await page.click('.tabs button[data-tab=terminal]');
    await page.waitForSelector('#terminal-project-slug');
    await page.fill('#terminal-project-slug', TERMINAL_PROOF_REPO);
    await page.click('#terminal-load-commands');
    await waitForCount(page, '#terminal-commands .card', 1);
    await page.click('#terminal-commands .card[data-id="git.head"]');
    await page.waitForSelector('#terminal-run-form');
    await page.fill('#terminal-run-form input[name=missionId]', terminalMissionId);
    await page.fill('#terminal-run-form input[name=expectedCommitSha]', REAL_REPO_HEAD_SHA);
    await page.click('#terminal-run-form button[type=submit]');
    const terminalResultText = await waitForText(page, '#terminal-run-result', REAL_REPO_HEAD_SHA);
    assert(
      terminalResultText.toLowerCase().includes(REAL_REPO_HEAD_SHA) && terminalResultText.toLowerCase().includes('"status": "passed"'),
      'the guarded terminal spawned a real `git rev-parse HEAD` against this real checkout and returned its real, correct output through the real UI',
    );
  }

  console.log('\n[10] No uncaught JS exceptions during the whole run');
  assert(jsExceptions.length === 0, `no uncaught JS exceptions (saw: ${JSON.stringify(jsExceptions)})`);
  if (networkDiagnostics.length) console.log(`  (${networkDiagnostics.length} expected network diagnostic message(s), not counted as failures: ${JSON.stringify(networkDiagnostics)})`);

  await browser.close();
}

main()
  .catch((err) => {
    failures += 1;
    console.error('E2E RUN THREW:', err);
  })
  .finally(() => {
    server.kill();
    fakeGitHubServer.close();
    console.log('\n--- server log (tail) ---');
    console.log(serverLog.split('\n').slice(-25).join('\n'));
    console.log(failures === 0 ? '\nE2E RESULT: PASS' : `\nE2E RESULT: FAIL (${failures} assertion(s) failed)`);
    process.exit(failures === 0 ? 0 : 1);
  });
