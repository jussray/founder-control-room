import { chromium, devices, request as playwrightRequest } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = path.resolve(
  process.env.AUDIT_OUTPUT_DIR ?? 'artifacts/live-outage-audit',
);
const EXPECTED_HEAD_SHA = process.env.EXPECTED_HEAD_SHA ?? process.env.GITHUB_SHA ?? 'unknown';
const CAPTURED_AT = new Date().toISOString();

const surfaces = [
  {
    id: 'root-home',
    label: 'Root application shell',
    url: 'https://foundercontrolroom.org/',
    screenshot: true,
    captureLoading: true,
    captureRecovery: true,
    evidenceClass: 'live',
  },
  {
    id: 'root-health',
    label: 'Root health response',
    url: 'https://foundercontrolroom.org/health',
    screenshot: true,
    evidenceClass: 'live',
  },
  {
    id: 'root-version',
    label: 'Root deployment version',
    url: 'https://foundercontrolroom.org/version',
    screenshot: true,
    evidenceClass: 'live',
  },
  {
    id: 'root-guardrails',
    label: 'Root public guardrail status',
    url: 'https://foundercontrolroom.org/guardrails',
    screenshot: true,
    evidenceClass: 'live',
  },
  {
    id: 'root-auth-callback-error',
    label: 'Root authentication callback error',
    url: 'https://foundercontrolroom.org/auth/callback#error=access_denied&error_description=Audit%20denied',
    screenshot: true,
    evidenceClass: 'synthetic-input-on-live-route',
  },
  {
    id: 'root-auth-me',
    label: 'Root unauthenticated founder session',
    url: 'https://foundercontrolroom.org/auth/me',
    screenshot: true,
    evidenceClass: 'live-unauthenticated',
  },
  {
    id: 'root-auth-google-start',
    label: 'Root Google authentication start',
    url: 'https://foundercontrolroom.org/auth/google',
    screenshot: false,
    evidenceClass: 'live-request-no-redirect-follow',
  },
  {
    id: 'api-home',
    label: 'API custom-domain root',
    url: 'https://api.foundercontrolroom.org/',
    screenshot: true,
    captureLoading: true,
    captureRecovery: true,
    evidenceClass: 'live',
  },
  {
    id: 'api-health',
    label: 'API health response',
    url: 'https://api.foundercontrolroom.org/health',
    screenshot: true,
    evidenceClass: 'live',
  },
  {
    id: 'api-version',
    label: 'API deployment version',
    url: 'https://api.foundercontrolroom.org/version',
    screenshot: true,
    evidenceClass: 'live',
  },
  {
    id: 'api-guardrails',
    label: 'API public guardrail status',
    url: 'https://api.foundercontrolroom.org/guardrails',
    screenshot: true,
    evidenceClass: 'live',
  },
  {
    id: 'api-auth-callback-error',
    label: 'API authentication callback error',
    url: 'https://api.foundercontrolroom.org/auth/callback#error=access_denied&error_description=Audit%20denied',
    screenshot: true,
    evidenceClass: 'synthetic-input-on-live-route',
  },
  {
    id: 'api-auth-me',
    label: 'API unauthenticated founder session',
    url: 'https://api.foundercontrolroom.org/auth/me',
    screenshot: true,
    evidenceClass: 'live-unauthenticated',
  },
  {
    id: 'api-auth-google-start',
    label: 'API Google authentication start',
    url: 'https://api.foundercontrolroom.org/auth/google',
    screenshot: false,
    evidenceClass: 'live-request-no-redirect-follow',
  },
];

const viewports = [
  {
    name: 'desktop',
    contextOptions: {
      viewport: { width: 1440, height: 1000 },
      screen: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
    },
  },
  {
    name: 'mobile',
    contextOptions: {
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 },
      screen: { width: 390, height: 844 },
    },
  },
];

let screenshotCounter = 0;

function nextScreenshotName(surfaceId, viewportName, state) {
  screenshotCounter += 1;
  return `${String(screenshotCounter).padStart(2, '0')}-${surfaceId}-${viewportName}-${state}.png`;
}

function excerpt(value, limit = 2000) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

