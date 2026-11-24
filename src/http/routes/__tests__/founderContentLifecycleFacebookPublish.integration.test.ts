import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFounderContentLifecycleRouter } from '../founderContentLifecycle.js';
import type { StoredFounderContentPost } from '../../../lib/founderContentLifecycleStore.js';

const PAGE_ID = '123456789';
const POST_ID = '11111111-1111-4111-8111-111111111111';
const HASH = 'a'.repeat(64);

function storedPost(overrides: Partial<StoredFounderContentPost> = {}): StoredFounderContentPost {
  return {
    contract: 'fcr/founder-content-lifecycle-store@v1',
    postId: POST_ID,
    founderUserId: 'founder-user-1',
    provider: 'facebook',
    platform: 'facebook',
    accountId: PAGE_ID,
    title: 'Facebook Page proof',
    publicPayload: { draft_text: 'Exact approved Facebook Page text.' },
    contentHash: HASH,
    mediaCount: 0,
    status: 'approved',
    providerWriteState: 'not_attempted',
    approvalId: 'fca:approval-1',
    executionId: null,
    scheduledAt: null,
    postedAt: null,
    externalPostId: null,
    permalink: null,
    retryCount: 0,
    lastError: null,
    lastMetricsSyncAt: null,
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...overrides,
  };
}

function appFor(post: StoredFounderContentPost) {
  const publishNow = vi.fn(async () => ({
    ok: false,
    code: 'FACEBOOK_NOT_CONFIGURED',
    status: 503,
    contract: 'fcr/first-party-founder-content-publish@v1',
    truthState: 'BLOCKED',
    published: false,
    retrySafe: false,
    freshApprovalMayRetry: false,
    executionId: null,
    receipt: null,
    providerEvidence: null,
    reasons: ['mocked executor is deliberately disabled in this route test'],
  }));
  const recordEvent = vi.fn(async () => ({}));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { founder: { userId: 'founder-user-1', email: 'founder@example.com' } });
    next();
  });
  app.use('/lifecycle', createFounderContentLifecycleRouter({
    getPost: vi.fn(async () => post),
    publishNow: publishNow as never,
    recordEvent: recordEvent as never,
  }));
  return { app, publishNow, recordEvent };
}

function requestBody() {
  return {
    proposal: {},
    approval_id: 'fca:approval-1',
    confirmation: {
      confirm_publication: true,
      authorization_hash: 'c'.repeat(64),
      public_payload_hash: HASH,
    },
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('Facebook Page publish-now lifecycle route', () => {
  it('dispatches only the exact stored Facebook Page after server Page identity matches', async () => {
    vi.stubEnv('META_FACEBOOK_PAGE_ID', PAGE_ID);
    const post = storedPost();
    const { app, publishNow, recordEvent } = appFor(post);

    const response = await request(app)
      .post(`/lifecycle/posts/${POST_ID}/publish-now`)
      .send(requestBody());

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'FACEBOOK_NOT_CONFIGURED',
      truthState: 'BLOCKED',
      published: false,
    });
    expect(publishNow).toHaveBeenCalledTimes(1);
    expect(publishNow).toHaveBeenCalledWith(
      expect.objectContaining({
        approval_id: 'fca:approval-1',
        confirmation: expect.objectContaining({
          confirm_publication: true,
          public_payload_hash: HASH,
        }),
      }),
      { founderUserId: 'founder-user-1', founderIdentity: 'founder@example.com' },
    );
    expect(recordEvent).toHaveBeenCalledTimes(1);
  });

  it('blocks an account mismatch before the authoritative publisher is called', async () => {
    vi.stubEnv('META_FACEBOOK_PAGE_ID', '987654321');
    const { app, publishNow } = appFor(storedPost());

    const response = await request(app)
      .post(`/lifecycle/posts/${POST_ID}/publish-now`)
      .send(requestBody());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'POST_DESTINATION_ACCOUNT_MISMATCH',
      published: false,
    });
    expect(publishNow).not.toHaveBeenCalled();
  });

  it('blocks missing or malformed server Page identity before the authoritative publisher is called', async () => {
    vi.stubEnv('META_FACEBOOK_PAGE_ID', 'not-a-page-id');
    const { app, publishNow } = appFor(storedPost());

    const response = await request(app)
      .post(`/lifecycle/posts/${POST_ID}/publish-now`)
      .send(requestBody());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('POST_DESTINATION_ACCOUNT_MISMATCH');
    expect(publishNow).not.toHaveBeenCalled();
  });

  it('blocks Facebook drafts with media because the native Page adapter is text-only', async () => {
    vi.stubEnv('META_FACEBOOK_PAGE_ID', PAGE_ID);
    const { app, publishNow } = appFor(storedPost({ mediaCount: 1 }));

    const response = await request(app)
      .post(`/lifecycle/posts/${POST_ID}/publish-now`)
      .send(requestBody());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      code: 'FACEBOOK_PAGE_TEXT_ONLY',
      published: false,
    });
    expect(publishNow).not.toHaveBeenCalled();
  });

  it('does not route a Facebook Page record through another provider lane', async () => {
    vi.stubEnv('META_FACEBOOK_PAGE_ID', PAGE_ID);
    const { app, publishNow } = appFor(storedPost({ provider: 'linkedin' }));

    const response = await request(app)
      .post(`/lifecycle/posts/${POST_ID}/publish-now`)
      .send(requestBody());

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PROVIDER_PUBLISH_NOW_ADAPTER_NOT_READY');
    expect(publishNow).not.toHaveBeenCalled();
  });
});
