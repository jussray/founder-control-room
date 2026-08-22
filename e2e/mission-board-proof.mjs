import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../public/control-room/mission-board.js');
const outputDir = resolve(here, '../test-results/mission-board');
const source = await readFile(sourcePath, 'utf8');
const executable = source.replace('export function installMissionBoard()', 'function installMissionBoard()') + '\ninstallMissionBoard();\n';

const tasks = [
  {
    id: 'm-proposed',
    title: 'Repair provider witness',
    status: 'proposed',
    risk_level: 'high',
    updated_at: '2026-08-22T04:55:00.000Z',
    project: { slug: 'sekret-bip', name: "Se’kret Bip" },
  },
  {
    id: 'm-review',
    title: 'Review exact-head authority',
    status: 'in_review',
    risk_level: 'medium',
    updated_at: '2026-08-22T04:56:00.000Z',
    project: { slug: 'founder-control-room', name: 'Founder Control Room' },
  },
  {
    id: 'm-approved',
    title: 'Promote reviewed release',
    status: 'approved',
    risk_level: 'low',
    updated_at: '2026-08-22T04:57:00.000Z',
    project: { slug: 'storyengine', name: 'StoryEngine' },
  },
  {
    id: 'm-approved-unknown',
    title: 'Hold release with unavailable proof',
    status: 'approved',
    risk_level: 'high',
    updated_at: '2026-08-22T04:57:30.000Z',
    project: { slug: 'sekret-bip', name: "Se’kret Bip" },
  },
  {
    id: 'm-deployed',
    title: 'Observe production truth',
    status: 'deployed',
    risk_level: 'low',
    updated_at: '2026-08-22T04:58:00.000Z',
    project: { slug: 'chief-ai-machine', name: 'Chief AI Machine' },
  },
];

const runs = {
  'm-proposed': [{ status: 'failed', started_at: '2026-08-22T04:50:00.000Z', finished_at: '2026-08-22T04:51:00.000Z' }],
  'm-review': [{ status: 'passed', started_at: '2026-08-22T04:50:00.000Z', finished_at: '2026-08-22T04:52:00.000Z' }],
  'm-approved': [{ status: 'passed', started_at: '2026-08-22T04:53:00.000Z', finished_at: '2026-08-22T04:54:00.000Z' }],
};

function laneMarkup() {
  const lanes = [
    ['proposed', [['m-proposed', 'Repair provider witness']]],
    ['in_review', [['m-review', 'Review exact-head authority']]],
    ['approved', [
      ['m-approved', 'Promote reviewed release'],
      ['m-approved-unknown', 'Hold release with unavailable proof'],
    ]],
    ['deployed', [['m-deployed', 'Observe production truth']]],
  ];
  return lanes.map(([lane, cards]) => `<div class="lane"><h4>${lane}</h4>${cards.map(([id, title]) => `<div class="card" data-id="${id}"><div class="title">${title}</div></div>`).join('')}</div>`).join('');
}

function boardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;background:#090b12;color:#f8fafc;font-family:system-ui,sans-serif}.shell{padding:18px}.panel{max-width:1200px;margin:0 auto;padding:14px;border:1px solid #2b3043;border-radius:16px;background:#121521}.grid-lanes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.lane{min-width:0;padding:10px;border:1px solid #2b3043;border-radius:12px}.card{min-width:0;padding:10px;border:1px solid #343b52;border-radius:10px;background:#0c0f18}.title{overflow-wrap:anywhere}@media(max-width:760px){.grid-lanes{grid-template-columns:1fr}.shell{padding:10px}}
</style>
</head>
<body>
<div id="root" class="shell">
  <div class="panel">
    <div class="grid-lanes" id="mission-lanes">${laneMarkup()}</div>
  </div>
