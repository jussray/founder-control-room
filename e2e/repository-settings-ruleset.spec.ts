import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { buildPortfolioMcpRegistryResponse } from '../src/mcp/portfolioRegistry.js';

const CANONICAL_RULESET = 'Founder Control Room main exact-head gate';
const SETTINGS_PATH = '/control-room/repository-settings.html';
const REGISTRY_PATH = '/mcp/registry/v0.1/servers';

let server: Server;
let baseUrl = '';

test.beforeAll(async () => {
  const html = await readFile(join(process.cwd(), 'public/control-room/repository-settings.html'), 'utf8');

  server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname === SETTINGS_PATH) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === REGISTRY_PATH) {
      const payload = buildPortfolioMcpRegistryResponse({
        search: requestUrl.searchParams.get('search') ?? undefined,
        version: requestUrl.searchParams.get('version') ?? undefined,
      });
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60',
      });
      response.end(JSON.stringify(payload));
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Repository Settings proof server did not expose a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test.describe('Repository Settings ruleset safety', () => {
  test('defaults active FCR main protection to the canonical hardened gate', async ({ page }) => {
    await page.goto(`${baseUrl}${SETTINGS_PATH}`);

    await expect(page.locator('input[name="projectSlug"]')).toHaveValue('founder-control-room');
    await expect(page.locator('input[name="name"]')).toHaveValue(CANONICAL_RULESET);
    await expect(page.locator('select[name="enforcement"]')).toHaveValue('active');
    await expect(page.locator('input[name="targetRefs"]')).toHaveValue('main');
    await expect(page.locator('input[name="requirePullRequest"]')).toBeChecked();
    await expect(page.locator('input[name="requiredApprovingReviewCount"]')).toHaveValue('1');
    await expect(page.locator('input[name="requiredStatusCheckNames"]')).toHaveValue(
      'Required Gate, Verify test-ledger contract',
    );
  });

  test('blocks an accidental second active FCR main ruleset before any provider request', async ({ page }) => {
    let mutationRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/projects/founder-control-room/ruleset')
      ) {
        mutationRequests += 1;
      }
    });

    await page.goto(`${baseUrl}${SETTINGS_PATH}`);
    await page.locator('input[name="name"]').fill('protect-main');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('#result')).toContainText(
      `Blocked: active Founder Control Room main protection must update the canonical ruleset "${CANONICAL_RULESET}"`,
    );
    expect(mutationRequests).toBe(0);
  });

  test('preserves deliberate rename flexibility outside active FCR main protection', async ({ page }) => {
    let submittedBody: Record<string, unknown> | null = null;

    await page.goto(`${baseUrl}${SETTINGS_PATH}`);
    await page.evaluate(() => {
      sessionStorage.setItem('fcr_session', JSON.stringify({ access_token: 'playwright-test-token' }));
    });
    await page.route('**/projects/founder-control-room/ruleset', async (route) => {
      submittedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, result: { id: 'test', name: 'FCR main governance v2' } }),
      });
    });

    await page.locator('input[name="name"]').fill('FCR main governance v2');
    await page.locator('select[name="enforcement"]').selectOption('evaluate');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('#result')).toContainText('"ok": true');
    expect(submittedBody).toMatchObject({
      name: 'FCR main governance v2',
      enforcement: 'evaluate',
      targetRefs: ['main'],
    });
  });
});

type RegistryServer = {
  name: string;
  title: string;
  remotes: Array<{
    type: string;
    url: string;
    headers?: Array<{
      name: string;
      isRequired?: boolean;
      isSecret?: boolean;
    }>;
  }>;
};

test.describe('Founder quartet MCP registry', () => {
  test('serves FCR, Chief, Sol, and PromptOS with real governed remote URLs', async ({ request }) => {
    const response = await request.get(`${baseUrl}${REGISTRY_PATH}`);
    expect(response.status()).toBe(200);

    const payload = await response.json() as {
      servers: Array<{ server: RegistryServer }>;
      metadata: { count: number };
    };
    expect(payload.metadata.count).toBe(4);

    const servers = payload.servers.map((entry) => entry.server);
    expect(servers.map((entry) => entry.name)).toEqual([
      'org.foundercontrolroom/fcr',
      'org.foundercontrolroom/chief',
      'org.foundercontrolroom/sol',
      'org.foundercontrolroom/promptos',
    ]);

    const byName = new Map(servers.map((entry) => [entry.name, entry]));
    expect(byName.get('org.foundercontrolroom/fcr')?.remotes[0].url).toBe(
      'https://api.foundercontrolroom.org/mcp/portfolio/founder-control-room',
    );
    expect(byName.get('org.foundercontrolroom/chief')?.remotes[0].url).toBe(
      'https://chief-ai.mcgill-raylene.workers.dev/mcp',
    );
    expect(byName.get('org.foundercontrolroom/sol')?.remotes[0].url).toBe(
      'https://api.foundercontrolroom.org/mcp/portfolio/solcontinuity',
    );
    expect(byName.get('org.foundercontrolroom/promptos')?.remotes[0].url).toBe(
      'https://api.foundercontrolroom.org/mcp/portfolio/promptos',
    );

    for (const name of [
      'org.foundercontrolroom/fcr',
      'org.foundercontrolroom/sol',
      'org.foundercontrolroom/promptos',
    ]) {
      expect(byName.get(name)?.remotes[0].headers).toEqual([
        expect.objectContaining({
          name: 'Authorization',
          isRequired: true,
          isSecret: true,
        }),
      ]);
    }
  });

  test('supports registry search without exposing any credential value', async ({ request }) => {
    const response = await request.get(`${baseUrl}${REGISTRY_PATH}?search=SolContinuity`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    const payload = JSON.parse(body) as { servers: Array<{ server: RegistryServer }> };

    expect(payload.servers).toHaveLength(1);
    expect(payload.servers[0].server.name).toBe('org.foundercontrolroom/sol');
    expect(body).not.toContain('Bearer playwright');
    expect(body).not.toContain('service_role');
  });
});
