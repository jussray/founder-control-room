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

const cryptographicInventory = [
  ['fcr-github-app-rs256', 'founder-control-room', 'Authenticate GitHub App', 'RSA digital signature over JWT', 'RS256 / RSA-SHA256', 'OBSERVED', 'GitHub protocol', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'not-confidentiality-control'],
  ['fcr-founder-session-aes256gcm', 'founder-control-room', 'Encrypt founder credentials', 'authenticated symmetric encryption', 'AES-256-GCM', 'OBSERVED', 'FCR / Cloudflare secret plane', 'SYMMETRIC_MONITOR', 'stored-secret'],
  ['sekret-supabase-auth-jwks', 'sekret-bip', 'Verify Supabase user tokens', 'provider-issued JWT', 'provider-selected asymmetric JWT', 'PROVIDER_MANAGED', 'Supabase Auth', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'short-lived-auth'],
  ['sekret-firebase-appcheck-rs256', 'sekret-bip', 'Verify Firebase App Check', 'RSA digital signature over JWT', 'RS256', 'PROVIDER_MANAGED', 'Firebase / Google', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'not-confidentiality-control'],
  ['jbh-private-cloudflare-access-rs256', 'juss-beautiful-hair-private', 'Verify Cloudflare Access owner assertions', 'RSA digital signature over JWT', 'RS256', 'PROVIDER_MANAGED', 'Cloudflare Access', 'PUBLIC_KEY_MIGRATION_REQUIRED', 'short-lived-auth'],
  ['storyengine-supabase-service-role', 'l99', 'Authenticate bounded persistence writes', 'provider-managed opaque service credential', 'provider-managed', 'PROVIDER_MANAGED', 'Supabase', 'PROVIDER_MANAGED_UNKNOWN', 'provider-managed-unknown'],
  ['untold-shopify-webhook-hmac', 'untold-stories', 'Authenticate Shopify order webhooks', 'message authentication code', 'HMAC-SHA-256', 'OBSERVED', 'Shopify', 'SYMMETRIC_MONITOR', 'not-confidentiality-control'],
].map(([id, projectSlug, purpose, primitive, algorithm, observationState, provider, quantumMigrationClass, confidentialityHorizon]) => ({
  id,
  projectSlug,
  purpose,
  primitive,
  algorithm,
  observationState,
  provider,
  migrationAuthority: `${provider} and application ownership are explicitly separated.`,
  quantumMigrationClass,
  confidentialityHorizon,
  sourceEvidence: `${projectSlug}:source-evidence`,
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

const providerPqcEvidence = [
  ['github-app-jwt-signature', 'GitHub', 'GitHub App JWT signature', 'application-signature', 'UNSUPPORTED', ['founder-control-room']],
  ['github-public-tls', 'GitHub', 'GitHub public TLS transport', 'transport-key-agreement', 'UNKNOWN', ['founder-control-room']],
  ['supabase-auth-jwt-signature', 'Supabase', 'Supabase Auth JWT signing keys', 'application-signature', 'UNSUPPORTED', ['sekret-bip']],
  ['supabase-public-tls', 'Supabase', 'Supabase hosted API TLS transport', 'transport-key-agreement', 'UNKNOWN', ['sekret-bip', 'l99']],
  ['firebase-app-check-jwt-signature', 'Firebase / Google', 'Firebase App Check token signature', 'application-signature', 'UNSUPPORTED', ['sekret-bip']],
  ['google-api-tls-key-agreement', 'Google Cloud', 'google.com and *.googleapis.com API TLS key agreement', 'transport-key-agreement', 'CURRENT', ['sekret-bip']],
  ['google-identity-signature-roadmap', 'Google Cloud', 'Google identity and access quantum-safe authentication roadmap', 'provider-roadmap', 'PLANNED', ['sekret-bip']],
  ['cloudflare-access-jwt-signature', 'Cloudflare', 'Cloudflare Access application-token signature', 'application-signature', 'UNSUPPORTED', ['juss-beautiful-hair-private']],
  ['cloudflare-edge-tls-key-agreement', 'Cloudflare', 'Visitor-to-Cloudflare TLS 1.3 key agreement', 'transport-key-agreement', 'CURRENT', ['founder-control-room', 'juss-beautiful-hair-private']],
  ['cloudflare-visitor-tls-signatures', 'Cloudflare', 'Visitor-to-Cloudflare TLS authentication signatures', 'transport-signature', 'PLANNED', ['founder-control-room', 'juss-beautiful-hair-private']],
].map(([id, provider, surface, plane, state, projectSlugs]) => ({
  id,
  provider,
  surface,
  plane,
  state,
  projectSlugs,
  currentContract: `${surface} has a provider-documented classical or transport contract.`,
  pqcEvidence: `${state} provider evidence is recorded without becoming runtime proof.`,
  providerTarget: `${provider} target remains evidence-scoped.`,
  migrationAuthority: `${provider} owns provider capability; the application owns compatibility and verification.`,
  requiredRuntimeEvidenceBeforeChange: `Require current provider and runtime evidence before changing ${surface}.`,
  sources: [{ title: `${provider} official documentation`, url: 'https://example.invalid/provider-doc' }],
  observedOn: '2026-09-10',
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
    uniqueControlCount: 62,
    frameworkSignalCount: 23,
    cryptographicInventoryEntries: 7,
    cryptographicReviewRequiredProjects: 3,
    publicKeyMigrationEntries: 4,
    providerPqcEvidenceEntries: 10,
    providerPqcCurrentEntries: 2,
    providerPqcPlannedEntries: 2,
    providerPqcUnsupportedEntries: 4,
    providerPqcUnknownEntries: 2,
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
    providerPqcEvidence: {
      entries: providerPqcEvidence,
      summary: {
        entryCount: 10,
        currentCount: 2,
        plannedCount: 2,
        unsupportedCount: 4,
        unknownCount: 2,
      },
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
    providerRoadmapIsNotRuntimeProof: true,
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
  assert.equal(await page.locator('.project-card:not(.crypto-entry-card):not(.crypto-review-card):not(.pqc-provider-card)').count(), 8, `${name}: registered portfolio renders all project cards`);
  assert.equal(await page.locator('.project-card[data-target-version="10"]').count(), 3, `${name}: V10 target count is visible`);
  assert.equal(await page.locator('.target-badge span', { hasText: 'NOT PROVEN' }).count(), 8, `${name}: every project denies maturity proof`);
  assert.match(await page.locator('.truth-grid').innerText(), /TARGET ≠ PROOF/i, `${name}: target/proof boundary is visible`);
  assert.match(await page.locator('.truth-grid').innerText(), /FRAMEWORK ≠ CERTIFICATION/i, `${name}: framework/certification boundary is visible`);
  assert.match(await page.locator('.truth-grid').innerText(), /ROADMAP ≠ RUNTIME/i, `${name}: provider roadmaps cannot become runtime truth`);
  assert.match(await page.locator('.truth-grid').innerText(), /INVENTORY ≠ QUANTUM SAFETY/i, `${name}: crypto inventory cannot become a quantum-safe claim`);
  assert.equal(await page.locator('.crypto-entry-card').count(), 7, `${name}: all observed crypto entries render`);
  assert.equal(await page.locator('.crypto-entry-card[data-migration-class="PUBLIC_KEY_MIGRATION_REQUIRED"]').count(), 4, `${name}: public-key migration entries stay explicit`);
  assert.equal(await page.locator('.crypto-review-card').count(), 3, `${name}: unresolved projects remain review-required`);
  assert.match(await page.locator('.crypto-panel').first().innerText(), /Uncovered active projects\s+0/i, `${name}: active portfolio has no silent crypto coverage holes`);
  assert.match(await page.locator('.crypto-panel').first().innerText(), /AES-256-GCM/i, `${name}: symmetric crypto remains separately classified`);
  assert.match(await page.locator('.crypto-panel').first().innerText(), /HMAC-SHA-256/i, `${name}: webhook MAC remains separately classified`);
  assert.equal(await page.locator('.pqc-provider-card').count(), 10, `${name}: all provider PQC evidence entries render`);
  assert.equal(await page.locator('.pqc-provider-card[data-pqc-state="CURRENT"]').count(), 2, `${name}: CURRENT provider capability count stays explicit`);
  assert.equal(await page.locator('.pqc-provider-card[data-pqc-state="PLANNED"]').count(), 2, `${name}: PLANNED provider capability count stays explicit`);
  assert.equal(await page.locator('.pqc-provider-card[data-pqc-state="UNSUPPORTED"]').count(), 4, `${name}: UNSUPPORTED provider capability count stays explicit`);
  assert.equal(await page.locator('.pqc-provider-card[data-pqc-state="UNKNOWN"]').count(), 2, `${name}: UNKNOWN provider capability count stays explicit`);
  assert.match(await page.locator('.provider-pqc-panel').innerText(), /GitHub App JWT signature/i, `${name}: GitHub App signature evidence is visible`);
  assert.match(await page.locator('.provider-pqc-panel').innerText(), /Visitor-to-Cloudflare TLS 1\.3 key agreement/i, `${name}: Cloudflare transport evidence is visible`);
  assert.match(await page.locator('.provider-pqc-panel').innerText(), /Proof required before any change/i, `${name}: runtime proof gate is visible`);
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
      publicKeyMigrationEntries: 4,
      cryptoReviewRequiredProjects: 3,
      uncoveredActiveProjects: 0,
      providerPqcEvidenceEntries: 10,
      providerPqcCurrentEntries: 2,
      providerPqcPlannedEntries: 2,
      providerPqcUnsupportedEntries: 4,
      providerPqcUnknownEntries: 2,
      providerRoadmapIsNotRuntimeProof: true,
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
