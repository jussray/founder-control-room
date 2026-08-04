import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const SERVICE_HEADER = 'x-founder-control-room-service';
const SERVICE_IDENTITY = 'founder-control-room';

type AssetBinding = {
  fetch(request: Request): Promise<Response>;
};

type PagesHandler = {
  fetch(request: Request, env: { ASSETS: AssetBinding }): Promise<Response>;
};

async function loadHandler(): Promise<PagesHandler> {
  const source = readFileSync(resolve(repoRoot, 'public/_worker.js'), 'utf8');
  const encoded = Buffer.from(source, 'utf8').toString('base64');
  const module = await import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
  return module.default as PagesHandler;
}

function identifiedResponse(body: string | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set(SERVICE_HEADER, SERVICE_IDENTITY);
  return new Response(body, { ...init, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Cloudflare Pages edge proxy', () => {
  it('serves an existing browser asset without calling the API Worker', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('asset', { status: 200 }));
    const upstreamFetch = vi.fn(async (_request: Request) => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/control-room/app.js'),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('asset');
    expect(assetFetch).toHaveBeenCalledOnce();
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('serves the portable founder console directory from Pages', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('portable console', { status: 200 }));
    const upstreamFetch = vi.fn(async (_request: Request) => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/portable-founder-console/'),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('portable console');
    expect(assetFetch).toHaveBeenCalledOnce();
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('forwards dynamic GET routes without allowing Pages SPA fallback to intercept them', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('unexpected', { status: 200 }));
    const upstreamFetch = vi.fn(async (_request: Request) => identifiedResponse('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/health?source=pages'),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get(SERVICE_HEADER)).toBe(SERVICE_IDENTITY);
    expect(assetFetch).not.toHaveBeenCalled();
    expect(upstreamFetch).toHaveBeenCalledOnce();
    const forwarded = upstreamFetch.mock.calls[0]?.[0];
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded?.url).toBe('https://api.foundercontrolroom.org/health?source=pages');
    expect(forwarded?.redirect).toBe('manual');
    expect(forwarded?.headers.get('x-forwarded-host')).toBe('foundercontrolroom.org');
    expect(forwarded?.headers.get('x-forwarded-proto')).toBe('https');
  });

  it('forwards auth callbacks rather than serving the Pages landing page', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('landing', { status: 200 }));
    const upstreamFetch = vi.fn(async (_request: Request) => identifiedResponse(null, {
      status: 303,
      headers: { location: '/control-room/#verified' },
    }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/auth/callback?token_hash=verified'),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/control-room/#verified');
    expect(assetFetch).not.toHaveBeenCalled();
    const forwarded = upstreamFetch.mock.calls[0]?.[0];
    expect(forwarded?.url).toBe('https://api.foundercontrolroom.org/auth/callback?token_hash=verified');
  });

  it('sends mutations directly to the API Worker without probing static assets', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('unexpected', { status: 500 }));
    const upstreamFetch = vi.fn(async (_request: Request) => identifiedResponse(null, { status: 202 }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(202);
    expect(assetFetch).not.toHaveBeenCalled();
    expect(upstreamFetch).toHaveBeenCalledOnce();
    const forwarded = upstreamFetch.mock.calls[0]?.[0];
    expect(forwarded).toBeInstanceOf(Request);
    expect(forwarded?.method).toBe('POST');
    expect(forwarded?.url).toBe('https://api.foundercontrolroom.org/auth/magic-link');
    expect(forwarded?.headers.get('x-founder-control-room-edge')).toBe('cloudflare-pages');
  });

  it('rejects a false 200 response from the wrong API service', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('unexpected', { status: 500 }));
    const upstreamFetch = vi.fn(async (_request: Request) => new Response('Hello world', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/health', {
        headers: { accept: 'application/json' },
      }),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('120');
    expect(response.headers.get('x-founder-control-room-degraded')).toBe(
      'API_SERVICE_IDENTITY_MISMATCH',
    );
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Founder Control Room is temporarily unavailable.',
      code: 'API_SERVICE_IDENTITY_MISMATCH',
      retryAfterSeconds: 120,
    });
  });

  it('renders an accessible recovery screen for browser navigation during a Cloudflare 52x', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('unexpected', { status: 500 }));
    const upstreamFetch = vi.fn(async (_request: Request) => new Response('Connection timed out', {
      status: 522,
    }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/auth/callback?type=magiclink', {
        headers: { accept: 'text/html' },
      }),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('retry-after')).toBe('120');
    expect(response.headers.get('x-founder-control-room-degraded')).toBe('API_UPSTREAM_52X');
    const html = await response.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('href="/auth/callback?type=magiclink"');
    expect(html).toContain('Try again');
    expect(html).toContain('Return to control room');
  });

  it('returns a fail-closed JSON response when the API Worker cannot be reached', async () => {
    const handler = await loadHandler();
    const assetFetch = vi.fn(async (_request: Request) => new Response('unexpected', { status: 500 }));
    const upstreamFetch = vi.fn(async (_request: Request) => {
      throw new Error('network unavailable');
    });
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await handler.fetch(
      new Request('https://foundercontrolroom.org/version', {
        headers: { accept: 'application/json' },
      }),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'API_UPSTREAM_UNREACHABLE',
    });
  });
});