async function inspectDom(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const accessibleName = (element) => {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .filter(Boolean)
          .join(' ');
        if (text) return text;
      }
      if (element instanceof HTMLInputElement) {
        if (element.labels?.length) {
          const labelText = [...element.labels]
            .map((label) => label.textContent?.trim() ?? '')
            .filter(Boolean)
            .join(' ');
          if (labelText) return labelText;
        }
        const placeholder = element.getAttribute('placeholder')?.trim();
        if (placeholder) return placeholder;
      }
      const alt = element.getAttribute('alt')?.trim();
      if (alt) return alt;
      return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    };

    const controls = [...document.querySelectorAll('a, button, input, select, textarea')]
      .filter(isVisible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type'),
        name: accessibleName(element),
        href: element instanceof HTMLAnchorElement ? element.href : null,
        disabled:
          'disabled' in element && typeof element.disabled === 'boolean'
            ? element.disabled
            : false,
      }));

    const retryPattern = /retry|reload|refresh|try again|check status|status page|support|go back/i;
    const retryControls = controls.filter((control) => retryPattern.test(control.name));
    const unnamedControls = controls.filter((control) => !control.name);

    return {
      documentTitle: document.title,
      htmlLang: document.documentElement.lang || null,
      bodyText: document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 5000) ?? '',
      h1: [...document.querySelectorAll('h1')]
        .filter(isVisible)
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
      mainCount: [...document.querySelectorAll('main, [role="main"]')].filter(isVisible).length,
      navCount: [...document.querySelectorAll('nav, [role="navigation"]')].filter(isVisible).length,
      alertText: [...document.querySelectorAll('[role="alert"], [aria-live]')]
        .filter(isVisible)
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean),
      controls,
      retryControls,
      unnamedControls,
      visibleImageCount: [...document.images].filter(isVisible).length,
      imagesMissingAlt: [...document.images]
        .filter(isVisible)
        .filter((image) => !image.hasAttribute('alt')).length,
    };
  });
}

async function inspectFocusOrder(page, maxTabs = 12) {
  const order = [];
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) return null;
      return {
        tag: element.tagName.toLowerCase(),
        text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
        ariaLabel: element.getAttribute('aria-label'),
        id: element.id || null,
        href: element instanceof HTMLAnchorElement ? element.href : null,
      };
    });
    if (!focused) break;
    order.push(focused);
  }
  return order;
}

async function takeScreenshot(page, surfaceId, viewportName, state) {
  const fileName = nextScreenshotName(surfaceId, viewportName, state);
  const filePath = path.join(OUTPUT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true, animations: 'disabled' });
  return fileName;
}

