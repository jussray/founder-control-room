import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../src/http/routes/controlRoomUi.ts');
const outputDir = resolve(here, '../test-results/control-room-truth-receipt');

function extractTemplate(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `missing source marker: ${startMarker}`);
  const contentStart = start + startMarker.length;
  const end = source.indexOf(endMarker, contentStart);
  assert(end >= 0, `missing source marker: ${endMarker}`);
  return source.slice(contentStart, end);
}

const source = await readFile(sourcePath, 'utf8');
const dashboardHtml = extractTemplate(
  source,
  'const DASHBOARD_HTML = `',
  '`;\n\nconst LOGIN_JS',
);
const dashboardJs = extractTemplate(
  source,
  'const DASHBOARD_JS = `',
  '`;\n\nconst STYLES',
);
const styles = extractTemplate(
  source,
  'const STYLES = `',
  '`;\n\ncontrolRoomUiRouter.get("/login"',
);

const now = new Date().toISOString();
const freshUntil = new Date(Date.now() + 30 * 60_000).toISOString();
const staleObserved = new Date(Date.now() - 75 * 60_000).toISOString();

const repositories = [
  {
    slug: 'verified-repo',
    name: 'Verified Product',
    repository: { identifier: 'jussray/verified-product' },
    truth: {
      state: 'verified',
      freshness: 'fresh',
      confidence: 90,
      evidenceCompleteness: 100,
      ageMinutes: 2,
      recommendation: 'candidate-promote',
      blocker: null,
      nextAction: 'Keep observing until the next due verification; any promotion remains founder-gated.',
      freshUntil,
    },
    latestRun: { commit_sha: 'a'.repeat(40), overall_status: 'passed' },
    findings: { total: 0 },
    capabilities: { verified: 4, total: 4 },
  },
  {
    slug: 'attention-repo',
    name: 'Attention Product',
    repository: { identifier: 'jussray/attention-product' },
    truth: {
      state: 'attention',
      freshness: 'fresh',
      confidence: 65,
      evidenceCompleteness: 80,
      ageMinutes: 4,
      recommendation: 'review',
      blocker: 'Latest repository run is failed.',
      nextAction: 'Prepare one bounded repair mission for the highest-leverage verified blocker.',
      freshUntil,
    },
    latestRun: { commit_sha: 'b'.repeat(40), overall_status: 'failed' },
    findings: { total: 1 },
    capabilities: { verified: 3, total: 4 },
  },
  {
    slug: 'stale-repo',
    name: 'Stale Product',
    repository: { identifier: 'jussray/stale-product' },
    truth: {
      state: 'stale',
      freshness: 'stale',
      confidence: 40,
      evidenceCompleteness: 100,
      ageMinutes: 75,
      recommendation: 'hold',
      blocker: 'Evidence is 75 minutes old and exceeds the 30-minute freshness window.',
      nextAction: 'Verify now. Do not reuse the previous green or red claim.',
      freshUntil: staleObserved,
    },
    latestRun: { commit_sha: 'c'.repeat(40), overall_status: 'passed' },
    findings: { total: 0 },
    capabilities: { verified: 4, total: 4 },
  },
  {
    slug: 'unknown-repo',
    name: 'Unknown Product',
    repository: { identifier: 'jussray/unknown-product' },
    truth: {
      state: 'unknown',
      freshness: 'missing',
      confidence: 0,
      evidenceCompleteness: 0,
      ageMinutes: null,
      recommendation: 'hold',
      blocker: 'No repository verification receipt exists.',
      nextAction: 'Verify now before making a repository health claim.',
      freshUntil: null,
    },
    latestRun: null,
    findings: { total: 0 },
    capabilities: { verified: 0, total: 0 },
  },
];

