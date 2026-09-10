import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

const FOUNDER_ID = '00000000-0000-4000-8000-000000000111';
const FOUNDER_EMAIL = 'founder@example.com';
const PROJECT_ID = '00000000-0000-4000-8000-000000000333';
const SESSION_ID_HASH = 'a'.repeat(64);
const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
let baseUrl = '';
let persistedRuns: Array<Record<string, unknown>> = [];
let usefulnessReceipts: Array<Record<string, unknown>> = [];
let persistedIntakeIds = new Set<string>();
const ownedRuns = new Map<string, string>();

function fakeFounder(req: Request, _res: Response, next: NextFunction) {
  (req as Request & { founder?: { email: string; userId: string } }).founder = {
    email: FOUNDER_EMAIL,
    userId: FOUNDER_ID,
  };
  next();
}

test.beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SUPABASE_ALLOW_LOCAL = 'true';
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'friend-intake-e2e-service-role';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'friend-intake-e2e-publishable';
  process.env.FOUNDER_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64url');
  const { createFriendIntakeRouter } = await import('../dist/http/routes/friendIntake.js');

  const app = express();
  app.use(express.json());
  app.get('/auth/me', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ founder: { email: FOUNDER_EMAIL } });
  });
  app.use('/control-room', express.static(path.join(PUBLIC_ROOT, 'control-room')));
  app.use('/friend-intake', createFriendIntakeRouter({
    enabled: () => true,
    persistenceEnabled: () => true,
    authMiddleware: fakeFounder,
    interactiveAuthMiddleware: fakeFounder,
    resolveInteractiveSessionIdHash: async () => SESSION_ID_HASH,
    resolveProjectId: async () => PROJECT_ID,
    persistRun: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (persistedIntakeIds.has(input.intakeId)) {
        throw new Error('FRIEND_INTAKE_PERSISTENCE_FAILED:duplicate key value violates unique constraint');
      }
      persistedIntakeIds.add(input.intakeId);
      const record = { ...input } as Record<string, unknown>;
      persistedRuns.push(record);
      ownedRuns.set(String(record.intakeId), String(record.founderId));
    },
    recordUsefulness: async (input) => {
      if (ownedRuns.get(input.runId) !== input.founderId) {
        throw new Error('FRIEND_INTAKE_USEFULNESS_FAILED:friend_intake_run_not_owned');
      }
      usefulnessReceipts.push({ ...input });
    },
  }));

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Friend Intake proof server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve());
  });
});

test.beforeEach(() => {
  persistedRuns = [];
  usefulnessReceipts = [];
  persistedIntakeIds = new Set<string>();
  ownedRuns.clear();
});

function captureExternalRequests(page: Page) {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== baseUrl) external.push(request.url());
  });
  return external;
}

test('desktop saved-summary flow freezes privacy state, stays model-free, and reports retention truthfully', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const externalRequests = captureExternalRequests(page);
  const rawText = 'Email founder@example.com about the product build plan and launch step.';

  await page.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Move one thing forward.' })).toBeVisible();
  await page.fill('#friend-input', rawText);
  await page.check('input[value="save_redacted_summary"]');
  await expect(page.locator('#privacy-note')).toContainText('Raw input is not stored');
  await page.getByRole('button', { name: 'Mirror and give me one move' }).click();

  await expect(page.locator('#friend-input')).toBeDisabled();
  await expect(page.locator('input[value="process_without_saving"]')).toBeDisabled();
  await expect(page.locator('input[value="save_redacted_summary"]')).toBeDisabled();

  const receipt = page.locator('[data-friend-intake-receipt]');
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('Deterministic FCR rule engine');
  await expect(receipt).toContainText('External model state: blocked');
  await expect(receipt).toContainText('Redacted summary + derived labels');
  await expect(page.locator('[data-one-move]')).toHaveCount(1);
  await expect(page.locator('[data-intent-tags] input')).toHaveCount(1);

  expect(persistedRuns).toHaveLength(1);
  const persisted = persistedRuns[0];
  expect(persisted.privacyChoice).toBe('save_redacted_summary');
  expect(persisted.modelExecutionState).toBe('blocked');
  expect(String(persisted.redactedSummary)).not.toContain('founder@example.com');
  expect(String(persisted.redactedSummary).length).toBeLessThanOrEqual(300);
  expect(JSON.stringify(persisted)).not.toContain(rawText);
  expect(externalRequests).toEqual([]);

  await page.getByRole('button', { name: 'Yes, helped' }).click();
  await expect(page.locator('[data-feedback-status]')).toHaveText('Usefulness receipt recorded.');
  expect(usefulnessReceipts).toHaveLength(1);
  expect(usefulnessReceipts[0]).toMatchObject({
    founderId: FOUNDER_ID,
    projectId: PROJECT_ID,
    response: 'yes',
  });
  expect(String(usefulnessReceipts[0].eventId)).toMatch(/^[0-9a-f-]{36}$/i);

  await page.screenshot({ path: 'test-results/friend-intake-desktop.png', fullPage: true });
});

