import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

function exportedTemplate(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const start = source.indexOf('`');
  const end = source.lastIndexOf('`;');
  if (start < 0 || end <= start) throw new Error(`Unable to read template export: ${relativePath}`);
  return source.slice(start + 1, end);
}

const html = exportedTemplate('../src/http/routes/onboardingAssets/controlRoomHtml.ts');
const js = exportedTemplate('../src/http/routes/onboardingAssets/controlRoomJs.ts');
const css = exportedTemplate('../src/http/routes/onboardingAssets/controlRoomCss.ts');

const proofDir = 'test-results/control-room-composer';
const durableProofDir = 'logs/control-room-composer';
mkdirSync(proofDir, { recursive: true });
mkdirSync(durableProofDir, { recursive: true });

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${label}: horizontal overflow ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`,
  );
}

async function proveComposer(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let createdProject = null;
  let submittedPayload = null;
  const recommendationRequests = [];
  const recommendationReceipts = [];

  await page.route('https://fcr.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    }
    if (url.pathname === '/assets/control-room.css') {
      return route.fulfill({ status: 200, contentType: 'text/css', body: css });
    }
    if (url.pathname === '/assets/control-room.js') {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: js });
    }
    if (url.pathname === '/favicon.ico') {
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname === '/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (url.pathname === '/workspace/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { founder: { email: 'founder@example.com', role: 'platform_owner' } },
        }),
      });
    }
    if (url.pathname === '/onboarding/state') {
      const projects = createdProject ? [createdProject] : [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          complete: projects.length > 0,
          projects,
          composerProfileEvidence: {
            status: 'available',
            founderDeclared: true,
            authorityGranted: false,
          },
          authorityBoundary: {
            loginGrantsExecution: false,
            mergeRequiresSeparateApproval: true,
            deployRequiresSeparateApproval: true,
            productionMutationRequiresSeparateApproval: true,
            connectionSlotsStoreCredentials: false,
          },
        }),
      });
    }
    if (url.pathname === '/onboarding/chief-recommendation' && request.method() === 'POST') {
      const payload = request.postDataJSON();
      recommendationRequests.push(payload);
      const index = recommendationRequests.length - 1;
      const recommendationHash = (index === 0 ? 'a' : 'b').repeat(64);
      const acceptanceFingerprint = (index === 0 ? 'c' : 'd').repeat(64);
      recommendationReceipts.push({ recommendationHash, acceptanceFingerprint });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recommendation: {
            contract: 'chief-ai/control-room-recommendation@v1',
            selectedBy: 'chief-ai-machine',
            title: `Chief API: ${scenario.projectTypeLabel} Control Room focused on ${scenario.missionLabel}.`,
            focus: `Chief focus for ${scenario.projectName}.`,
            capabilityIntents: ['goal-planning', 'verification'],
            evidencePriorities: ['exact source state', 'real-path proof'],
            stateGuidance: `Treat ${scenario.currentStateLabel} as founder-declared context until FCR verifies it.`,
            nextGate: `Verify ${scenario.missionLabel} evidence before mutation.`,
            recommendationHash,
            founderDecision: {
              required: true,
              explicitDecisionOnly: true,
              accepted: false,
              createControlRoomAuthorized: false,
            },
            fcrHandoff: {
              stateAuthority: 'founder-control-room',
              evidenceAuthority: 'founder-control-room',
              executionAuthority: 'unresolved-by-chief-ai',
              preserveFounderDeclaredState: true,
              verifyRealityIndependently: true,
            },
          },
          acceptance: {
            fingerprint: acceptanceFingerprint,
            requiresExplicitFounderDecision: true,
            accepted: false,
          },
          truth: {
            chiefCreatesControlRoom: false,
            chiefGrantsExecution: false,
            stateAuthority: 'founder-control-room',
            evidenceAuthority: 'founder-control-room',
          },
        }),
      });
    }
    if (url.pathname === '/onboarding/bootstrap' && request.method() === 'POST') {
      submittedPayload = request.postDataJSON();
      const latest = recommendationReceipts.at(-1);
      assert.ok(latest, 'bootstrap must follow a Chief recommendation');
      assert.deepEqual(submittedPayload.chiefRecommendation, {
        recommendationHash: latest.recommendationHash,
        acceptanceFingerprint: latest.acceptanceFingerprint,
        accepted: true,
      });
      const connections = submittedPayload.providers.map((type, index) => ({
        id: `connection-${index + 1}`,
        type,
        label: 'primary',
        status: 'disconnected',
      }));
      createdProject = {
        id: 'project-1',
        slug: submittedPayload.project.slug,
        name: submittedPayload.project.name,
        repoProvider: submittedPayload.project.repoProvider,
        repoIdentifier: submittedPayload.project.repoIdentifier || null,
        stack: submittedPayload.project.stack || null,
        status: 'active',
        riskLevel: 'medium',
        controlRoomProfile: submittedPayload.controlRoom,
        connections,
      };
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          project: createdProject,
          controlRoomProfile: submittedPayload.controlRoom,
          controlRoomProfileAuthority: 'founder-declared',
          chiefRecommendation: {
            contract: 'chief-ai/control-room-recommendation@v1',
            selectedBy: 'chief-ai-machine',
            recommendationHash: latest.recommendationHash,
            acceptanceFingerprint: latest.acceptanceFingerprint,
            accepted: true,
            authorityGranted: false,
          },
          projectCreated: true,
          connectionsCreated: connections,
          truth: {
            credentialsStored: false,
            providersConnected: false,
            chiefExecutionAuthorized: false,
            mergeApproved: false,
            deploymentApproved: false,
          },
        }),
      });
    }

    return route.fulfill({ status: 404, body: 'not found' });
  });

  await page.goto('https://fcr.test/', { waitUntil: 'networkidle' });

  await page.locator('#onboarding-flow').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#workspace-ready').isHidden(), true);
  assert.equal(await page.locator('#account-secondary').isHidden(), true);
  await page.getByText('What are you working on?', { exact: true }).waitFor();
  await page.locator('#chief-presence').waitFor({ state: 'visible' });
  assert.match(await page.locator('#chief-presence').textContent(), /CHIEF/);
  assert.match(await page.locator('#chief-presence').textContent(), /LEAD · BUILD · EXECUTE/);
  await assertNoHorizontalOverflow(page, `${scenario.name}: project step`);

  await page.locator(`label.choice-card:has(input[name="projectType"][value="${scenario.projectType}"])`).click();
  await page.locator('[data-next-step="2"]').click();
  await page.getByText('What do you need FCR to do?', { exact: true }).waitFor();

  await page.locator(`label.choice-card:has(input[name="mission"][value="${scenario.mission}"])`).click();
  await page.locator('[data-next-step="3"]').click();
  await page.locator('#project-name').fill(scenario.projectName);
  await page.locator('#project-slug').waitFor();
  assert.equal(await page.locator('#project-slug').inputValue(), scenario.expectedSlug);
  await page.locator('#repo-identifier').fill('jussray/example-project');
  await page.locator(`label.state-chip:has(input[name="currentState"][value="${scenario.currentState}"])`).click();
  await page.locator('[data-next-step="4"]').click();

  const recommendation = page.locator('#chief-recommendation');
  await recommendation.waitFor({ state: 'visible' });
  await page.getByText(new RegExp(`Chief API: ${scenario.projectTypeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)).waitFor();
  assert.equal(recommendationRequests.length, 1, 'Composer must ask the FCR server for Chief recommendation');
  assert.deepEqual(recommendationRequests[0].controlRoom, {
    projectType: scenario.projectType,
    mission: scenario.mission,
    currentState: scenario.currentState,
  });
  assert.equal(recommendationRequests[0].project.name, scenario.projectName);
  assert.equal(recommendationRequests[0].project.repoIdentifier, 'jussray/example-project');
  const recommendationDetail = await page.locator('#chief-recommendation-detail').textContent();
  assert.match(recommendationDetail || '', new RegExp(scenario.projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(submittedPayload, null, 'Chief recommendation must not auto-create or authorize the Control Room');
  assert.equal(await page.locator('#authority-confirm').isDisabled(), false);
  await assertNoHorizontalOverflow(page, `${scenario.name}: Chief recommendation`);

  await page.locator('#authority-confirm').check();
  await page.locator('[data-previous-step="3"]').click();
  await page.locator('#repo-identifier').fill('jussray/example-project-v2');
  assert.equal(await page.locator('#authority-confirm').isChecked(), false, 'subject mutation must clear founder acceptance');
  assert.equal(await page.locator('#authority-confirm').isDisabled(), true, 'subject mutation must disable stale acceptance');
  await page.locator('[data-next-step="4"]').click();
  await page.waitForFunction(() => document.querySelector('#authority-confirm')?.disabled === false);
  assert.equal(recommendationRequests.length, 2, 'subject mutation must request a fresh Chief recommendation');
  assert.equal(recommendationRequests[1].project.repoIdentifier, 'jussray/example-project-v2');
  assert.notEqual(
    recommendationReceipts[0].recommendationHash,
    recommendationReceipts[1].recommendationHash,
    'fresh recommendation must carry a new bound hash in this proof fixture',
  );

  const recommendationScreenshotPath = `${proofDir}/${scenario.name}-chief-recommendation.png`;
  const durableRecommendationScreenshotPath = `${durableProofDir}/${scenario.name}-chief-recommendation.png`;
  await page.screenshot({ path: recommendationScreenshotPath, fullPage: true });
  copyFileSync(recommendationScreenshotPath, durableRecommendationScreenshotPath);

  const authorityCopy = await page.locator('.authority-confirmation').textContent();
  assert.match(authorityCopy || '', /explicitly accept|approve this exact Chief recommendation/i);
  await page.locator('#authority-confirm').check();
  await page.locator('#workspace-button').click();
  await page.locator('#workspace-ready').waitFor({ state: 'visible' });

  assert.ok(submittedPayload, 'Composer must submit a bootstrap payload');
  assert.deepEqual(submittedPayload.controlRoom, {
    projectType: scenario.projectType,
    mission: scenario.mission,
    currentState: scenario.currentState,
  });
  assert.equal(submittedPayload.project.slug, scenario.expectedSlug);
  assert.equal(submittedPayload.project.repoProvider, 'github');
  assert.equal(submittedPayload.project.repoIdentifier, 'jussray/example-project-v2');
  assert.ok(submittedPayload.providers.includes('playwright'));
  assert.equal(submittedPayload.chiefRecommendation.accepted, true);

  assert.equal(await page.locator('#profile-project-type').textContent(), scenario.projectTypeLabel);
  assert.equal(await page.locator('#profile-mission').textContent(), scenario.missionLabel);
  assert.equal(await page.locator('#profile-current-state').textContent(), scenario.currentStateLabel);
  assert.equal(await page.locator('#account-secondary').isVisible(), true);
  await assertNoHorizontalOverflow(page, `${scenario.name}: ready room`);
  assert.deepEqual(pageErrors, [], `${scenario.name}: browser page errors must stay empty`);

  const screenshotPath = `${proofDir}/${scenario.name}.png`;
  const durableScreenshotPath = `${durableProofDir}/${scenario.name}.png`;
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });
  copyFileSync(screenshotPath, durableScreenshotPath);

  await page.close();
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
try {
  await proveComposer(browser, {
    name: 'composer-desktop',
    viewport: { width: 1440, height: 1100 },
    projectType: 'ai-agent',
    projectTypeLabel: 'AI / Agent System',
    mission: 'fix',
    missionLabel: 'Fix',
    currentState: 'live',
    currentStateLabel: 'Already live',
    projectName: "Se'kret Bip",
    expectedSlug: 'se-kret-bip',
  });

  await proveComposer(browser, {
    name: 'composer-mobile',
    viewport: { width: 390, height: 844 },
    projectType: 'store-commerce',
    projectTypeLabel: 'Store / Commerce',
    mission: 'grow',
    missionLabel: 'Grow',
    currentState: 'building',
    currentStateLabel: 'Building',
    projectName: 'Juss Beautiful Hair',
    expectedSlug: 'juss-beautiful-hair',
  });
} finally {
  await browser.close();
}

console.log('Control Room Composer Playwright proof passed: desktop + mobile first-run flow, FCR-mediated Chief recommendation, exact founder acceptance binding, stale subject invalidation, zero Chief execution authority, payload binding, overflow checks, ready-room restoration, and durable screenshot receipts.');
