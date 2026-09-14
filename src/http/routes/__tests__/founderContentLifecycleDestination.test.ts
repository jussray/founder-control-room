import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../founderContentLifecycle.ts', import.meta.url)),
  'utf8',
);

describe('founder content lifecycle publication destination membrane', () => {
  it('fails closed on a stored LinkedIn destination mismatch before provider publication', () => {
    const routeStart = source.indexOf("router.post('/posts/:postId/publish-now'");
    const configuredDestination = source.indexOf('const configuredLinkedInAccountId', routeStart);
    const mismatchGuard = source.indexOf('POST_DESTINATION_ACCOUNT_MISMATCH', routeStart);
    const providerCall = source.indexOf('const result = await deps.publishNow', routeStart);

    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(configuredDestination).toBeGreaterThan(routeStart);
    expect(mismatchGuard).toBeGreaterThan(configuredDestination);
    expect(providerCall).toBeGreaterThan(mismatchGuard);

    const guardSlice = source.slice(configuredDestination, providerCall);
    expect(guardSlice).toContain('process.env.LINKEDIN_AUTHOR_URN');
    expect(guardSlice).toContain('post.accountId !== configuredLinkedInAccountId');
    expect(guardSlice).toContain('published: false');
  });
});
