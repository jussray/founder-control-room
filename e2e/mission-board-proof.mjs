import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(here, '../public/control-room/mission-board.js'), 'utf8');
const outputDir = resolve(here, '../test-results/mission-board');
const executable = source.replace('export function installMissionBoard()', 'function installMissionBoard()') + '\ninstallMissionBoard();\n';

const runs = {
  failed: [{ status: 'failed', finished_at: '2026-08-22T05:00:00Z' }],
  passed: [{ status: 'passed', finished_at: '2026-08-22T05:01:00Z' }],
  approved: [{ status: 'passed', finished_at: '2026-08-22T05:02:00Z' }],
};

const lanes = `
<div class="lane"><h4>proposed (1)</h4><div class="card" data-id="proposed"><div class="title">Proposed</div></div></div>
<div class="lane"><h4>in_review (2)</h4><div class="card" data-id="failed"><div class="title">Failed</div></div><div class="card" data-id="passed"><div class="title">Passed</div></div></div>
<div class="lane"><h4>approved (2)</h4><div class="card" data-id="approved"><div class="title">Approved</div></div><div class="card" data-id="unknown"><div class="title">Unknown</div></div></div>
<div class="lane"><h4>deployed (1)</h4><div class="card" data-id="deployed"><div class="title">Deployed</div></div></div>`;

function html() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#090b12;color:white;font-family:system-ui}.panel{padding:12px}.grid-lanes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.lane,.card{min-width:0;border:1px solid #333;padding:8px}.title{overflow-wrap:anywhere}@media(max-width:760px){.grid-lanes{grid-template-columns:1fr}}</style></head><body><div id="root"><div class="panel"><div id="mission-lanes" class="grid-lanes">${lanes}</div></div></div></body></html>`;
}

async function prove(browser, name, width, height, isMobile = false) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.route('http://mission-board.test/', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: html() });
  });
  await page.goto('http://mission-board.test/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((fixture) => {
    sessionStorage.setItem('fcr_session', JSON.stringify({ access_token: 'test-token' }));
    window.__reads = { tasks: 0, runs: 0 };
    window.fetch = async (input) => {
      const path = typeof input === 'string' ? input : input.url;
      if (path === '/dashboard/tasks') {
        window.__reads.tasks += 1;
        return { ok: false, status: 500, async json() { return {}; } };
      }
      const match = path.match(/^\/missions\/([^/]+)\/runs$/);
      if (match) {
        window.__reads.runs += 1;
        const id = decodeURIComponent(match[1]);
        if (id === 'unknown') return { ok: false, status: 503, async json() { return {}; } };
        return { ok: true, status: 200, async json() { return { runs: fixture[id] ?? [] }; } };
      }
      return { ok: false, status: 404, async json() { return {}; } };
    };
  }, runs);

  await page.addScriptTag({ content: executable });
  await page.locator('.mission-board-intel').waitFor({ state: 'visible' });

  const summary = await page.locator('.mission-board-intel').innerText();
  assert.match(summary, /Active work\s+5/i);
  assert.match(summary, /Proof passed\s+2/i);
  assert.match(summary, /Needs repair\s+1/i);
  assert.match(summary, /Founder gate\s+1/i);

  assert.match(await page.locator('[data-id="proposed"]').innerText(), /Proof not required yet/i);
  assert.match(await page.locator('[data-id="failed"]').innerText(), /Repair required/i);
  assert.match(await page.locator('[data-id="passed"]').innerText(), /Review gate/i);
  assert.match(await page.locator('[data-id="approved"]').innerText(), /Founder gate/i);
  assert.match(await page.locator('[data-id="unknown"]').innerText(), /Proof required/i);

  const first = await page.evaluate(() => window.__reads);
  assert.deepEqual(first, { tasks: 0, runs: 4 });

  await page.evaluate((markup) => {
    const replacement = document.createElement('div');
    replacement.id = 'mission-lanes';
    replacement.className = 'grid-lanes';
    replacement.innerHTML = markup;
    document.getElementById('mission-lanes').replaceWith(replacement);
  }, lanes);
  await page.locator('#mission-lanes[data-mission-board-state="ready"]').waitFor({ state: 'attached' });

  const second = await page.evaluate(() => window.__reads);
  assert.deepEqual(second, { tasks: 0, runs: 6 });

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.equal(dimensions.scroll, dimensions.width);
  assert.equal(pageErrors.length, 0);
  assert.equal(consoleErrors.length, 0);

  await mkdir(outputDir, { recursive: true });
  const screenshot = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();
  return { name, width, height, screenshot: `test-results/mission-board/${name}.png` };
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const viewports = [
    await prove(browser, 'desktop', 1440, 1000),
    await prove(browser, 'mobile', 390, 844, true),
  ];
  const receipt = { schemaVersion: 1, result: 'passed', generatedAt: new Date().toISOString(), viewports };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
