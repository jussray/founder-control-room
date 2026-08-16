import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, '../test-results/security-posture');
const htmlPath = resolve(here, '../public/control-room/security.html');
const cssPath = resolve(here, '../public/control-room/security.css');
const jsPath = resolve(here, '../public/control-room/security.js');

const html = (await readFile(htmlPath, 'utf8'))
  .replace('<link rel="stylesheet" href="/control-room/security.css" />', '')
  .replace('<script type="module" src="/control-room/security.js"></script>', '');
const css = await readFile(cssPath, 'utf8');
const js = await readFile(jsPath, 'utf8');

const stageNames = [
  'Inventory and Ownership',
  'Identity and Secure Defaults',
  'Least Privilege and Authorization',
  'Application and Resource Firewall',
  'Telemetry and Evidence',
  'Segmentation and Containment',
  'Supply Chain and Deployment Provenance',
  'Incident Response and Lantern',
  'Adaptive Correlation and Resilience',
  'Governed Security Autonomy',
];

const stages = stageNames.map((name, index) => ({
  version: index + 1,
  name,
  objective: `Required V${index + 1} security objective.`,
  controls: [`control-${index + 1}-a`, `control-${index + 1}-b`],
  frameworkSignals: [`FRAMEWORK-${index + 1}`],
}));

const projects = [
  ['sekret-bip', 'Se’kret Bip', 'jussray/Sekret-Bip', 10, true],
  ['juss-beautiful-hair', 'Juss Beautiful Hair Storefront', 'jussray/jussbeautifulhair-site', 9, true],
  ['jbh-private', 'Juss Beautiful Hair Private Operations', 'jussray/jbh-private', 9, false],
  ['l99', 'L99 StoryEngine', 'jussray/StoryEngine', 8, false],
  ['chief-ai-machine', 'Chief AI Prompt Machine', 'jussray/chief-ai-machine', 10, false],
  ['untold-stories', 'Untold Stories Storefront', 'jussray/untold-stories-storefront', 9, true],
  ['founder-control-room', 'Founder Control Room', 'jussray/founder-control-room', 10, false],
  ['promptos', 'PromptOS', 'jussray/promptos', 9, false],
].map(([slug, name, repository, targetVersion, playwright]) => ({
  slug,
  name,
  repository,
  targetVersion,
  assessmentState: 'target_only',
  provenVersion: null,
  capabilities: playwright ? ['playwright', 'sample-capability'] : ['sample-capability'],
  reasons: [`V${targetVersion} is required by registered project capabilities.`],
  requiredProof: [
    'authoritative repository and exact head',
    'security-relevant tests for changed controls',
    ...(playwright ? ['Playwright evidence for UI/runtime claims'] : []),
  ],
  requiredStageCount: targetVersion,
  requiredControlCount: Number(targetVersion) * 2,
}));

const fixture = {
  contract: 'juss-v10/security-posture@v1',
  generatedAt: '2026-08-16T06:30:00.000Z',
  summary: {
    totalProjects: 8,
    v8Targets: 1,
    v9Targets: 4,
    v10Targets: 3,
    playwrightRequiredProjects: 3,
    totalStageObligations: 74,
    uniqueControlCount: 57,
    frameworkSignalCount: 23,
    provenProjects: 0,
  },
  stages,
  projects,
  invariants: { noHackBack: true, noHumanIdentityClaimFromNetworkSignal: true },
  lantern: {
    valid: true,
    errors: [],
    policy: {
      isolated: true,
      realDataAllowed: false,
      realSecretsAllowed: false,
      productionAuthorityAllowed: false,
      outboundAttackCapabilityAllowed: false,
      lateralMovementAllowed: false,
      malwareAllowed: false,
      hackBackAllowed: false,
      humanIdentityClaimFromNetworkSignalAllowed: false,
      timeBounded: true,
      auditLoggingRequired: true,
      evidenceIntegrityRequired: true,
    },
  },
  truthBoundaries: {
    targetVersionIsNotCurrentMaturity: true,
    frameworkMappingIsNotCertification: true,
    providerClaimsRequireRuntimeEvidence: true,
    securityPostureIsReadOnly: true,
    analyticsAreAggregateAndPrivacySafe: true,
    noHumanIdentityClaimFromNetworkSignal: true,
  },
};

async function installFetchFixture(page) {
  await page.evaluate((securityFixture) => {
    window.fetch = async (input) => {
      const path = typeof input === 'string' ? input : input.url;
      const status = path === '/security-posture' ? 200 : 404;
      const body = status === 200 ? securityFixture : { error: 'fixture_not_found' };
      return {
        ok: status === 200,
        status,
        async json() { return body; },
      };
    };
  }, fixture);
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
  await installFetchFixture(page);
  await page.addScriptTag({ content: js, type: 'module' });

  await page.getByRole('heading', { name: 'Security posture without the green-check theater.' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.stage-card').count(), 10, `${name}: V1-V10 ladder renders all stages`);
  assert.equal(await page.locator('.project-card').count(), 8, `${name}: registered portfolio renders all project cards`);
  assert.equal(await page.locator('.project-card[data-target-version="10"]').count(), 3, `${name}: V10 target count is visible`);
  assert.equal(await page.locator('.target-badge span', { hasText: 'NOT PROVEN' }).count(), 8, `${name}: every project denies maturity proof`);
  assert.match(await page.locator('.truth-grid').innerText(), /TARGET ≠ PROOF/i, `${name}: target/proof boundary is visible`);
  assert.match(await page.locator('.truth-grid').innerText(), /FRAMEWORK ≠ CERTIFICATION/i, `${name}: framework/certification boundary is visible`);
  assert.match(await page.locator('.lantern-panel').innerText(), /Hack-back forbidden/i, `${name}: Lantern denies hack-back`);
  assert.match(await page.locator('.lantern-panel').innerText(), /Outbound attack forbidden/i, `${name}: Lantern denies outbound attack capability`);
  assert.match(await page.locator('.lantern-panel').innerText(), /Human attribution constrained/i, `${name}: network signals cannot become human identity claims`);
  assert.equal(await page.locator('button').count(), 0, `${name}: read-only posture surface has no mutation controls`);
  assert.match(await page.locator('.analytics-grid').innerText(), /Maturity-proven projects\s+0/i, `${name}: analytics does not invent proof`);

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
    screenshot: `test-results/security-posture/${name}.png`,
    pageErrors,
    consoleErrors,
  };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const results = [];
  results.push(await proveViewport(browser, { name: 'desktop', width: 1440, height: 1000 }));
  results.push(await proveViewport(browser, { name: 'mobile', width: 390, height: 844, isMobile: true }));

  const receipt = {
    contract: 'juss-v10/security-posture-playwright-proof@v1',
    verified: true,
    assertions: {
      stages: 10,
      projects: 8,
      v10Targets: 3,
      allProjectsMarkedNotProven: true,
      mutationControls: 0,
      lanternNoHackBack: true,
      lanternNoOutboundAttack: true,
      lanternNoHumanAttributionFromNetworkSignal: true,
    },
    viewports: results,
  };
  await writeFile(resolve(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
}
