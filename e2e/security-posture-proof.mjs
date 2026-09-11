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
  ['juss-beautiful-hair-private', 'Juss Beautiful Hair Private Operations', 'jussray/jbh-private', 9, false],
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

const STALE_REASON = 'Static source observation lease expired; revalidate the exact source revision before treating this entry as current.';
const OBSERVED_AT = '2026-09-11T01:18:30.000Z';

const cryptographicInventory = [
  ['fcr-github-app-rs256', 'founder-control-room', 'Authenticate GitHub App', 'RSA digital signature over JWT', 'RS256 / RSA-SHA256', 'GitHub protocol', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'not-confidentiality-control', '81d05f7ae8f427e84db506cfa726520a8178dece'],
  ['fcr-founder-session-aes256gcm', 'founder-control-room', 'Encrypt founder credentials', 'authenticated symmetric encryption', 'AES-256-GCM', 'FCR / Cloudflare secret plane', 'SYMMETRIC_MONITOR', 'stored-secret', '81d05f7ae8f427e84db506cfa726520a8178dece'],
  ['sekret-supabase-auth-jwks', 'sekret-bip', 'Verify Supabase user tokens', 'provider-issued JWT', 'provider-selected asymmetric JWT', 'Supabase Auth', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'short-lived-auth', '2ab8fefa365eac4a2fac297447f277243a8ec5e7'],
  ['sekret-firebase-appcheck-rs256', 'sekret-bip', 'Verify Firebase App Check', 'RSA digital signature over JWT', 'RS256', 'Firebase / Google', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'not-confidentiality-control', '2ab8fefa365eac4a2fac297447f277243a8ec5e7'],
  ['jbh-private-cloudflare-access-rs256', 'juss-beautiful-hair-private', 'Verify Cloudflare Access owner assertions', 'RSA digital signature over JWT', 'RS256', 'Cloudflare Access', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'short-lived-auth', 'a5538c1ab7907283f373578e13d7c75d44757969'],
  ['storyengine-supabase-service-role', 'l99', 'Authenticate bounded persistence writes', 'provider-managed opaque service credential', 'provider-managed', 'Supabase', 'PROVIDER_MANAGED_UNKNOWN', 'provider-managed-unknown', 'b9410a75f0e36cfc159bc1b6b31fb86e60c107fd'],
  ['untold-shopify-webhook-hmac', 'untold-stories', 'Authenticate Shopify order webhooks', 'message authentication code', 'HMAC-SHA-256', 'Shopify', 'SYMMETRIC_MONITOR', 'not-confidentiality-control', 'fde1ce62089466377965d21edaea80de043b87cb'],
].map(([id, projectSlug, purpose, primitive, algorithm, provider, quantumMigrationClass, confidentialityHorizon, sourceRevision]) => ({
  id,
  projectSlug,
  purpose,
  primitive,
  algorithm,
  observationState: 'STALE',
  provider,
  migrationAuthority: `${provider} and application ownership are explicitly separated.`,
  quantumMigrationClass,
  confidentialityHorizon,
  sourceEvidence: `${projectSlug}:source-evidence`,
  sourceRevision,
  observedAt: OBSERVED_AT,
  freshnessExpiresAt: OBSERVED_AT,
  staleReason: STALE_REASON,
}));

const cryptographicReviewRequired = [
  ['chief-ai-machine', 'Canonical runtime public-key boundary not proven.'],
  ['juss-beautiful-hair', 'Provider-owned storefront crypto requires deeper evidence.'],
  ['promptos', 'Canonical runtime auth/signing primitive not proven.'],
].map(([projectSlug, reason]) => ({
  projectSlug,
  reason,
  nextEvidence: `Collect the next provider or runtime evidence for ${projectSlug}.`,
}));

const fixture = {
  contract: 'juss-v10/security-posture@v1',
  generatedAt: '2026-09-11T01:30:00.000Z',
  summary: {
    totalProjects: 8,
    v8Targets: 1,
    v9Targets: 4,
    v10Targets: 3,
    playwrightRequiredProjects: 3,
    totalStageObligations: 74,
    uniqueControlCount: 62,
    frameworkSignalCount: 23,
    cryptographicInventoryEntries: 7,
    cryptographicReviewRequiredProjects: 3,
    publicKeyMigrationEntries: 4,
    provenProjects: 0,
  },
  stages,
  projects,
  invariants: { noHackBack: true, noHumanIdentityClaimFromNetworkSignal: true },
  cryptography: {
    inventory: cryptographicInventory,
    reviewRequired: cryptographicReviewRequired,
    coverage: {
      activeProjectCount: 8,
      representedProjectCount: 8,
      inventoryEntryCount: 7,
      reviewRequiredProjectCount: 3,
      publicKeyMigrationEntryCount: 4,
      missingProjectSlugs: [],
      overlappingProjectSlugs: [],
    },
  },
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
    cryptographicInventoryIsObservationNotQuantumSafety: true,
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
  assert.equal(await page.locator('.project-card:not(.crypto-entry-card):not(.crypto-review-card)').count(), 8, `${name}: registered portfolio renders all project cards`);
  assert.equal(await page.locator('.project-card[data-target-version="10"]').count(), 3, `${name}: V10 target count is visible`);
  assert.equal(await page.locator('.target-badge span', { hasText: 'NOT PROVEN' }).count(), 8, `${name}: every project denies maturity proof`);
  assert.match(await page.locator('.truth-grid').innerText(), /TARGET ≠ PROOF/i, `${name}: target/proof boundary is visible`);
  assert.match(await page.locator('.truth-grid').innerText(), /FRAMEWORK ≠ CERTIFICATION/i, `${name}: framework/certification boundary is visible`);
  assert.match(await page.locator('.truth-grid').innerText(), /INVENTORY ≠ QUANTUM SAFETY/i, `${name}: crypto inventory cannot become a quantum-safe claim`);
  assert.equal(await page.locator('.crypto-entry-card').count(), 7, `${name}: all crypto entries render`);
  assert.equal(await page.locator('.crypto-entry-card[data-observation-state="STALE"]').count(), 7, `${name}: expired static crypto observations render stale`);
  assert.equal(await page.locator('.crypto-entry-card[data-migration-class="PUBLIC_KEY_MIGRATION_REQUIRED"]').count(), 4, `${name}: public-key migration entries stay explicit`);
  assert.equal(await page.locator('.crypto-review-card').count(), 3, `${name}: unresolved projects remain review-required`);
  const cryptoText = await page.locator('.crypto-panel').innerText();
  assert.match(cryptoText, /Uncovered active projects\s+0/i, `${name}: active portfolio has no silent crypto coverage holes`);
  assert.match(cryptoText, /AES-256-GCM/i, `${name}: symmetric crypto remains separately classified`);
  assert.match(cryptoText, /HMAC-SHA-256/i, `${name}: webhook MAC remains separately classified`);
  assert.match(cryptoText, /Revision 81d05f7ae8f427e84db506cfa726520a8178dece/i, `${name}: exact source revision is visible`);
  assert.match(cryptoText, /Revalidation required/i, `${name}: stale crypto exposes the next required action`);
  assert.match(cryptoText, /Static source observation lease expired/i, `${name}: stale reason is visible`);
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
      cryptoInventoryEntries: 7,
      staleCryptoInventoryEntries: 7,
      cryptoProvenanceVisible: true,
      cryptoRevalidationVisible: true,
      publicKeyMigrationEntries: 4,
      cryptoReviewRequiredProjects: 3,
      uncoveredActiveProjects: 0,
      inventoryIsNotQuantumSafety: true,
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