</div>
</body>
</html>`;
}

async function proveViewport(browser, { name, width, height, isMobile = false }) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.setContent(boardHtml(), { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ tasksFixture, runsFixture }) => {
    sessionStorage.setItem('fcr_session', JSON.stringify({ access_token: 'founder-test-token', email: 'founder@example.com' }));
    window.__missionBoardFetchCounts = { tasks: 0, runs: 0 };
    window.fetch = async (input, options = {}) => {
      const path = typeof input === 'string' ? input : input.url;
      const auth = options.headers?.Authorization ?? options.headers?.authorization ?? '';
      if (auth !== 'Bearer founder-test-token') {
        return { ok: false, status: 401, async json() { return { error: 'unauthorized' }; } };
      }
      if (path === '/dashboard/tasks') {
        window.__missionBoardFetchCounts.tasks += 1;
        return { ok: true, status: 200, async json() { return { tasks: tasksFixture }; } };
      }
      const match = path.match(/^\/missions\/([^/]+)\/runs$/);
      if (match) {
        window.__missionBoardFetchCounts.runs += 1;
        const id = decodeURIComponent(match[1]);
        if (id === 'm-approved-unknown') {
          return { ok: false, status: 503, async json() { return { error: 'bench_unavailable' }; } };
        }
        return { ok: true, status: 200, async json() { return { runs: runsFixture[id] ?? [] }; } };
      }
      return { ok: false, status: 404, async json() { return { error: 'fixture_not_found' }; } };
    };
  }, { tasksFixture: tasks, runsFixture: runs });

  await page.addScriptTag({ content: executable });
  const panel = page.locator('.mission-board-intel');
  await panel.waitFor({ state: 'visible' });

  const text = await panel.innerText();
  assert.match(text, /Evidence-aware mission board/i, `${name}: mission intelligence header renders`);
  assert.match(text, /Truth projection/i, `${name}: board declares read-only truth mode`);
  assert.match(text, /Active work\s+4/i, `${name}: active work count is correct`);
  assert.match(text, /Proof passed\s+2/i, `${name}: passed proof count is correct`);
  assert.match(text, /Needs repair\s+1/i, `${name}: failed proof count is correct`);
  assert.match(text, /Founder gate\s+1/i, `${name}: only approved work with passing proof reaches the founder gate`);
  assert.match(text, /cannot grant merge, deploy, secret, or destructive authority/i, `${name}: authority boundary is explicit`);

  const proposed = page.locator('.card[data-id="m-proposed"]');
  assert.match(await proposed.innerText(), /Proof failed/i, `${name}: failed Bench proof is visible on the mission card`);
  assert.match(await proposed.innerText(), /Repair required/i, `${name}: failed proof produces repair authority state`);
  assert.match(await proposed.innerText(), /Repair failed proof before advancing/i, `${name}: failed proof gets a bounded next gate`);

  const review = page.locator('.card[data-id="m-review"]');
  assert.match(await review.innerText(), /Proof passed/i, `${name}: exact proof success is visible`);
  assert.match(await review.innerText(), /Review gate/i, `${name}: passing in-review work points to independent review`);

  const approved = page.locator('.card[data-id="m-approved"]');
  assert.match(await approved.innerText(), /Founder gate/i, `${name}: approved work with passing proof remains founder-gated`);
  assert.match(await approved.innerText(), /Founder decides whether to integrate/i, `${name}: founder authority is preserved`);

  const approvedUnknown = page.locator('.card[data-id="m-approved-unknown"]');
  assert.match(await approvedUnknown.innerText(), /Proof unknown/i, `${name}: unavailable Bench proof stays visibly unknown`);
  assert.match(await approvedUnknown.innerText(), /Proof required/i, `${name}: unavailable proof cannot masquerade as a founder integration gate`);
  assert.match(await approvedUnknown.innerText(), /Reacquire fresh exact-head proof before the founder can consider integration/i, `${name}: missing proof fails closed before integration`);

  const initialFetchCounts = await page.evaluate(() => window.__missionBoardFetchCounts);
  assert.equal(initialFetchCounts.tasks, 1, `${name}: one current task-board read powers the projection`);
  assert.equal(initialFetchCounts.runs, 4, `${name}: only active mission Bench proof is read`);

  await page.evaluate((lanes) => {
    const current = document.getElementById('mission-lanes');
    const replacement = document.createElement('div');
    replacement.id = 'mission-lanes';
    replacement.className = 'grid-lanes';
    replacement.innerHTML = lanes;
    current.replaceWith(replacement);
  }, laneMarkup());
  await page.locator('#mission-lanes[data-mission-board-state="ready"]').waitFor({ state: 'attached' });

  const rerenderFetchCounts = await page.evaluate(() => window.__missionBoardFetchCounts);
  assert.equal(rerenderFetchCounts.tasks, 2, `${name}: SPA rerender reacquires current task state`);
  assert.equal(rerenderFetchCounts.runs, 5, `${name}: SPA rerender reuses cached proof and retries only the unavailable proof read`);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${name}: board must not overflow the viewport`);
  assert.equal(pageErrors.length, 0, `${name}: no page errors`);
  assert.equal(consoleErrors.length, 0, `${name}: no console errors`);

  await mkdir(outputDir, { recursive: true });
  const screenshot = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return {
    name,
    viewport: { width, height },
    screenshot: `test-results/mission-board/${name}.png`,
    pageErrors,
    consoleErrors,
  };
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const viewports = [];
  viewports.push(await proveViewport(browser, { name: 'desktop', width: 1440, height: 1000 }));
  viewports.push(await proveViewport(browser, { name: 'mobile', width: 390, height: 844, isMobile: true }));

  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    result: 'passed',
    source: 'public/control-room/mission-board.js',
    viewports,
  };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}