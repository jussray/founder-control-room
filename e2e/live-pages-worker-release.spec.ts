import { createHash } from 'node:crypto';
import { expect, test, type APIResponse } from '@playwright/test';

const expectedSha = process.env.EXPECTED_HEAD_SHA ?? '';
const canonicalOrigin = 'https://www.foundercontrolroom.org';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function expectContentSignal(response: APIResponse, expected: readonly string[]): void {
  const raw = response.headers()['content-signal'] ?? '';
  const actual = raw.split(',').map((token) => token.trim()).filter(Boolean).sort();
  expect(actual).toEqual([...expected].sort());
}

test('live Pages front door, discovery contract, and API proxy resolve the exact approved release', async ({ page, request }, testInfo) => {
  expect(expectedSha).toMatch(/^[0-9a-f]{40}$/);

  const directVersion = await request.get('/version', {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(directVersion.ok()).toBe(true);
  expect(directVersion.headers()['x-founder-control-room-service']).toBe('founder-control-room');
  await expect(directVersion.json()).resolves.toMatchObject({
    service: 'founder-control-room',
    gitSha: expectedSha,
  });

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response?.ok()).toBe(true);
  await expect(page.getByText('Founder Control Room', { exact: false }).first()).toBeVisible();

  const browserVersion = await page.evaluate(async () => {
    const response = await fetch('/version', {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    return {
      status: response.status,
      service: response.headers.get('x-founder-control-room-service'),
      body: await response.json(),
    };
  });

  expect(browserVersion.status).toBe(200);
  expect(browserVersion.service).toBe('founder-control-room');
  expect(browserVersion.body).toMatchObject({
    service: 'founder-control-room',
    gitSha: expectedSha,
  });

  const publicSignal = ['ai-train=no', 'search=yes', 'ai-input=yes'] as const;
  const privateSignal = ['ai-train=no', 'search=no', 'ai-input=no'] as const;
  const receipt: Record<string, unknown> = {
    expectedSha,
    canonicalOrigin,
    surfaces: {},
  };
  const surfaces = receipt.surfaces as Record<string, unknown>;

  const robots = await request.get(`${canonicalOrigin}/robots.txt`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(robots.status()).toBe(200);
  expectContentSignal(robots, publicSignal);
  const robotsBody = await robots.text();
  expect(robotsBody).toContain('User-agent: OAI-SearchBot');
  expect(robotsBody).toContain('User-agent: GPTBot');
  expect(robotsBody).toContain('Allow: /crawlers.json$');
  expect(robotsBody).toContain(`Sitemap: ${canonicalOrigin}/sitemap.xml`);
  surfaces.robots = {
    url: robots.url(),
    status: robots.status(),
    contentSignal: robots.headers()['content-signal'] ?? null,
    sha256: sha256(robotsBody),
  };

  const sitemap = await request.get(`${canonicalOrigin}/sitemap.xml`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(sitemap.status()).toBe(200);
  expectContentSignal(sitemap, publicSignal);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain(`<loc>${canonicalOrigin}/</loc>`);
  expect(sitemapBody).toContain(`<loc>${canonicalOrigin}/juss-rayy/</loc>`);
  expect(sitemapBody).toContain(`<loc>${canonicalOrigin}/work.html</loc>`);
  surfaces.sitemap = {
    url: sitemap.url(),
    status: sitemap.status(),
    contentSignal: sitemap.headers()['content-signal'] ?? null,
    sha256: sha256(sitemapBody),
  };

  const llms = await request.get(`${canonicalOrigin}/llms.txt`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(llms.status()).toBe(200);
  expectContentSignal(llms, publicSignal);
  const llmsBody = await llms.text();
  expect(llmsBody).toContain(`Canonical founder profile: ${canonicalOrigin}/juss-rayy/`);
  expect(llmsBody).toContain(`Public work/use directory: ${canonicalOrigin}/work.html`);
  expect(llmsBody).toContain('A passing test is not automatically production proof');
  surfaces.llms = {
    url: llms.url(),
    status: llms.status(),
    contentSignal: llms.headers()['content-signal'] ?? null,
    sha256: sha256(llmsBody),
  };

  const crawlers = await request.get(`${canonicalOrigin}/crawlers.json`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(crawlers.status()).toBe(200);
  expectContentSignal(crawlers, publicSignal);
  const crawlersBody = await crawlers.text();
  const crawlerPolicy = JSON.parse(crawlersBody) as {
    schema?: string;
    canonical_origin?: string;
    policy?: Record<string, string>;
    bots?: Record<string, string>;
  };
  expect(crawlerPolicy).toMatchObject({
    schema: 'juss/ai-crawler-contract@v1',
    canonical_origin: canonicalOrigin,
    policy: {
      search_discovery: 'allow_bounded_public_paths',
      user_directed_retrieval: 'allow_bounded_public_paths',
      model_training: 'deny',
      bulk_dataset_collection: 'deny',
      write_or_action_authority: 'none',
    },
  });
  expect(crawlerPolicy.bots?.['OAI-SearchBot']).toBe('allow_bounded_public_paths');
  expect(crawlerPolicy.bots?.GPTBot).toBe('deny');
  surfaces.crawlers = {
    url: crawlers.url(),
    status: crawlers.status(),
    contentSignal: crawlers.headers()['content-signal'] ?? null,
    sha256: sha256(crawlersBody),
  };

  const demo = await request.get(`${canonicalOrigin}/demo/`, {
    headers: { 'cache-control': 'no-cache' },
  });
  expect(demo.status()).toBe(200);
  expectContentSignal(demo, privateSignal);
  expect(demo.headers()['cache-control'] ?? '').toContain('no-store');
  const demoBody = await demo.text();
  surfaces.privateDemo = {
    url: demo.url(),
    status: demo.status(),
    contentSignal: demo.headers()['content-signal'] ?? null,
    cacheControl: demo.headers()['cache-control'] ?? null,
    sha256: sha256(demoBody),
  };

  await testInfo.attach('live-discovery-receipt.json', {
    body: JSON.stringify(receipt, null, 2),
    contentType: 'application/json',
  });
});
