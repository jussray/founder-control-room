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
const css = [
  exportedTemplate('../src/http/routes/onboardingAssets/controlRoomCss.ts'),
  exportedTemplate('../src/http/routes/onboardingAssets/controlRoomVisualBridge.ts'),
].join('\n');

const proofDir = 'test-results/control-room-visual-parity';
const durableProofDir = 'logs/control-room-visual-parity';
mkdirSync(proofDir, { recursive: true });
mkdirSync(durableProofDir, { recursive: true });

function countGridTracks(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth, `${label}: no horizontal overflow`);
}

async function mount(page) {
  await page.route('https://fcr.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (url.pathname === '/assets/control-room.css') return route.fulfill({ status: 200, contentType: 'text/css', body: css });
    if (url.pathname === '/assets/control-room.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: js });
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/health') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    if (url.pathname === '/auth/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { founder: { email: 'founder@example.com' } } }),
      });
    }
    if (url.pathname === '/onboarding/state') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          complete: false,
          projects: [],
          composerProfileEvidence: { status: 'available', founderDeclared: true, authorityGranted: false },
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
    return route.fulfill({ status: 404, body: 'not found' });
  });

  await page.goto('https://fcr.test/', { waitUntil: 'networkidle' });
  await page.locator('#onboarding-flow').waitFor({ state: 'visible' });
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
try {
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mount(page);

    const panelStyle = await page.locator('#onboarding-flow').evaluate((node) => {
      const style = getComputedStyle(node);
      return { borderRadius: style.borderRadius, backdropFilter: style.backdropFilter, backgroundImage: style.backgroundImage };
    });
    assert.equal(panelStyle.borderRadius, '18px');
    assert.match(panelStyle.backgroundImage, /gradient/i);

    const projectGridTracks = countGridTracks(await page.locator('.project-type-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns));
    assert.equal(projectGridTracks, 4, 'desktop project choices use the canonical four-column card rhythm');

    const primaryButtonBackground = await page.locator('[data-next-step="2"]').evaluate((node) => getComputedStyle(node).backgroundImage);
    assert.match(primaryButtonBackground, /linear-gradient/i, 'primary actions use the canonical violet-to-cyan treatment');

    await page.locator('label.choice-card:has(input[value="product-app"])').click();
    const selectedBorder = await page.locator('label.choice-card:has(input[value="product-app"])').evaluate((node) => getComputedStyle(node).borderColor);
    assert.notEqual(selectedBorder, 'rgba(0, 0, 0, 0)');

    await page.locator('[data-next-step="2"]').click();
    await page.getByText('What do you need FCR to do?', { exact: true }).waitFor();
    const missionGridTracks = countGridTracks(await page.locator('.mission-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns));
    assert.equal(missionGridTracks, 4, 'desktop mission choices retain the same four-column visual system');

    await noOverflow(page, 'desktop onboarding');
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `${proofDir}/desktop.png`, fullPage: true });
    await page.screenshot({ path: `${durableProofDir}/desktop.png`, fullPage: true });
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mount(page);

    const projectGridTracks = countGridTracks(await page.locator('.project-type-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns));
    assert.equal(projectGridTracks, 2, 'mobile onboarding condenses to two premium cards per row');

    const actionsPosition = await page.locator('.step-actions').evaluate((node) => getComputedStyle(node).position);
    assert.equal(actionsPosition, 'sticky', 'mobile actions stay reachable without breaking the compact founder-command layout');

    await noOverflow(page, 'mobile onboarding');
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `${proofDir}/mobile.png`, fullPage: true });
    await page.screenshot({ path: `${durableProofDir}/mobile.png`, fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('FCR onboarding visual parity Playwright proof passed: canonical glass shell, violet/cyan action language, desktop four-column cards, mobile two-column density, sticky mobile actions, screenshots, and zero overflow.');
