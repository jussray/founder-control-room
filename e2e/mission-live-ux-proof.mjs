import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const missionUxSource = readFileSync(new URL('../public/control-room/mission-live-ux.js', import.meta.url), 'utf8');
const screenshotDir = new URL('../test-results/mission-live-ux/', import.meta.url).pathname;
mkdirSync(screenshotDir, { recursive: true });

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
body{font:16px system-ui,sans-serif;margin:0;background:#0b1020;color:#e8eef8}.shell{max-width:960px;margin:auto;padding:24px}.tabs,.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.tabs button,.toolbar button{padding:9px 12px}.panel{margin-top:16px;padding:16px;border:1px solid #334155;border-radius:14px;background:#111827}.lane{padding:12px;border:1px solid #475569;border-radius:12px}.card{padding:10px;background:#1e293b;border-radius:10px}.muted{color:#a5b4c7}form{display:grid;gap:8px;margin-top:16px}input,select{width:100%;box-sizing:border-box;padding:9px}label{display:grid;gap:4px}.grid-lanes{display:grid;gap:10px}
</style>
</head>
<body>
<div id="root"></div>
<script>
const initialTask=${JSON.stringify(task())};
let currentTask=initialTask;
window.refreshClicks=0;
sessionStorage.setItem('fcr_session', JSON.stringify({access_token:'ux-proof-token',email:'founder@example.com'}));
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
function render(){
  document.querySelector('#root').innerHTML=\`
  <div class="shell">
    <div class="tabs"><button data-tab="missions" class="active">Missions</button><button data-tab="projects">Projects</button></div>
    <div class="panel">
      <div class="toolbar"><button id="refresh-missions">Refresh</button></div>
      <div class="grid-lanes" id="mission-lanes"><div class="lane"><h4>\${currentTask.status} (1)</h4><div class="card" data-id="\${currentTask.id}">\${currentTask.title}</div></div></div>
    </div>
    <div class="panel" id="mission-detail"><h2>\${currentTask.title}</h2><p class="muted">status: <strong>\${currentTask.status}</strong></p>\${proofFormHtml()}</div>
  </div>\`;
  document.querySelector('#refresh-missions').addEventListener('click', async()=>{
    window.refreshClicks+=1;
    const response=await fetch('/dashboard/tasks',{headers:{Authorization:'Bearer ux-proof-token'}});
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
    if (req.headers.authorization !== 'Bearer ux-proof-token') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ tasks: [task()] }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
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
page.on('pageerror', (error) => pageErrors.push(String(error)));
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

  await page.evaluate(() => window.forceFounderShellRerender());
  await page.waitForFunction(() => document.querySelector('#proof-gate-form select[name=gateId]')?.value === 'merge');
  assert.equal(await page.locator('#proof-gate-form input[name=filesChanged]').inputValue(), 'src/index.ts');
  assert.equal(await page.locator('#proof-gate-form input[name=checksRun]').inputValue(), 'unit_test, playwright');
  assert.equal(await page.locator('#proof-gate-form input[name=behaviorChanged]').inputValue(), 'Mission status is visible without manual refresh.');
  assert.equal(await page.locator('#proof-gate-form input[name=rollbackPath]').inputValue(), 'Revert the focused UX commits.');

  await page.screenshot({ path: `${screenshotDir}/desktop-draft-survives.png`, fullPage: true });

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

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log('Mission live UX Playwright proof passed: proof-gate input survives shell re-render, external mission status appears without a founder Refresh click, live state is announced, and mobile has no document overflow.');
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
