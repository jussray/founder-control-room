import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '../test-results/founder-switchboard');
const htmlPath = resolve(here, '../public/control-room/switchboard.html');
const cssPath = resolve(here, '../public/control-room/switchboard.css');
const jsPath = resolve(here, '../public/control-room/switchboard.js');

const html = (await readFile(htmlPath, 'utf8'))
  .replace('<link rel="stylesheet" href="/control-room/switchboard.css" />', '')
  .replace('<script type="module" src="/control-room/switchboard.js"></script>', '');
const css = await readFile(cssPath, 'utf8');
const js = await readFile(jsPath, 'utf8');

const FCR_SHA = 'a'.repeat(40);
const SEKRET_AUDIT_SHA = 'b'.repeat(40);
const SEKRET_CURRENT_SHA = 'c'.repeat(40);
const now = new Date().toISOString();

const switches = [
  {
    id: 'fcr-privileged-execution-master',
    project: 'Founder Control Room',
    repository: 'jussray/founder-control-room',
    label: 'Privileged execution master',
    summary: 'Master FCR gate in front of privileged mission execution. OFF is a real server-side kill switch.',
    group: 'authority',
    controlMode: 'enforced',
    defaultDesiredState: 'on',
    desiredState: 'on',
    override: false,
    stages: { built: 'yes', configured: 'yes', active: 'yes', proven: 'partial' },
    auditedSha: FCR_SHA,
    auditedAt: now,
    evidenceRef: 'src/http/server.ts + V10 approval binding',
    blocker: 'Production exact-SHA runtime remains separately unproven.',
    offEffect: 'Blocks privileged mission execution before work can run.',
    onCondition: 'Re-enable only after the intended execution lane remains healthy and separately authorized.',
    reason: null,
    updatedBy: null,
    updatedAt: null,
  },
  {
    id: 'fcr-cloudflare-production-authority',
    project: 'Founder Control Room',
    repository: 'jussray/founder-control-room',
    label: 'Cloudflare production authority',
    summary: 'Credential and provider gate for canonical production deployment.',
    group: 'authority',
    controlMode: 'observe_only',
    defaultDesiredState: 'on',
    desiredState: 'on',
    override: false,
    stages: { built: 'yes', configured: 'no', active: 'no', proven: 'no' },
    auditedSha: FCR_SHA,
    auditedAt: now,
    evidenceRef: 'issue #182',
    blocker: 'Production environment credential is unavailable.',
    offEffect: 'Records production authority as undesired without changing Cloudflare.',
    onCondition: 'Provider credential and exact-head runtime proof must pass.',
    reason: null,
    updatedBy: null,
    updatedAt: null,
  },
  {
    id: 'sekret-pages-front-door',
    project: 'Se’kret Bip',
    repository: 'jussray/Sekret-Bip',
    label: 'app.sekretbip.net Pages ownership',
    summary: 'Pages owns the app hostname while the API stays on the canonical Worker.',
    group: 'runtime',
    controlMode: 'observe_only',
    defaultDesiredState: 'on',
    desiredState: 'on',
    override: false,
    stages: { built: 'yes', configured: 'partial', active: 'no', proven: 'no' },
    auditedSha: SEKRET_AUDIT_SHA,
    auditedAt: now,
    evidenceRef: 'provider reconcile receipt',
    blocker: 'Cloudflare inspection was rejected before mutation.',
    offEffect: 'Records the app front door as undesired without changing provider bindings.',
    onCondition: 'Exact-host reconcile plus production browser proof must pass.',
    reason: null,
    updatedBy: null,
    updatedAt: null,
  },
  {
    id: 'sekret-store-release',
    project: 'Se’kret Bip',
    repository: 'jussray/Sekret-Bip',
    label: 'App Store + Google Play release',
    summary: 'Consumer distribution gate covering trust, real-device QA and exact submitted build proof.',
    group: 'distribution',
    controlMode: 'locked_off',
    defaultDesiredState: 'off',
    desiredState: 'off',
    override: false,
    stages: { built: 'partial', configured: 'partial', active: 'no', proven: 'no' },
    auditedSha: SEKRET_AUDIT_SHA,
    auditedAt: now,
    evidenceRef: 'issue #420',
    blocker: 'Store-readiness packet is incomplete.',
    offEffect: 'Keeps store submission outside the authorized release state.',
    onCondition: 'The evidence-complete store gate must change this lock in code first.',
    reason: null,
    updatedBy: null,
    updatedAt: null,
  },
];