test('sensitive saved-summary confirmation reviews every persisted label and is serialized', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const externalRequests = captureExternalRequests(page);
  const rawText = 'My child is involved in a custody issue.';

  await page.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });
  await page.fill('#friend-input', rawText);
  await page.check('input[value="save_redacted_summary"]');
  await page.getByRole('button', { name: 'Mirror and give me one move' }).click();

  const review = page.locator('[data-sensitive-save-review]');
  await expect(review).toBeVisible();
  await expect(review).toContainText('Sensitive content detected.');
  await expect(review).toContainText('Nothing has been saved yet.');
  await expect(review.locator('[data-reviewed-sensitive-categories]')).toContainText('teen');
  await expect(review.locator('[data-reviewed-sensitive-categories]')).toContainText('legal');
  await expect(review.locator('[data-reviewed-intent-tags]')).toContainText('kids');
  await expect(review.locator('[data-reviewed-intent-tags]')).toContainText('legal');
  await expect(review).not.toContainText(rawText);
  expect(persistedRuns).toHaveLength(0);
  expect(externalRequests).toEqual([]);

  await page.screenshot({ path: 'test-results/friend-intake-sensitive-review.png', fullPage: true });

  await page.getByRole('button', { name: 'Save reviewed summary and labels' }).dblclick();
  const receipt = page.locator('[data-friend-intake-receipt]');
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('Redacted summary + derived labels');
  await expect(page.locator('[data-one-move]')).toContainText('protective_move');

  expect(persistedRuns).toHaveLength(1);
  const persisted = persistedRuns[0];
  expect(persisted.privacyChoice).toBe('save_redacted_summary');
  expect(persisted.sensitiveCategories).toEqual(expect.arrayContaining(['teen', 'legal']));
  expect(persisted.intentTagIds).toEqual(expect.arrayContaining(['kids', 'legal']));
  expect(String(persisted.redactedSummary)).not.toContain(rawText);
  expect(JSON.stringify(persisted)).not.toContain(rawText);
  expect(externalRequests).toEqual([]);
});

test('one sensitive review cannot create two saved rows across concurrent tabs', async ({ page, context }) => {
  const rawText = 'My child is involved in a custody issue.';
  await page.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });
  await page.fill('#friend-input', rawText);
  await page.check('input[value="save_redacted_summary"]');
  await page.getByRole('button', { name: 'Mirror and give me one move' }).click();
  await expect(page.locator('[data-sensitive-save-review]')).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });

  const confirm = (target: Page) => target.evaluate(async (reviewedText) => {
    const response = await fetch('/friend-intake/run', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: reviewedText,
        privacyChoice: 'save_redacted_summary',
        sensitiveSaveConfirmed: true,
      }),
    });
    return response.status;
  }, rawText);

  const statuses = await Promise.all([confirm(page), confirm(secondPage)]);
  expect(statuses.sort()).toEqual([200, 409]);
  expect(persistedRuns).toHaveLength(1);
  await secondPage.close();
});