async function captureSurface(browser, surface, viewport) {
  const context = await browser.newContext({
    ...viewport.contextOptions,
    ignoreHTTPSErrors: true,
    locale: 'en-US',
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  const responses = [];

  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: excerpt(message.text(), 1000) });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(excerpt(error?.stack ?? error?.message ?? error, 2000));
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText ?? 'unknown',
    });
  });
  page.on('response', async (response) => {
    if (response.request().isNavigationRequest()) {
      responses.push({
        url: response.url(),
        status: response.status(),
        headers: await response.allHeaders(),
      });
    }
  });

  const result = {
    surfaceId: surface.id,
    label: surface.label,
    url: surface.url,
    viewport: viewport.name,
    evidenceClass: surface.evidenceClass,
    navigation: null,
    screenshots: [],
    dom: null,
    focusOrder: [],
    consoleMessages,
    pageErrors,
    failedRequests,
    responses,
    recovery: null,
  };

  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });

  try {
    let navigationError = null;
    let response = null;
    try {
      response = await page.goto(surface.url, { waitUntil: 'commit', timeout: 30_000 });
    } catch (error) {
      navigationError = excerpt(error?.stack ?? error?.message ?? error, 2500);
    }

    result.navigation = {
      status: response?.status() ?? null,
      finalUrl: page.url(),
      error: navigationError,
      headers: response ? await response.allHeaders() : null,
    };

    if (surface.captureLoading) {
      try {
        const screenshot = await takeScreenshot(page, surface.id, viewport.name, 'first-paint');
        result.screenshots.push({ state: 'first-paint', file: screenshot });
      } catch (error) {
        result.screenshots.push({
          state: 'first-paint',
          error: excerpt(error?.stack ?? error?.message ?? error, 1500),
        });
      }
    }

    await page.waitForLoadState('domcontentloaded', { timeout: 12_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);

    try {
      result.dom = await inspectDom(page);
      result.focusOrder = await inspectFocusOrder(page);
    } catch (error) {
      result.dom = { inspectionError: excerpt(error?.stack ?? error?.message ?? error, 2000) };
    }

    try {
      const screenshot = await takeScreenshot(page, surface.id, viewport.name, 'stable');
      result.screenshots.push({ state: 'stable', file: screenshot });
    } catch (error) {
      result.screenshots.push({
        state: 'stable',
        error: excerpt(error?.stack ?? error?.message ?? error, 1500),
      });
    }

    if (surface.captureRecovery) {
      const recovery = {
        offlineReloadError: null,
        offlineUrl: null,
        offlineBodyText: null,
        offlineScreenshot: null,
        recoveredNavigation: null,
        recoveredScreenshot: null,
      };

      await context.setOffline(true);
      try {
        await page.reload({ waitUntil: 'commit', timeout: 8_000 });
      } catch (error) {
        recovery.offlineReloadError = excerpt(error?.stack ?? error?.message ?? error, 2000);
      }
      await page.waitForTimeout(750);
      recovery.offlineUrl = page.url();
      recovery.offlineBodyText = await page
        .locator('body')
        .innerText({ timeout: 2_000 })
        .then((value) => excerpt(value, 2000))
        .catch(() => null);
      try {
        recovery.offlineScreenshot = await takeScreenshot(
          page,
          surface.id,
          viewport.name,
          'offline',
        );
      } catch (error) {
        recovery.offlineScreenshotError = excerpt(
          error?.stack ?? error?.message ?? error,
          1500,
        );
      }

      await context.setOffline(false);
      let recoveredResponse = null;
      let recoveredError = null;
      try {
        recoveredResponse = await page.goto(surface.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      } catch (error) {
        recoveredError = excerpt(error?.stack ?? error?.message ?? error, 2000);
      }
      await page.waitForTimeout(500);
      recovery.recoveredNavigation = {
        status: recoveredResponse?.status() ?? null,
        finalUrl: page.url(),
        error: recoveredError,
        bodyText: await page
          .locator('body')
          .innerText({ timeout: 2_000 })
          .then((value) => excerpt(value, 2000))
          .catch(() => null),
      };
      try {
        recovery.recoveredScreenshot = await takeScreenshot(
          page,
          surface.id,
          viewport.name,
          'recovered',
        );
      } catch (error) {
        recovery.recoveredScreenshotError = excerpt(
          error?.stack ?? error?.message ?? error,
          1500,
        );
      }

      result.recovery = recovery;
    }
  } finally {
    const traceFile = `${surface.id}-${viewport.name}-trace.zip`;
    await context.tracing
      .stop({ path: path.join(OUTPUT_DIR, traceFile) })
      .catch(() => {});
    await context.close();
  }

  return result;
}

async function probeRequests() {
  const request = await playwrightRequest.newContext({
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'User-Agent': 'Founder-Control-Room-Live-Outage-Audit/1.0',
    },
  });

  const results = [];
  try {
    for (const surface of surfaces) {
      const startedAt = Date.now();
      try {
        const response = await request.get(surface.url, {
          timeout: 25_000,
          failOnStatusCode: false,
          maxRedirects: 0,
        });
        const body = await response.text().catch(() => '');
        results.push({
          surfaceId: surface.id,
          label: surface.label,
          url: surface.url,
          evidenceClass: surface.evidenceClass,
          status: response.status(),
          statusText: response.statusText(),
          elapsedMs: Date.now() - startedAt,
          headers: response.headers(),
          bodyExcerpt: excerpt(body, 2500),
        });
      } catch (error) {
        results.push({
          surfaceId: surface.id,
          label: surface.label,
          url: surface.url,
          evidenceClass: surface.evidenceClass,
          status: null,
          elapsedMs: Date.now() - startedAt,
          error: excerpt(error?.stack ?? error?.message ?? error, 2500),
        });
      }
    }
  } finally {
    await request.dispose();
  }
  return results;
}

await mkdir(OUTPUT_DIR, { recursive: true });

const manifest = {
  audit: 'Founder Control Room live outage and recovery experience',
  capturedAt: CAPTURED_AT,
  expectedHeadSha: EXPECTED_HEAD_SHA,
  productionMutation: false,
  authenticatedFounderDataUsed: false,
  credentialsUsed: false,
  requestProbes: [],
  browserCaptures: [],
};

manifest.requestProbes = await probeRequests();

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    for (const surface of surfaces.filter((item) => item.screenshot)) {
      manifest.browserCaptures.push(await captureSurface(browser, surface, viewport));
    }
  }
} finally {
  await browser.close();
}

await writeFile(
  path.join(OUTPUT_DIR, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

const summary = {
  capturedAt: CAPTURED_AT,
  expectedHeadSha: EXPECTED_HEAD_SHA,
  screenshotCount: screenshotCounter,
  requestCount: manifest.requestProbes.length,
  captureCount: manifest.browserCaptures.length,
  failedRequestProbes: manifest.requestProbes.filter((probe) => probe.status === null).length,
  statusCounts: manifest.requestProbes.reduce((counts, probe) => {
    const key = probe.status === null ? 'network-error' : String(probe.status);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {}),
};

await writeFile(
  path.join(OUTPUT_DIR, 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(summary, null, 2));

if (screenshotCounter === 0) {
  throw new Error('Audit produced no screenshots; browser capture is blocked.');
}