const portfolio = {
  repositories: [
    { repository: { identifier: 'jussray/founder-control-room' }, latestRun: { commit_sha: FCR_SHA } },
    { repository: { identifier: 'jussray/Sekret-Bip' }, latestRun: { commit_sha: SEKRET_CURRENT_SHA } },
  ],
};

function installFetchFixture(page) {
  return page.evaluate(({ switchFixture, portfolioFixture, generatedAt }) => {
    const mutable = structuredClone(switchFixture);
    window.fetch = async (input, init = {}) => {
      const path = typeof input === 'string' ? input : input.url;
      const method = String(init.method || 'GET').toUpperCase();
      let status = 200;
      let body = {};

      if (path === '/switchboard' && method === 'GET') {
        body = {
          switches: mutable,
          generatedAt,
          semantics: {
            enforced: 'FCR blocks its own governed execution when this desired state is OFF.',
            observe_only: 'FCR records founder intent only. The external provider is not mutated by this switch.',
            locked_off: 'This capability cannot be enabled from the UI until its code-reviewed activation gate changes.',
          },
        };
      } else if (path === '/portfolio/repositories' && method === 'GET') {
        body = portfolioFixture;
      } else if (path.startsWith('/switchboard/') && path.endsWith('/history') && method === 'GET') {
        body = { history: [] };
      } else if (path.startsWith('/switchboard/') && method === 'PATCH') {
        const id = decodeURIComponent(path.slice('/switchboard/'.length));
        const index = mutable.findIndex(item => item.id === id);
        if (index < 0) {
          status = 404;
          body = { error: 'unknown_switch' };
        } else {
          const parsed = JSON.parse(String(init.body || '{}'));
          mutable[index] = {
            ...mutable[index],
            desiredState: parsed.desiredState,
            override: true,
            reason: parsed.reason || null,
            updatedBy: 'founder@example.com',
            updatedAt: generatedAt,
          };
          body = { switch: mutable[index] };
        }
      } else {
        status = 404;
        body = { error: 'fixture_not_found', path, method };
      }

      return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return body; },
      };
    };
  }, { switchFixture: switches, portfolioFixture: portfolio, generatedAt: now });
}