const detailPayload = {
  project: {
    name: 'Verified Product',
    repo_identifier: 'jussray/verified-product',
  },
  latestRun: {
    overall_status: 'passed',
    commit_sha: 'a'.repeat(40),
    branch: 'main',
    source: 'repo_ping',
    received_at: now,
    checks: [
      { name: 'CI', status: 'passed' },
      { name: 'Playwright E2E', status: 'passed' },
    ],
  },
  capabilities: [
    {
      capability_id: 'truth-receipts',
      observed_status: 'verified',
      claimed_status: 'active',
      reason: 'Fresh exact-head evidence.',
    },
  ],
  findings: [],
};

function installFetchFixtureScript(page) {
  return page.evaluate(({ repositoriesFixture, detailFixture, generatedAt }) => {
    window.alert = () => {};
    window.fetch = async (input) => {
      const path = typeof input === 'string' ? input : input.url;
      let payload;
      let status = 200;
      if (path === '/portfolio/repositories') {
        payload = { repositories: repositoriesFixture, generatedAt };
      } else if (path === '/projects/verified-repo/verification') {
        payload = detailFixture;
      } else {
        status = 404;
        payload = { error: 'fixture_not_found' };
      }
      return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return payload; },
      };
    };
  }, { repositoriesFixture: repositories, detailFixture: detailPayload, generatedAt: now });
}

async function proveViewport(browser, { name, width, height, isMobile = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile,
    hasTouch: isMobile,
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.setContent(dashboardHtml, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: styles });
  await installFetchFixtureScript(page);
  await page.addScriptTag({ content: dashboardJs });

  await page.locator('.repository-card').first().waitFor({ state: 'visible' });
  assert.equal(await page.locator('.repository-card').count(), 4, `${name}: four portfolio truth states render`);

  const summaryText = await page.locator('#summary').innerText();
  assert.match(summaryText, /Verified\s+1/i, `${name}: verified summary is explicit`);
  assert.match(summaryText, /Attention\s+1/i, `${name}: attention summary is explicit`);
  assert.match(summaryText, /Stale\s+1/i, `${name}: stale summary is explicit`);
  assert.match(summaryText, /Unknown\s+1/i, `${name}: unknown summary is explicit`);

  const staleCard = page.locator('.repository-card[data-status="stale"]');
  assert.equal(await staleCard.count(), 1, `${name}: stale truth cannot masquerade as verified`);
  assert.match(await staleCard.innerText(), /75m old/i, `${name}: evidence age is founder-visible`);

  await page.locator('.repository-card[data-status="verified"]').click();
  await page.locator('.truth-receipt').waitFor({ state: 'visible' });
  const receiptText = await page.locator('.truth-receipt').innerText();
  assert.match(receiptText, /Truth Receipt/i, `${name}: decision receipt leads the detail view`);
  assert.match(receiptText, /Confidence\s+90%/i, `${name}: confidence is visible`);
  assert.match(receiptText, /Evidence\s+100% complete/i, `${name}: evidence completeness is visible`);
  assert.match(receiptText, /Next gate:/i, `${name}: next founder gate is visible`);
  assert.match(receiptText, /founder-gated/i, `${name}: promotion authority remains bounded`);

  const receiptIndex = await page.locator('#repository-detail').evaluate((root) => {
    const children = Array.from(root.children);
    return {
      receipt: children.findIndex((node) => node.classList.contains('truth-receipt')),
      checks: children.findIndex((node) => node.textContent?.includes('Required checks')),
    };
  });
  assert(receiptIndex.receipt >= 0 && receiptIndex.receipt < receiptIndex.checks, `${name}: decision receipt appears before raw checks`);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, `${name}: page must not overflow viewport`);
  assert.equal(pageErrors.length, 0, `${name}: no page errors`);
  assert.equal(consoleErrors.length, 0, `${name}: no console errors`);

  await mkdir(outputDir, { recursive: true });
  const screenshot = resolve(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return {
    name,
    viewport: { width, height },
    screenshot: `test-results/control-room-truth-receipt/${name}.png`,
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
    source: 'src/http/routes/controlRoomUi.ts',
    viewports,
  };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser.close();
}
