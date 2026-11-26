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

  it('fails closed on a mismatched or unconfigured X account before authoritative publication', () => {
    const routeStart = source.indexOf("router.post('/posts/:postId/publish-now'");
    const xProviderGuard = source.indexOf("(post.platform === 'x' && post.provider === 'x')", routeStart);
    const accountCheck = source.indexOf('const configuredXAccountId', xProviderGuard);
    const accountMismatch = source.indexOf('post.accountId !== configuredXAccountId', accountCheck);
    const approvalGuard = source.indexOf('POST_APPROVAL_MISMATCH', accountMismatch);
    const providerCall = source.indexOf('const result = await deps.publishNow', approvalGuard);

    expect(xProviderGuard).toBeGreaterThan(routeStart);
    expect(accountCheck).toBeGreaterThan(xProviderGuard);
    expect(accountMismatch).toBeGreaterThan(accountCheck);
    expect(approvalGuard).toBeGreaterThan(accountMismatch);
    expect(providerCall).toBeGreaterThan(approvalGuard);
    const preflight = source.slice(xProviderGuard, providerCall);
    expect(preflight).toContain('process.env.X_USER_ID');
    expect(preflight).toContain('xMismatch');
    expect(preflight).toContain('POST_DESTINATION_ACCOUNT_MISMATCH');
    expect(preflight).toContain('POST_COPY_HASH_MISMATCH');
    expect(preflight).toContain('published: false');
  });

  it('fails closed on a mismatched or unconfigured Facebook Page before authoritative publication', () => {
    const routeStart = source.indexOf("router.post('/posts/:postId/publish-now'");
    const facebookProviderGuard = source.indexOf("(post.platform === 'facebook' && post.provider === 'facebook')", routeStart);
    const configuredPage = source.indexOf('const configuredFacebookPageId', facebookProviderGuard);
    const accountMismatch = source.indexOf('post.accountId !== configuredFacebookPageId', configuredPage);
    const approvalGuard = source.indexOf('POST_APPROVAL_MISMATCH', accountMismatch);
    const providerCall = source.indexOf('const result = await deps.publishNow', approvalGuard);

    expect(facebookProviderGuard).toBeGreaterThan(routeStart);
    expect(configuredPage).toBeGreaterThan(facebookProviderGuard);
    expect(accountMismatch).toBeGreaterThan(configuredPage);
    expect(approvalGuard).toBeGreaterThan(accountMismatch);
    expect(providerCall).toBeGreaterThan(approvalGuard);
    const preflight = source.slice(facebookProviderGuard, providerCall);
    expect(preflight).toContain('process.env.META_FACEBOOK_PAGE_ID');
    expect(preflight).toContain('/^[0-9]{1,24}$/');
    expect(preflight).toContain('facebookMismatch');
    expect(preflight).toContain('POST_DESTINATION_ACCOUNT_MISMATCH');
    expect(preflight).toContain('published: false');
  });
});
