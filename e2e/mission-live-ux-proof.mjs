import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const missionUxSource = readFileSync(new URL('../public/control-room/mission-live-ux.js', import.meta.url), 'utf8');
const screenshotDir = new URL('../test-results/mission-live-ux/', import.meta.url).pathname;
mkdirSync(screenshotDir, { recursive: true });

const SESSION_COOKIE_NAME = '__Host-fcr_session';
const SESSION_COOKIE_VALUE = `v1.${'a'.repeat(43)}`;
let bearerAuthorizationObserved = false;
let opaqueCookieObserved = false;
let taskStatus = 'sandboxed';
let taskBranch = 'mission/ux-proof';

function task() {
  return {
    id: 'mission-ux-001',
    title: 'Founder UX live-status proof',
    status: taskStatus,
    branch_ref: taskBranch,
    project: { slug: 'founder-control-room' },
    risk_level: 'low',
  };
}

const pageHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mission live UX proof</title>
<style>
body{font:16px system-ui,sans-serif;margin:0;background:#0b1020;color:#e8eef8}.shell{max-width:960px;margin:auto;padding:24px}.tabs,.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.tabs button,.toolbar button{padding:9px 12px}.panel{margin-top:16px;padding:16px;border:1px solid #334155;border-radius:14px;background:#111827}.lane{padding:12px;border:1px solid #475569;border-radius:12px}.card{padding:10px;background:#1e293b;border-radius:10px}.muted{color:#a5b4c7}form{display:grid;gap:8px;margin-top:16px}input,select,textarea{width:100%;box-sizing:border-box;padding:9px}label{display:grid;gap:4px}.grid-lanes{display:grid;gap:10px}
</style>
</head>
<body>
<div id="root"></div>
<script>
const initialTask=${JSON.stringify(task())};
let currentTask=initialTask;
window.refreshClicks=0;
window.signedOut=false;
function proofFormHtml(){return currentTask.status==='sandboxed'||currentTask.status==='in_review'?\`
<form id="proof-gate-form">
<label>Gate ID<select name="gateId"><option value="create_branch">create_branch</option><option value="merge">merge</option></select></label>
<label>Files changed<input name="filesChanged" /></label>
<label>Checks run<input name="checksRun" /></label>
<label>Behavior changed<input name="behaviorChanged" /></label>
<label>Security impact<input name="securityImpact" value="none" /></label>
<label>Deployment impact<input name="deploymentImpact" value="none" /></label>
<label>Rollback path<input name="rollbackPath" /></label>
<button type="submit">Run proof gate</button>
</form>\`:''}
function workingDraftHtml(){return currentTask.status==='sandboxed'||currentTask.status==='in_review'?\`
<form id="mission-working-draft-form">
<label>Commit message<input name="commitMessage" /></label>
<label>Reviewer notes<textarea name="reviewNotes"></textarea></label>
<label>Run after review<input type="checkbox" name="runAfterReview" /></label>
</form>
<label>File path<input id="mission-file-path" /></label>
<label>File editor<textarea id="mission-file-editor"></textarea></label>
<label>Commit message<input id="mission-commit-message" /></label>\`:''}
function render(){
  if(window.signedOut){document.querySelector('#root').innerHTML='<main id="signed-out"><h1>Sign in required</h1></main>';return;}
  document.querySelector('#root').innerHTML=\`
  <div class="shell">
    <div class="topbar"><button id="sign-out" type="button">Sign out</button></div>
    <div class="tabs"><button data-tab="missions" class="active">Missions</button><button data-tab="projects">Projects</button></div>
    <div class="panel">
      <div class="toolbar"><button id="refresh-missions">Refresh</button></div>
      <div class="grid-lanes" id="mission-lanes"><div class="lane"><h4>\${currentTask.status} (1)</h4><div class="card" data-id="\${currentTask.id}">\${currentTask.title}</div></div></div>
    </div>
    <div class="panel" id="mission-detail"><h2>\${currentTask.title}</h2><p class="muted">status: <strong>\${currentTask.status}</strong></p>\${proofFormHtml()}\${workingDraftHtml()}</div>
  </div>\`;
  document.querySelector('#sign-out').addEventListener('click',()=>{window.signedOut=true;render();});
  document.querySelector('#refresh-missions').addEventListener('click', async()=>{
    window.refreshClicks+=1;
    const response=await fetch('/dashboard/tasks',{credentials:'same-origin',headers:{Accept:'application/json'}});
    const body=await response.json();
    currentTask=body.tasks[0];
    render();
  });
}
window.forceFounderShellRerender=()=>render();
render();
</script>
<script type="module">
import { installMissionLiveUx } from '/control-room/mission-live-ux.js';
installMissionLiveUx();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/control-room/mission-live-ux.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    res.end(missionUxSource);
    return;
  }
  if (req.url === '/dashboard/tasks') {
    if (typeof req.headers.authorization === 'string' && req.headers.authorization.length > 0) {
      bearerAuthorizationObserved = true;
    }
    const cookie = req.headers.cookie ?? '';
    opaqueCookieObserved ||= cookie.includes(`${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}`);
    if (!cookie.includes(`${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}`)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'opaque founder session required' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ tasks: [task()] }));
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'set-cookie': `${SESSION_COOKIE_NAME}=${SESSION_COOKIE_VALUE}; Path=/; Secure; HttpOnly; SameSite=Strict`,
  });
  res.end(pageHtml);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('mission UX proof server failed to bind');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
let expectedUnauthorizedObserved = false;
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('response', (response) => {
  if (response.status() === 401 && response.url().endsWith('/dashboard/tasks')) expectedUnauthorizedObserved = true;
});
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-mission-live-status]');
  assert.match(await page.locator('[data-mission-live-status]').innerText(), /Live status/);

  await page.selectOption('#proof-gate-form select[name=gateId]', 'merge');
  await page.fill('#proof-gate-form input[name=filesChanged]', 'src/index.ts');
  await page.fill('#proof-gate-form input[name=checksRun]', 'unit_test, playwright');
  await page.fill('#proof-gate-form input[name=behaviorChanged]', 'Mission status is visible without manual refresh.');
  await page.fill('#proof-gate-form input[name=rollbackPath]', 'Revert the focused UX commits.');
  await page.fill('#mission-working-draft-form input[name=commitMessage]', 'fix: keep founder working draft');
  await page.fill('#mission-working-draft-form textarea[name=reviewNotes]', 'Do not lose this note during polling.');
  await page.check('#mission-working-draft-form input[name=runAfterReview]');
  await page.fill('#mission-file-path', 'src/index.ts');
  await page.fill('#mission-file-editor', 'export const draft = true;');
  await page.fill('#mission-commit-message', 'fix: preserve id-only draft');

  await page.evaluate(() => window.forceFounderShellRerender());
  await page.waitForFunction(() => document.querySelector('#proof-gate-form select[name=gateId]')?.value === 'merge');
  assert.equal(await page.locator('#proof-gate-form input[name=filesChanged]').inputValue(), 'src/index.ts');
  assert.equal(await page.locator('#proof-gate-form input[name=checksRun]').inputValue(), 'unit_test, playwright');
  assert.equal(await page.locator('#proof-gate-form input[name=behaviorChanged]').inputValue(), 'Mission status is visible without manual refresh.');
  assert.equal(await page.locator('#proof-gate-form input[name=rollbackPath]').inputValue(), 'Revert the focused UX commits.');
  assert.equal(await page.locator('#mission-working-draft-form input[name=commitMessage]').inputValue(), 'fix: keep founder working draft');
  assert.equal(await page.locator('#mission-working-draft-form textarea[name=reviewNotes]').inputValue(), 'Do not lose this note during polling.');
  assert.equal(await page.locator('#mission-working-draft-form input[name=runAfterReview]').isChecked(), true);
  assert.equal(await page.locator('#mission-file-path').inputValue(), 'src/index.ts');
  assert.equal(await page.locator('#mission-file-editor').inputValue(), 'export const draft = true;');
  assert.equal(await page.locator('#mission-commit-message').inputValue(), 'fix: preserve id-only draft');

  await page.click('.tabs button[data-tab="missions"]');
  await page.evaluate(() => window.forceFounderShellRerender());
  assert.equal(await page.locator('#proof-gate-form input[name=filesChanged]').inputValue(), 'src/index.ts');
  assert.equal(await page.locator('#mission-working-draft-form input[name=commitMessage]').inputValue(), 'fix: keep founder working draft');
  assert.equal(await page.locator('#mission-working-draft-form textarea[name=reviewNotes]').inputValue(), 'Do not lose this note during polling.');
  assert.equal(await page.locator('#mission-working-draft-form input[name=runAfterReview]').isChecked(), true);
  assert.equal(await page.locator('#mission-file-editor').inputValue(), 'export const draft = true;');

  await page.screenshot({ path: `${screenshotDir}/desktop-draft-survives.png`, fullPage: true });

  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('fcr:mission-draft-committed', {
      detail: { formId: 'mission-working-draft-form' },
    }));
    document.dispatchEvent(new CustomEvent('fcr:mission-draft-committed', {
      detail: { fieldIds: ['mission-file-path', 'mission-file-editor', 'mission-commit-message'] },
    }));
    window.forceFounderShellRerender();
  });
  assert.equal(await page.locator('#mission-working-draft-form input[name=commitMessage]').inputValue(), '');
  assert.equal(await page.locator('#mission-working-draft-form textarea[name=reviewNotes]').inputValue(), '');
  assert.equal(await page.locator('#mission-working-draft-form input[name=runAfterReview]').isChecked(), false);
  assert.equal(await page.locator('#mission-file-path').inputValue(), '');
  assert.equal(await page.locator('#mission-file-editor').inputValue(), '');
  assert.equal(await page.locator('#mission-commit-message').inputValue(), '');
  assert.equal(await page.locator('#proof-gate-form input[name=filesChanged]').inputValue(), 'src/index.ts', 'clearing one successful form must not erase a different unsent form');

  await page.locator('h2').click();
  taskStatus = 'in_review';
  await page.waitForFunction(() => document.querySelector('#mission-lanes h4')?.textContent?.includes('in_review'), null, { timeout: 8000 });
  assert.ok(await page.evaluate(() => window.refreshClicks > 0), 'live status module must cause the refresh; the proof does not click Refresh');
  assert.equal(await page.locator('#proof-gate-form select[name=gateId]').inputValue(), 'merge');
  assert.equal(await page.locator('#proof-gate-form input[name=filesChanged]').inputValue(), 'src/index.ts');
  assert.match(await page.locator('[data-mission-live-status]').innerText(), /Live status/);

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert.equal(overflow, false, 'mission UX proof must not create document-level mobile overflow');
  await page.screenshot({ path: `${screenshotDir}/mobile-live-status.png`, fullPage: true });

  assert.equal(opaqueCookieObserved, true, 'mission UX proof must authenticate through the opaque founder cookie');
  assert.equal(bearerAuthorizationObserved, false, 'mission UX browser flow must not send bearer authorization');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('fcr_session')), null, 'proof must not manufacture a legacy browser bearer session');

  await context.clearCookies();
  await page.waitForSelector('#signed-out', { timeout: 8000 });
  assert.equal(await page.locator('#mission-detail').count(), 0, 'expired opaque session must remove the cached mission cockpit');
  assert.equal(await page.evaluate(() => window.signedOut), true, 'polling 401 must use the founder sign-out path');

  assert.equal(expectedUnauthorizedObserved, true, 'expired-session proof must observe the intentional dashboard 401');
  const unexpectedConsoleErrors = consoleErrors.filter((entry) => !(
    expectedUnauthorizedObserved
    && entry === 'Failed to load resource: the server responded with a status of 401 (Unauthorized)'
  ));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpectedConsoleErrors, []);
  console.log('Mission live UX Playwright proof passed: named and ID-only mission drafts survive shell, no-op tab, and polling re-renders; successful scopes clear only their committed drafts; polling uses only the opaque founder cookie; a polling 401 clears the cached cockpit through sign-out; external status appears without a founder Refresh click; live state is announced; and mobile has no document overflow.');
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
