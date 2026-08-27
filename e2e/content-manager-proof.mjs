import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(here, '../public/control-room/content-manager.html');
const outputDir = resolve(here, '../test-results');

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.goto(pathToFileURL(pagePath).href, { waitUntil: 'domcontentloaded' });

  const stageNames = await page.locator('[data-content-stage] h2').allTextContents();
  assert.deepEqual(stageNames, [
    'Verified proof',
    'Create draft',
    'Review',
    'Founder approval',
    'Schedule',
    'Explicit publish',
    'Metrics receipt',
  ]);

  const founderLane = page.locator('[data-founder-progress-lane]');
  await founderLane.waitFor({ state: 'visible' });
  assert.equal(await founderLane.getAttribute('data-founder-authority'), 'current-you');
  assert.equal(await founderLane.getAttribute('data-provider-write-state'), 'capability-implemented');
  assert.equal(await founderLane.getAttribute('data-first-party-linkedin-capability'), 'implemented');
  assert.equal(await founderLane.getAttribute('data-temporal-truth-state'), 'unknown');
  assert.equal(await founderLane.getAttribute('data-analytics-authority'), 'observation-only');
  assert.equal(await founderLane.getAttribute('data-public-proof-state'), 'optional-off');
  assert.equal(await founderLane.getAttribute('data-review-window-state'), 'not-handed-off');
  assert.equal(await founderLane.getAttribute('data-outcome-state'), 'unknown');

  const founderLaneText = await founderLane.innerText();
  assert.match(founderLaneText, /Tell the progress\. Keep the machinery private\./);
  assert.match(founderLaneText, /What can go public/);
  assert.match(founderLaneText, /What stays behind the curtain/);
  assert.match(founderLaneText, /Current You authorizes/i);
  assert.match(founderLaneText, /FutureYou is advisory only/i);
  assert.match(founderLaneText, /Missing metrics stay UNKNOWN/i);
  assert.match(founderLaneText, /analytics can improve later drafts, never authorize them/i);
  assert.match(founderLaneText, /Exact-copy \+ temporal approval required/i);
  assert.match(founderLaneText, /first-party LinkedIn execution capability is implemented/i);
  assert.match(founderLaneText, /capability is not publication proof/i);
  assert.match(founderLaneText, /canonical temporal revalidation/i);
  assert.match(founderLaneText, /durable one-shot reservation/i);
  assert.match(founderLaneText, /provider readback/i);
  assert.match(founderLaneText, /provider and publication state remain UNKNOWN/i);
  assert.doesNotMatch(founderLaneText, /Share-now is forbidden for this lane/i);
  assert.doesNotMatch(founderLaneText, /Live provider writes remain a separate server-side authorization and credential gate/i);

  const founderCards = await founderLane.locator('[data-founder-lane-card]').count();
  assert.equal(founderCards, 3, 'founder progress lane must keep public, private, and authority boundaries visible');
  assert.equal(await founderLane.locator('button, .action').count(), 0, 'capability must not be presented as an already-authorized publish control');

  const learningLoop = page.locator('[data-content-learning-loop]');
  await learningLoop.waitFor({ state: 'visible' });
  assert.equal(await learningLoop.getAttribute('data-analytics-authority'), 'observation-only');
  assert.equal(await learningLoop.getAttribute('data-private-metrics-state'), 'withheld');
  assert.equal(await learningLoop.getAttribute('data-metric-claim-state'), 'fresh-verifier-required');
  assert.equal(await learningLoop.locator('[data-learning-axis]').count(), 3);
  assert.equal(await learningLoop.locator('[data-story-archetype]').count(), 4);
  const learningAxes = await learningLoop.locator('[data-learning-axis]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-learning-axis')));
  assert.deepEqual(learningAxes, ['distribution', 'resonance', 'compounding']);
  const storyArchetypes = await learningLoop.locator('[data-story-archetype]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-story-archetype')));
  assert.deepEqual(storyArchetypes, ['founder-thesis', 'build-correct', 'proof-lesson', 'human-product-stake']);
  const learningText = await learningLoop.innerText();
  assert.match(learningText, /Learn from attention without turning analytics into authority\./i);
  assert.match(learningText, /Metrics stay private by default/i);
  assert.match(learningText, /repository proof may support repository claims, not analytics claims/i);
  assert.match(learningText, /those claims stay BLOCKED for first-party publication/i);
  assert.match(learningText, /private snapshot may still guide which public-safe story shape/i);
  assert.doesNotMatch(learningText, /\b42\b|\b52\b|\b3,?740\b/, 'private workbook totals must not be baked into the public Content Manager');

  const status = page.locator('[aria-label="Content authority status"]');
  assert.equal(await status.locator('[data-founder-engine-state]').getAttribute('data-founder-engine-state'), 'contract-ready');
  assert.equal(await status.locator('[data-first-party-linkedin-capability]').getAttribute('data-first-party-linkedin-capability'), 'implemented');
  assert.equal(await status.locator('[data-founder-evidence-state]').getAttribute('data-founder-evidence-state'), 'unknown');
  assert.equal(await status.locator('[data-founder-sauce-state]').getAttribute('data-founder-sauce-state'), 'unknown');
  assert.equal(await status.locator('[data-temporal-truth-state]').getAttribute('data-temporal-truth-state'), 'unknown');
  assert.equal(await status.locator('[data-current-you-state]').getAttribute('data-current-you-state'), 'not-requested');
  assert.equal(await status.locator('[data-provider-state]').getAttribute('data-provider-state'), 'unknown');
  assert.equal(await status.locator('[data-outcome-state]').getAttribute('data-outcome-state'), 'unknown');
  const statusText = await status.innerText();
  assert.match(statusText, /Founder progress contract ready/i);
  assert.match(statusText, /First-party LinkedIn publish capability implemented/i);
  assert.match(statusText, /Evidence UNKNOWN until proposal/i);
  assert.match(statusText, /Sauce receipt UNKNOWN until proposal/i);
  assert.match(statusText, /Temporal truth UNKNOWN until execution/i);
  assert.match(statusText, /Current You not requested/i);
  assert.match(statusText, /Provider state UNKNOWN/i);
  assert.match(statusText, /Outcome UNKNOWN/i);

  const publishStage = page.locator('[data-content-stage="publish"]');
  const publishText = await publishStage.innerText();
  assert.match(publishText, /First-party founder content can dispatch to LinkedIn/i);
  assert.match(publishText, /exact Current You confirmation/i);
  assert.match(publishText, /temporal truth revalidation/i);
  assert.match(publishText, /provider readback/i);
  assert.match(publishText, /publish_founder_content/i);
  assert.doesNotMatch(publishText, /remains review-window only/i);

  const actions = await page.locator('.action').allTextContents();
  assert(actions.includes('Open proof ledger'));
  assert(actions.includes('Open activity receipts'));

  const policyText = await page.locator('.blocker').innerText();
  assert.match(policyText, /missing truth gate/i);
  assert.match(policyText, /rejected or ambiguous write/i);
  assert.match(policyText, /absent readback/i);
  assert.match(policyText, /must never translate capability, approval, dispatch/i);
  assert.match(policyText, /Publication requires terminal provider readback/i);

  const pageText = await page.locator('main').innerText();
  assert.doesNotMatch(pageText, /Cambiante, Buffer, or another approved actuator owns/i);
  assert.match(pageText, /Capability, authorization, dispatch, and publication remain separate truths\./i);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    flowWidth: document.querySelector('.flow')?.clientWidth ?? 0,
    flowScrollWidth: document.querySelector('.flow')?.scrollWidth ?? 0,
    founderLaneWidth: document.querySelector('[data-founder-progress-lane]')?.clientWidth ?? 0,
    learningLoopWidth: document.querySelector('[data-content-learning-loop]')?.clientWidth ?? 0,
  }));

  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, 'page must not overflow the mobile viewport');
  assert(dimensions.flowScrollWidth > dimensions.flowWidth, 'workflow must remain horizontally explorable on mobile');
  assert(dimensions.founderLaneWidth > 0 && dimensions.founderLaneWidth <= dimensions.viewportWidth, 'founder progress lane must fit the mobile viewport');
  assert(dimensions.learningLoopWidth > 0 && dimensions.learningLoopWidth <= dimensions.viewportWidth, 'content learning loop must fit the mobile viewport');

  await page.locator('.action.primary').focus();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Open proof ledger');

  await page.screenshot({
    path: resolve(outputDir, 'content-manager-mobile.png'),
    fullPage: true,
  });

  console.log(JSON.stringify({
    ok: true,
    route: '/control-room/content-manager.html',
    viewport: '390x844',
    stages: stageNames,
    founderProgress: {
      engineState: 'contract-ready',
      firstPartyLinkedInCapability: 'implemented',
      evidenceState: 'unknown',
      sauceState: 'unknown',
      temporalTruthState: 'unknown',
      currentYouState: 'not-requested',
      publicProofState: 'optional-off',
      reviewWindowState: 'not-handed-off',
      providerState: 'unknown',
      outcomeState: 'unknown',
      analyticsAuthority: 'observation-only',
      fakeWriteControls: 0,
    },
    contentLearning: {
      analyticsAuthority: 'observation-only',
      privateMetricsState: 'withheld',
      metricClaimState: 'fresh-verifier-required',
      axes: learningAxes,
      storyArchetypes,
    },
    screenshot: 'test-results/content-manager-mobile.png',
    overflow: dimensions,
  }, null, 2));
} finally {
  await browser.close();
}
