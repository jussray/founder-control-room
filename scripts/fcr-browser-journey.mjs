#!/usr/bin/env node
/**
 * FCR Browser Operator v1: approved, synthetic, same-origin browser journeys.
 * This is a deterministic Playwright execution adapter, not an autonomous
 * permission grant or an AI planner. Browser success is NOT deployment proof.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTRACT = 'fcr/browser-journey@v1';
const ACTIONS = new Set([
  'goto', 'reload', 'click', 'fill', 'captureText',
  'expectVisible', 'expectText', 'expectCount', 'expectNoOverflow'
]);
const PROJECT_HOST = /^(?:[a-z0-9-]+\.)*(?:jussco\.company|foundercontrolroom\.org|sekretbip\.net)$/;
const VALID_ACTOR = /^[a-z][a-z0-9_-]{0,30}$/i;
const VALID_VARIABLE = /^[a-z][a-z0-9_]{0,30}$/i;
const DEFAULT_TIMEOUT = 12000;
const MAX_STEPS = 100;

export function validateOrigin(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid target URL'); }
  assert.equal(url.protocol, 'https:', 'Target must use HTTPS');
  assert.ok(!url.username && !url.password, 'URL credentials are forbidden');
  assert.ok(PROJECT_HOST.test(url.hostname), 'Target host is not an approved FCR project domain');
  assert.ok(!url.search && !url.hash, 'Target base URL cannot contain query or fragment');
  assert.equal(url.pathname, '/', 'Target must be an origin root');
  assert.equal(url.port, '', 'Custom ports are not allowed');
  return url.origin;
}

export function validateJourney(manifest) {
  assert.ok(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Manifest required');
  assert.equal(manifest.contract, CONTRACT);
  assert.match(manifest.project, /^[a-z][a-z0-9-]{1,60}$/);
  const origin = validateOrigin(manifest.target);
  assert.equal(manifest.syntheticOnly, true, 'Only synthetic journeys are permitted');
  assert.equal(manifest.approvedSyntheticActions, true, 'Synthetic browser actions must be explicitly declared');
  assert.ok(manifest.actors && typeof manifest.actors === 'object' && !Array.isArray(manifest.actors));
  const actors = Object.entries(manifest.actors);
  assert.ok(actors.length >= 1 && actors.length <= 4, 'Expected 1-4 independent browser actors');
  for (const [name, options] of actors) {
    assert.match(name, VALID_ACTOR);
    assert.ok(options && typeof options === 'object');
    assert.ok(Number.isInteger(options.width) && options.width >= 320 && options.width <= 1920);
    assert.ok(Number.isInteger(options.height) && options.height >= 480 && options.height <= 1200);
    assert.equal(typeof options.mobile, 'boolean');
  }
  assert.ok(Array.isArray(manifest.steps) && manifest.steps.length > 0 && manifest.steps.length <= MAX_STEPS);
  const captured = new Set();
  for (const [index, step] of manifest.steps.entries()) {
    assert.ok(step && typeof step === 'object', 'Step must be an object');
    assert.ok(manifest.actors[step.actor], 'Unknown actor at step ' + (index + 1));
    assert.ok(ACTIONS.has(step.action), 'Unsupported browser action at step ' + (index + 1));
    assert.match(step.label, /^[^<>]{3,140}$/, 'Step requires a safe human-readable label');
    if (['click','fill','captureText','expectVisible','expectText','expectCount'].includes(step.action)) {
      assert.ok(typeof step.selector === 'string' && step.selector.length > 0 && step.selector.length <= 250, 'Missing or oversized selector');
    }
    if (step.action === 'goto') {
      assert.ok(typeof step.path === 'string' && step.path.startsWith('/') && !step.path.startsWith('//'), 'Only relative same-origin paths are allowed');
      assert.equal(new URL(step.path, origin).origin, origin, 'Cross-origin navigation forbidden');
    }
    if (step.action === 'fill' || step.action === 'expectText') {
      assert.ok(typeof step.value === 'string' && step.value.length <= 200, 'Expected synthetic text value');
      for (const match of step.value.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/gi)) {
        assert.ok(captured.has(match[1]), 'Variable must be captured before use');
      }
    }
    if (step.action === 'captureText') {
      assert.match(step.variable, VALID_VARIABLE);
      assert.ok(!captured.has(step.variable), 'Captured variables must be unique');
      assert.ok(typeof step.pattern === 'string' && step.pattern.length <= 80, 'Capture must specify validation pattern');
      assert.ok(step.pattern.startsWith('^') && step.pattern.endsWith('$'), 'Capture pattern must be anchored');
      captured.add(step.variable);
    }
    if (step.action === 'expectCount') {
      assert.ok(Number.isInteger(step.count) && step.count >= 0 && step.count <= 50);
    }
  }
  return { project: manifest.project, origin, actors: actors.length, steps: manifest.steps.length };
}

export function substituteVariables(value, variables) {
  return value.replace(/\{\{([a-z][a-z0-9_]*)\}\}/gi, (_match, name) => {
    if (!Object.hasOwn(variables, name)) throw new Error('Unavailable captured variable: ' + name);
    return variables[name];
  });
}

function safeStep(step, status) {
  // Never report captured values, form entries, URLs with query strings, or DOM text.
  return { label: step.label, actor: step.actor, action: step.action, status };
}

async function runStep(page, step, origin, vars, expect) {
  const locator = step.selector ? page.locator(step.selector) : null;
  switch (step.action) {
    case 'goto': {
      const response = await page.goto(new URL(step.path, origin).toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response || response.status() >= 400) throw new Error('Navigation HTTP failure');
      break;
    }
    case 'reload': await page.reload({ waitUntil: 'domcontentloaded' }); break;
    case 'click': await locator.click({ timeout: DEFAULT_TIMEOUT }); break;
    case 'fill': await locator.fill(substituteVariables(step.value, vars), { timeout: DEFAULT_TIMEOUT }); break;
    case 'captureText': {
      const value = (await locator.innerText({ timeout: DEFAULT_TIMEOUT })).trim();
      if (value.length > 32 || !new RegExp(step.pattern).test(value)) throw new Error('Capture did not match required shape');
      vars[step.variable] = value;
      break;
    }
    case 'expectVisible': await expect(locator).toBeVisible({ timeout: DEFAULT_TIMEOUT }); break;
    case 'expectText': await expect(locator).toContainText(substituteVariables(step.value, vars), { timeout: DEFAULT_TIMEOUT }); break;
    case 'expectCount': await expect(locator).toHaveCount(step.count, { timeout: DEFAULT_TIMEOUT }); break;
    case 'expectNoOverflow': {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      if (overflow) throw new Error('Horizontal overflow');
      break;
    }
    default: throw new Error('Unexpected browser action');
  }
}

export async function runJourney(manifest, outDirectory = 'artifacts/browser/operator') {
  const summary = validateJourney(manifest);
  const [{ chromium }, { expect }] = await Promise.all([import('playwright'), import('@playwright/test')]);
  await mkdir(outDirectory, { recursive: true });
  const report = {
    contract: CONTRACT,
    project: summary.project,
    targetOrigin: summary.origin,
    sourceSha: process.env.GITHUB_SHA || null,
    evidenceScope: 'live-public-synthetic-browser',
    execution: 'playwright',
    permissionScope: 'synthetic-only-same-origin',
    status: 'BLOCKED',
    startedAt: new Date().toISOString(),
    steps: [],
    total: manifest.steps.length,
    completed: 0,
    evidence: []
  };
  let browser;
  const pages = new Map();
  try {
    browser = await chromium.launch({ headless: true });
    for (const [name, options] of Object.entries(manifest.actors)) {
      const context = await browser.newContext({
        viewport: { width: options.width, height: options.height },
        isMobile: options.mobile,
        hasTouch: options.mobile,
        serviceWorkers: 'block',
        acceptDownloads: false
      });
      await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        try {
          if (new URL(url).origin === summary.origin) return route.continue();
        } catch { /* fail closed */ }
        return route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      // No credentials, cookies, storage state, or FCR internal session are imported.
      page.setDefaultTimeout(DEFAULT_TIMEOUT);
      pages.set(name, { page, context });
    }
    const vars = Object.create(null);
    for (const [index, step] of manifest.steps.entries()) {
      const page = pages.get(step.actor).page;
      try {
        await runStep(page, step, summary.origin, vars, expect);
        report.steps.push(safeStep(step, 'PASS'));
        report.completed++;
      } catch {
        report.steps.push(safeStep(step, 'FAIL'));
        report.failure = {
          step: index + 1,
          label: step.label,
          actor: step.actor,
          action: step.action,
          reason: 'Step assertion or browser action failed. Reproduce locally for detailed trace.'
        };
        const filename = 'failed-step-' + String(index + 1).padStart(3, '0') + '.png';
        try {
          await page.screenshot({ path: path.join(outDirectory, filename), fullPage: true, timeout: 5000 });
          report.evidence.push(filename);
        } catch { report.evidence.push('screenshot-unavailable'); }
        report.status = 'FAIL';
        break;
      }
    }
    if (report.completed === report.total) report.status = 'PASS';
  } catch {
    report.status = 'BLOCKED';
    report.failure = { reason: 'Unable to initialize browser journey. Inspect runner logs; no success claimed.' };
  } finally {
    for (const actor of pages.values()) await actor.context.close().catch(() => {});
    await browser?.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    report.notExecuted = report.total - report.steps.length;
    await writeFile(path.join(outDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  return report;
}

async function cli() {
  const [file, mode] = process.argv.slice(2);
  if (!file || (mode !== '--dry-run' && mode !== '--run')) {
    throw new Error('Usage: node scripts/fcr-browser-journey.mjs config/browser-journeys/<approved>.json --dry-run|--run');
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const allowedDir = path.resolve(root, 'config/browser-journeys');
  const manifestPath = path.resolve(root, file);
  if (path.dirname(manifestPath) !== allowedDir || !manifestPath.endsWith('.json')) {
    throw new Error('Only committed, reviewed config/browser-journeys/*.json manifests are allowed');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const validated = validateJourney(manifest);
  if (mode === '--dry-run') {
    console.log(JSON.stringify({ status: 'VALIDATED_ONLY', ...validated, browserExecuted: false }));
    return;
  }
  const report = await runJourney(manifest, process.env.FCR_BROWSER_OUT_DIR || 'artifacts/browser/operator');
  console.log(JSON.stringify({ project: report.project, status: report.status, completed: report.completed, total: report.total, failure: report.failure || null }));
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  cli().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
