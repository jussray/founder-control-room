import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { expect, test, type Page } from '@playwright/test';

let server: Server;
let origin = '';

test.beforeAll(async () => {
  const app = express();
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/control-room');
  app.use('/control-room', express.static(publicDir));

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Friend proof server did not bind');
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function prepareFriendPage(page: Page) {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        founder: { id: 'founder-playwright', email: 'founder@example.com' },
      }),
    });
  });

  await page.route('**/mirror/friend-intake', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const requestBody = route.request().postDataJSON();
    expect(requestBody).not.toHaveProperty('relatedMemories');

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        intakeId: '11111111-1111-4111-8111-111111111111',
        runId: '22222222-2222-4222-8222-222222222222',
        privacyChoice: requestBody.privacyChoice,
        inputPersistence: requestBody.privacyChoice === 'save_redacted_summary'
          ? 'redacted_summary_only'
          : 'none',
        mirror: {
          headline: 'One reflection, one move',
          summary: 'The build needs one bounded proof, not another planning loop.',
        },
        intentTags: ['build', 'people'],
        move: {
          kind: 'tiny_move',
          text: 'Run the focused proof and record the result.',
          rationale: 'One proof reduces uncertainty.',
          timeEstimateMinutes: 10,
          gateWarning: 'No external action is authorized.',
        },
        runtimeProvider: requestBody.provider,
        modelExecutionState: requestBody.provider === 'deterministic' ? 'not_used' : 'succeeded',
        provenanceId: '33333333-3333-4333-8333-333333333333',
        timelineEventId: 'timeline-playwright',
        usefulness: null,
        provenance: {
          id: '33333333-3333-4333-8333-333333333333',
          source: requestBody.provider === 'deterministic' ? 'deterministic' : 'model_inference',
          provider: requestBody.provider,
          model: requestBody.provider === 'deterministic' ? 'friend-deterministic-v1' : 'playwright-model',
          responseId: null,
          promptVersion: 'friend-intake-v1-2026-09-08',
          providerStorageMode: requestBody.provider === 'deterministic' ? 'local_only' : 'provider_default',
          webSearchUsed: false,
          doesNotProve: ['founder approval', 'external factual truth', 'provider write outcome', 'memory retrieval'],
        },
      }),
    });
  });

  await page.route('**/mirror/friend-intake/*/usefulness', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        runId: '22222222-2222-4222-8222-222222222222',
        usefulness: { response: 'yes', recordedAt: '2026-09-09T03:30:00.000Z' },
      }),
    });
  });
}

for (const viewport of [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'mobile', width: 390, height: 844 },
]) {
  test(`Friend Intake renders exactly one move with provenance and usefulness on ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await prepareFriendPage(page);

    await page.goto(`${origin}/control-room/friend.html`);
    await expect(page.getByRole('heading', { name: 'One reflection. One move.' })).toBeVisible();

    await page.getByLabel('What is on your mind?').fill('I need one proof for the build.');
    await page.getByLabel('Runtime').selectOption('anthropic');
    await page.getByRole('button', { name: 'Run Friend' }).click();

    await expect(page.getByText('One reflection, one move')).toBeVisible();
    await expect(page.locator('.move')).toHaveCount(1);
    await expect(page.locator('.tag-input')).toHaveCount(2);

    await page.getByText('Provenance · what this does and does not prove').click();
    await expect(page.getByText('model_inference')).toBeVisible();
    await expect(page.getByText('external factual truth')).toBeVisible();

    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText('Usefulness recorded.')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}
