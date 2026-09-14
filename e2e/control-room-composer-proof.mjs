import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
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
mkdirSync(proofDir, { recursive: true });

async function proveComposer(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport });
  let createdProject = null;
  let submittedPayload = null;

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
    if (url.pathname === '/health') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (url.pathname === '/auth/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { founder: { email: 'founder@example.com' } } }),
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
    if (url.pathname === '/onboarding/bootstrap' && request.method() === 'POST') {
      submittedPayload = request.postDataJSON();
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
          projectCreated: true,
          connectionsCreated: connections,
          truth: {
            credentialsStored: false,
            providersConnected: false,
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

  await page.locator(`input[name="projectType"][value="${scenario.projectType}"]`).check();
  await page.locator('[data-next-step="2"]').click();
  await page.getByText('What do you need FCR to do?', { exact: true }).waitFor();

  await page.locator(`input[name="mission"][value="${scenario.mission}"]`).check();
  await page.locator('[data-next-step="3"]').click();
  await page.locator('#project-name').fill(scenario.projectName);
  await page.locator('#project-slug').waitFor();
  assert.equal(await page.locator('#project-slug').inputValue(), scenario.expectedSlug);
  await page.locator('#repo-identifier').fill('jussray/example-project');
  await page.locator(`input[name="currentState"][value="${scenario.currentState}"]`).check();
  await page.locator('[data-next-step="4"]').click();

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
  assert.ok(submittedPayload.providers.includes('playwright'));

  assert.equal(await page.locator('#profile-project-type').textContent(), scenario.projectTypeLabel);
  assert.equal(await page.locator('#profile-mission').textContent(), scenario.missionLabel);
  assert.equal(await page.locator('#profile-current-state').textContent(), scenario.currentStateLabel);
  assert.equal(await page.locator('#account-secondary').isVisible(), true);

  await page.screenshot({
    path: `${proofDir}/${scenario.name}.png`,
    fullPage: true,
  });

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

console.log('Control Room Composer Playwright proof passed: desktop + mobile first-run flow, payload binding, and ready-room restoration.');
