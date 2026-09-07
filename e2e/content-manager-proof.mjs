import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(here, '../public');
const outputDir = resolve(here, '../test-results');
const lifecycleBase = '/automation/conveyor/founder-content/lifecycle';

await mkdir(outputDir, { recursive: true });

const now = '2026-09-07T17:30:00.000Z';
const approvedPost = {
  contract: 'fcr/founder-content-lifecycle-store@v1',
  postId: '11111111-1111-4111-8111-111111111111',
  founderUserId: 'founder-proof',
  provider: 'linkedin',
  platform: 'linkedin',
  accountId: 'urn:li:person:proof',
  title: 'Proof-bound founder post',
  publicPayload: { draft_text: 'A proof-bound founder update.' },
  contentHash: 'a'.repeat(64),
  mediaCount: 0,
  status: 'approved',
  providerWriteState: 'not_attempted',
  approvalId: 'fca:proof',
  executionId: null,
  scheduledAt: null,
  postedAt: null,
  externalPostId: null,
  permalink: null,
  retryCount: 0,
  lastError: null,
  lastMetricsSyncAt: null,
  createdAt: now,
  updatedAt: now,
};

const mutationRequests = [];

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function mime(pathname) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' })[extname(pathname)] || 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === lifecycleBase && req.method === 'GET') {
    return json(res, 200, {
      contract: 'fcr/founder-content-lifecycle@v1',
      operations: [],
      platforms: ['linkedin', 'facebook', 'instagram', 'threads', 'x', 'tiktok', 'youtube', 'pinterest', 'bluesky', 'mastodon', 'google_business'],
      providerAdapters: [],
      authority: { providerReadbackRequired: true, blindRetryAllowed: false },
    });
  }
  if (url.pathname === `${lifecycleBase}/posts` && req.method === 'GET') {
    return json(res, 200, { ok: true, posts: [approvedPost] });
  }
  if (url.pathname === `${lifecycleBase}/analytics` && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      totalPosts: 1,
      byStatus: { approved: 1, scheduled: 0, posted: 0, failed: 0, outcome_unknown: 0 },
      byPlatform: { linkedin: 1 },
      failureCount: 0,
      retryQueue: [],
      ambiguous: [],
      metrics: [],
    });
  }
  if (url.pathname.startsWith(lifecycleBase) || url.pathname === '/automation/conveyor/founder-content/approvals') {
    if (req.method !== 'GET') mutationRequests.push({ method: req.method, pathname: url.pathname });
    return json(res, 405, { ok: false, code: 'PLAYWRIGHT_PROOF_MUTATION_FORBIDDEN' });
  }

  const pathname = url.pathname === '/' ? '/control-room/content-manager.html' : url.pathname;
  const filePath = resolve(publicRoot, `.${pathname}`);
  if (!filePath.startsWith(publicRoot)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': mime(filePath), 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
assert(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

try {
  await page.goto(`${origin}/control-room/content-manager.html`, { waitUntil: 'networkidle' });

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
  assert.equal(await founderLane.locator('[data-founder-lane-card]').count(), 3);
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

  const controlPlane = page.locator('[data-lifecycle-control-plane]');
  await controlPlane.waitFor({ state: 'visible' });
  assert.match(await controlPlane.innerText(), /Run the lifecycle without collapsing the truth gates\./i);
  assert.match(await controlPlane.innerText(), /No account connection grants publication authority/i);
  assert.match(await controlPlane.innerText(), /This stores public draft state only\. It does not approve, schedule at a provider, or publish\./i);
  assert.equal(await controlPlane.locator('[data-lifecycle-runtime]').getAttribute('data-state'), 'ready');
  assert.match(await controlPlane.locator('[data-lifecycle-runtime]').innerText(), /Authenticated lifecycle ready/i);
  assert.match(await controlPlane.locator('[data-adapter-note]').innerText(), /No provider lifecycle adapters are registered/i);
  assert.equal(await controlPlane.locator('[data-metric-total]').innerText(), '1');
  assert.equal(await controlPlane.locator('[data-metric-posted]').innerText(), '0');
  assert.equal(await controlPlane.locator('[data-metric-scheduled]').innerText(), '0');
  assert.equal(await controlPlane.locator('[data-metric-failures]').innerText(), '0');

  const postCard = controlPlane.locator(`[data-post-id="${approvedPost.postId}"]`);
  await postCard.waitFor({ state: 'visible' });
  assert.match(await postCard.innerText(), /Proof-bound founder post/i);
  assert.match(await postCard.innerText(), /approved/i);
  await postCard.locator('[data-post-action="select"]').click();

  const selected = controlPlane.locator('[data-selected-console]');
  await selected.waitFor({ state: 'visible' });
  assert.equal(await selected.locator('[data-selected-status]').innerText(), 'approved');
  assert.equal(await selected.locator('[data-selected-provider]').innerText(), 'linkedin/linkedin');
  assert.equal(await selected.locator('[data-selected-write-state]').innerText(), 'not_attempted');
  assert.equal(await selected.locator('[data-selected-hash]').innerText(), approvedPost.contentHash);

  const publish = selected.locator('[data-selected-action="publish"]');
  assert.equal(await publish.isDisabled(), false, 'approved post may expose publish gate without being authorized to execute it');
  assert.equal(await selected.locator('[data-publish-confirm]').isChecked(), false);
  await publish.click();
  assert.match(await controlPlane.locator('[data-console-output]').innerText(), /Explicit publish confirmation is required/i);
  assert.equal(mutationRequests.length, 0, 'browser proof must not emit any lifecycle mutation before explicit confirmation');

  const publishText = await page.locator('[data-content-stage="publish"]').innerText();
  assert.match(publishText, /First-party founder content can dispatch to LinkedIn/i);
  assert.match(publishText, /exact Current You confirmation/i);
  assert.match(publishText, /temporal truth revalidation/i);
  assert.match(publishText, /provider readback/i);
  assert.match(publishText, /publish_founder_content/i);

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
    controlPlaneWidth: document.querySelector('[data-lifecycle-control-plane]')?.clientWidth ?? 0,
  }));

  assert.equal(dimensions.pageWidth, dimensions.viewportWidth, 'page must not overflow the mobile viewport');
  assert(dimensions.flowScrollWidth > dimensions.flowWidth, 'workflow must remain horizontally explorable on mobile');
  assert(dimensions.founderLaneWidth > 0 && dimensions.founderLaneWidth <= dimensions.viewportWidth, 'founder progress lane must fit the mobile viewport');
  assert(dimensions.learningLoopWidth > 0 && dimensions.learningLoopWidth <= dimensions.viewportWidth, 'content learning loop must fit the mobile viewport');
  assert(dimensions.controlPlaneWidth > 0 && dimensions.controlPlaneWidth <= dimensions.viewportWidth, 'lifecycle control plane must fit the mobile viewport');

  await page.screenshot({
    path: resolve(outputDir, 'content-manager-mobile.png'),
    fullPage: true,
  });

  console.log(JSON.stringify({
    ok: true,
    route: '/control-room/content-manager.html',
    origin: 'local-http-proof',
    viewport: '390x844',
    stages: stageNames,
    lifecycleControlPlane: {
      hydrated: true,
      mockedReadPosts: 1,
      providerAdapters: 0,
      selectedStatus: 'approved',
      explicitPublishConfirmationRequired: true,
      mutationRequestsBeforeConfirmation: mutationRequests.length,
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
  await new Promise((resolveClose) => server.close(resolveClose));
}
