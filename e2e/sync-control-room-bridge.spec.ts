import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outputDir = resolve(repoRoot, 'test-results/sync-control-room-bridge');

type FetchBinding = { fetch(request: Request): Promise<Response> };
type PagesHandler = {
  fetch(
    request: Request,
    env: { ASSETS: FetchBinding; FCR_API: FetchBinding; SYNC_CONTROL?: FetchBinding },
  ): Promise<Response>;
};

const validSnapshot = {
  schema: 'sync-control-room/v1',
  service: 'sync-party-game',
  generated_at: 1790527200000,
  runtime: {
    status: 'VERIFIED',
    sha: '215f164ea19ec73c22591ce733085dd237e75748',
    build: 'cf-build-proof',
    platform: 'cloudflare-workers',
  },
  authority: {
    repository: 'jussray/sync-party-game',
    source_branch: 'main',
    production_branch: 'production',
    release_gate: 'core-proof -> exact green SHA -> production',
    mutation_authority: 'GitHub production branch + Cloudflare Workers Builds',
  },
  proof: {
    required: 'Playwright',
    suite: 'npm run test:e2e',
    exact_sha_runtime_contract: true,
    runtime_verified: true,
  },
  relay: {
    target: 'Founder Control Room',
    mode: 'privacy-safe-pull',
    endpoint: '/api/control-room/snapshot',
    protected_export_configured: false,
  },
  control: {
    seq: 7,
    events_recorded: 7,
    rooms_observed: 2,
    active_rooms: 1,
    connected_players: 2,
    counters: { ROOM_CREATED: 2, PLAYER_CONNECTED: 2 },
    first_at: 1790527100000,
    last_at: 1790527200000,
    recent_events: [
      {
        seq: 7,
        event: 'PLAYER_CONNECTED',
        actor_kind: 'player',
        room_fingerprint: '1234567890abcdef1234',
        state_hash: '1234567890abcdef1234',
        game_seq: 2,
        phase: 'lobby',
        connected_players: 2,
        at: 1790527200000,
        event_fingerprint: 'b'.repeat(64),
      },
    ],
    control_fingerprint: 'a'.repeat(64),
    continuity_cookie: 'sync-control-v1.aaaaaaaaaaaaaaaa.7',
  },
};

async function loadHandler(): Promise<PagesHandler> {
  const source = readFileSync(resolve(repoRoot, 'public/_worker.js'), 'utf8');
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
  return module.default as PagesHandler;
}

const assets: FetchBinding = {
  fetch: async () => new Response('asset', { status: 200 }),
};

const fcrApi: FetchBinding = {
  fetch: async () => new Response('unexpected FCR API call', { status: 500 }),
};

test('FCR relays only verified privacy-safe Sync control truth', async () => {
  const handler = await loadHandler();
  let upstreamPath = '';
  let fcrCalls = 0;
  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/api/project-control/sync', {
      headers: { accept: 'application/json' },
    }),
    {
      ASSETS: assets,
      FCR_API: {
        fetch: async () => {
          fcrCalls += 1;
          return new Response('unexpected', { status: 500 });
        },
      },
      SYNC_CONTROL: {
        fetch: async (request) => {
          upstreamPath = new URL(request.url).pathname;
          return Response.json(validSnapshot);
        },
      },
    },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-founder-control-room-project-source')).toBe('sync-party-game');
  expect(upstreamPath).toBe('/api/control-room/snapshot');
  expect(fcrCalls).toBe(0);
  await expect(response.json()).resolves.toEqual(validSnapshot);
});

test('FCR blocks a Sync payload that crosses the privacy membrane', async () => {
  const handler = await loadHandler();
  const leakySnapshot = structuredClone(validSnapshot) as typeof validSnapshot & {
    control: typeof validSnapshot.control & { rooms?: unknown };
  };
  leakySnapshot.control.rooms = {
    PRIVATE: { name: 'Hidden Player', resume_token: 'never-forward-this' },
  };

  const response = await handler.fetch(
    new Request('https://foundercontrolroom.org/api/project-control/sync'),
    {
      ASSETS: assets,
      FCR_API: fcrApi,
      SYNC_CONTROL: { fetch: async () => Response.json(leakySnapshot) },
    },
  );

  expect(response.status).toBe(502);
  const body = await response.text();
  expect(body).toContain('SYNC_CONTROL_PRIVACY_OR_IDENTITY_MISMATCH');
  expect(body).not.toContain('Hidden Player');
  expect(body).not.toContain('never-forward-this');
});

test('renders the Founder Control Room Sync surface on desktop and mobile', async ({ page }) => {
  const html = readFileSync(resolve(repoRoot, 'public/control-room/sync.html'), 'utf8');
  const css = readFileSync(resolve(repoRoot, 'public/control-room/sync.css'), 'utf8');
  const js = readFileSync(resolve(repoRoot, 'public/control-room/sync.js'), 'utf8');
  const documentSource = html
    .replace('<head>', '<head><base href="https://foundercontrolroom.org/">')
    .replace('<link rel="stylesheet" href="/control-room/sync.css" />', `<style>${css}</style>`)
    .replace('<script src="/control-room/sync.js"></script>', `<script>${js}</script>`);

  await page.route('https://foundercontrolroom.org/api/project-control/sync', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(validSnapshot),
    });
  });

  await page.setViewportSize({ width: 1440, height: 980 });
  await page.setContent(documentSource, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('SYNC');
  await expect(page.getByTestId('sync-runtime-state')).toHaveText('RUNTIME VERIFIED');
  await expect(page.locator('#activeRooms')).toHaveText('1');
  await expect(page.locator('#connectedPlayers')).toHaveText('2');
  await expect(page.locator('#runtimeSha')).toHaveText(validSnapshot.runtime.sha);
  await expect(page.locator('#controlFingerprint')).toHaveText(validSnapshot.control.control_fingerprint);
  await expect(page.locator('#continuityCookie')).toContainText('sync-control-v1.');
  await expect(page.getByText('PLAYER_CONNECTED')).toBeVisible();
  await expect(page.getByText(/room 1234567890…/)).toBeVisible();
  await expect(page.getByText(/no room codes, player names, resume tokens, or answer choices/i)).toBeVisible();

  mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ path: resolve(outputDir, 'desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.getByRole('link', { name: 'Open SYNC Control Room ↗' })).toBeVisible();
  await page.screenshot({ path: resolve(outputDir, 'mobile.png'), fullPage: true });
});