async function proveViewport(browser, { name, width, height, isMobile = false }) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: css });
  // This isolated visual fixture intentionally has no real storage origin.
  // switchboard.js already treats an unavailable sessionStorage as no token,
  // and the mocked fetch layer below is the auth-independent UI seam. Founder
  // authorization itself is covered by the real API integration tests.
  await installFetchFixture(page);
  await page.addScriptTag({ content: js, type: 'module' });

  await page.getByRole('heading', { name: 'Founder Switchboard' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.switch-card').count(), 3, `${name}: non-master switch cards render`);
  assert.equal(await page.locator('.master-card').count(), 1, `${name}: master execution switch renders separately`);

  const master = page.locator('.master-card');
  assert.match(await master.innerText(), /FCR ENFORCED/i, `${name}: master clearly names real enforcement`);
  assert.match(await master.innerText(), /Privileged execution master/i, `${name}: master label is visible`);

  const stageText = await page.locator('[data-switch-id="fcr-cloudflare-production-authority"] .stage-grid').innerText();
  assert.match(stageText, /BUILT\s+YES/i, `${name}: built state is explicit`);
  assert.match(stageText, /CONFIGURED\s+NO/i, `${name}: configured state is explicit`);
  assert.match(stageText, /ACTIVE\s+NO/i, `${name}: active state is explicit`);
  assert.match(stageText, /PROVEN\s+NO/i, `${name}: proven state is explicit`);

  const stale = page.locator('[data-switch-id="sekret-pages-front-door"]');
  assert.equal(await stale.getAttribute('data-audit'), 'stale', `${name}: changed main invalidates the old audit snapshot`);
  assert.match(await stale.innerText(), /Main moved since audit/i, `${name}: stale audit is visible in words`);
  assert.match(await stale.innerText(), new RegExp(SEKRET_CURRENT_SHA), `${name}: current receipt SHA is shown next to stale audit SHA`);

  const lockedToggle = page.locator('[data-switch-toggle="sekret-store-release"]');
  assert.equal(await lockedToggle.isDisabled(), true, `${name}: locked-off release cannot be enabled from UI`);
  assert.match(await page.locator('[data-switch-id="sekret-store-release"]').innerText(), /OFF · locked/i, `${name}: locked state is not color-only`);

  const masterToggle = page.locator('[data-switch-toggle="fcr-privileged-execution-master"]');
  const targetBox = await masterToggle.boundingBox();
  assert(targetBox && targetBox.width >= 44 && targetBox.height >= 44, `${name}: physical switch target is at least 44x44`);
  assert.equal(await masterToggle.getAttribute('aria-checked'), 'true', `${name}: master starts ON`);

  await masterToggle.click();
  await page.locator('#switch-confirm[open]').waitFor({ state: 'visible' });
  assert.equal(await masterToggle.getAttribute('aria-checked'), 'true', `${name}: tapping does not mutate before confirmation`);
  assert.match(await page.locator('#confirm-boundary').innerText(), /real Founder Control Room execution gate/i, `${name}: confirmation explains enforced consequence`);
  await page.locator('#switch-reason').fill('Founder pause for proof review.');
  await page.locator('#confirm-submit').click();
  await page.locator('#switch-confirm').waitFor({ state: 'hidden' });
  const changedMaster = page.locator('[data-switch-toggle="fcr-privileged-execution-master"]');
  assert.equal(await changedMaster.getAttribute('aria-checked'), 'false', `${name}: confirmed state becomes OFF`);
  assert.match(await page.locator('.master-card').innerText(), /Desired OFF/i, `${name}: physical state copy updates`);

  const observeToggle = page.locator('[data-switch-toggle="fcr-cloudflare-production-authority"]');
  await observeToggle.click();
  await page.locator('#switch-confirm[open]').waitFor({ state: 'visible' });
  assert.match(await page.locator('#confirm-boundary').innerText(), /Cloudflare, Supabase, Shopify, GitHub, n8n/i, `${name}: observe-only confirmation denies provider mutation`);
  await page.locator('.secondary-button').click();
  await page.locator('#switch-confirm').waitFor({ state: 'hidden' });
  assert.equal(await observeToggle.getAttribute('aria-checked'), 'true', `${name}: cancel preserves state`);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${name}: page has no horizontal overflow`);
  assert.equal(pageErrors.length, 0, `${name}: no page errors`);
  assert.equal(consoleErrors.length, 0, `${name}: no console errors`);

  await mkdir(outputDir, { recursive: true });
  const screenshot = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return {
    name,
    viewport: { width, height },
    screenshot: `test-results/founder-switchboard/${name}.png`,
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
    source: 'public/control-room/switchboard.html',
    assertions: [
      'master execution switch is visibly FCR-enforced',
      'tap requires explicit confirmation before mutation',
      'locked-off switches cannot be enabled',
      'observe-only controls deny provider mutation',
      'BUILT / CONFIGURED / ACTIVE / PROVEN are explicit text states',
      'stale exact-head audit is visible when repository evidence moves',
      'desktop and mobile have no horizontal overflow',
    ],
    viewports,
  };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}