test('cancelling a sensitive review revokes the shared confirmation receipt', async ({ page, context }) => {
  const rawText = 'My child is involved in a custody issue.';
  await page.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });
  await page.fill('#friend-input', rawText);
  await page.check('input[value="save_redacted_summary"]');
  await page.getByRole('button', { name: 'Mirror and give me one move' }).click();
  await expect(page.locator('[data-sensitive-save-review]')).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: 'Cancel and clear' }).click();
  await expect(page.locator('[data-sensitive-save-review]')).toHaveCount(0);

  const status = await secondPage.evaluate(async (reviewedText) => {
    const response = await fetch('/friend-intake/run', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: reviewedText,
        privacyChoice: 'save_redacted_summary',
        sensitiveSaveConfirmed: true,
      }),
    });
    return response.status;
  }, rawText);

  expect(status).toBe(409);
  expect(persistedRuns).toHaveLength(0);
  await secondPage.close();
});

test('changing away from save during sensitive review revokes the shared receipt', async ({ page, context }) => {
  const rawText = 'My child is involved in a custody issue.';
  await page.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });
  await page.fill('#friend-input', rawText);
  await page.check('input[value="save_redacted_summary"]');
  await page.getByRole('button', { name: 'Mirror and give me one move' }).click();
  await expect(page.locator('[data-sensitive-save-review]')).toBeVisible();

  const secondPage = await context.newPage();
  await secondPage.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });

  await page.check('input[value="process_without_saving"]');
  await expect(page.locator('[data-sensitive-save-review]')).toHaveCount(0);
  await expect(page.locator('input[value="process_without_saving"]')).toBeChecked();

  const status = await secondPage.evaluate(async (reviewedText) => {
    const response = await fetch('/friend-intake/run', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: reviewedText,
        privacyChoice: 'save_redacted_summary',
        sensitiveSaveConfirmed: true,
      }),
    });
    return response.status;
  }, rawText);

  expect(status).toBe(409);
  expect(persistedRuns).toHaveLength(0);
  await secondPage.close();
});

test('control room hides Friend Intake navigation when runtime availability is false', async ({ page }) => {
  await page.route('**/friend-intake/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, persistenceEnabled: false }),
    });
  });

  await page.goto(`${baseUrl}/control-room/`, { waitUntil: 'networkidle' });
  const link = page.locator('[data-friend-intake-link]');
  await expect(link).toBeHidden();
  await page.locator('.launch-dock summary').click();
  await expect(link).toBeHidden();
});

test('mobile process-without-saving protects sensitive input and stores no intake content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const externalRequests = captureExternalRequests(page);
  const rawText = 'My child is involved in a custody issue.';

  await page.goto(`${baseUrl}/control-room/friend-intake.html`, { waitUntil: 'networkidle' });
  await page.fill('#friend-input', rawText);
  await expect(page.locator('input[value="process_without_saving"]')).toBeChecked();
  await page.getByRole('button', { name: 'Mirror and give me one move' }).click();

  const receipt = page.locator('[data-friend-intake-receipt]');
  await expect(receipt).toBeVisible();
  await expect(page.locator('[data-one-move]')).toContainText('protective_move');
  await expect(page.locator('[data-one-move]')).not.toContainText('tiny_move');
  await expect(receipt).toContainText('No intake content saved');
  await expect(page.locator('[data-one-move]')).toHaveCount(1);

  expect(persistedRuns).toHaveLength(1);
  const persisted = persistedRuns[0];
  expect(persisted.privacyChoice).toBe('process_without_saving');
  expect(persisted.redactedSummary).toBeNull();
  expect(persisted.sensitiveCategories).toEqual([]);
  expect(persisted.intentTagIds).toEqual([]);
  expect(JSON.stringify(persisted)).not.toContain(rawText);
  expect(externalRequests).toEqual([]);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Wrong time' }).click();
  await expect(page.locator('[data-feedback-status]')).toHaveText('Usefulness receipt recorded.');
  expect(usefulnessReceipts).toHaveLength(1);
  expect(usefulnessReceipts[0]).toMatchObject({ response: 'wrong_time' });

  await page.screenshot({ path: 'test-results/friend-intake-mobile.png', fullPage: true });
});
