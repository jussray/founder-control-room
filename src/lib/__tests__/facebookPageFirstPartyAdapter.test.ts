import { describe, expect, it, vi } from 'vitest';
import {
  validateFirstPartySocialPost,
  type FirstPartySocialPostInput,
} from '../firstPartySocialPublisher.js';
import {
  createFacebookPageFirstPartyAdapter,
  FacebookPageFirstPartyAdapterError,
} from '../facebookPageFirstPartyAdapter.js';

const PAGE_ID = '123456789';
const POST_ID = `${PAGE_ID}_987654321`;
const TOKEN = 'sensitive-test-page-token';
const PROOF = 'https://github.com/jussray/founder-control-room/commit/30494e464b4c25c4a1454350edf92b3a95fa1123';
const COPY = `Our founder-controlled publisher verifies platform receipts before claiming a post shipped. Implementation proof: ${PROOF}`;

function prepared() {
  const input: FirstPartySocialPostInput = {
    platform: 'facebook',
    accountId: PAGE_ID,
    contentField: 'facebook_draft',
    text: COPY,
    traction: 'Validated native post receipt',
    governanceAdvantage: 'Exact founder approval and no blind retry',
    audienceValue: 'Public source-backed product updates',
    investorSignal: 'First-party distribution',
    proofLinks: [{ label: 'Repository', url: PROOF }],
    sourceRepository: 'jussray/founder-control-room',
    sourceCommitSha: 'a'.repeat(40),
    mode: 'publish',
    publishAllowed: true,
    founderApprovalId: 'approval-1',
    platformCharacterLimit: 6000,
    media: [],
  };
  return validateFirstPartySocialPost(input);
}

function adapter(fetchMock: ReturnType<typeof vi.fn>) {
  return createFacebookPageFirstPartyAdapter({
    accessToken: TOKEN,
    pageId: PAGE_ID,
    apiVersion: 'v27.0',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    from: { id: PAGE_ID },
    message: COPY,
    created_time: '2026-11-20T15:00:00+0000',
    permalink_url: 'https://www.facebook.com/123456789/posts/987654321',
    is_published: true,
    ...overrides,
  };
}

function successFetch(readbackOverrides: Record<string, unknown> = {}) {
  return vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: POST_ID }), {
      status: 200,
      headers: { 'x-fb-trace-id': 'test-trace' },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify(result(readbackOverrides)), { status: 200 }));
}

describe('first-party Facebook Page text adapter', () => {
  it('proves the Page, publishes exact copy, then independently confirms the native receipt', async () => {
    const fetchMock = successFetch();
    const post = prepared();
    const receipt = await adapter(fetchMock).publish(post);
    expect(receipt).toMatchObject({
      platform: 'facebook',
      externalPostId: POST_ID,
      contentHash: post.contentHash,
      sourceCommitSha: post.sourceCommitSha,
      providerRequestId: 'test-trace',
      permalink: 'https://www.facebook.com/123456789/posts/987654321',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain('/me?fields=id%2Cname');
    expect(fetchMock.mock.calls[1][0]).toContain(`/${PAGE_ID}/feed`);
    const sent = new URLSearchParams(fetchMock.mock.calls[1][1].body);
    expect(sent.get('message')).toBe(COPY);
    expect(sent.get('published')).toBe('true');
    expect(JSON.stringify(receipt)).not.toContain(TOKEN);
    expect(fetchMock.mock.calls[1][0]).not.toContain(TOKEN);
    expect(fetchMock.mock.calls[1][1].body).not.toContain(TOKEN);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('refuses to write when the server-owned token belongs to a different Page', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '555555' }), { status: 200 }),
    );
    await expect(adapter(fetchMock).publish(prepared())).rejects.toMatchObject({
      code: 'FACEBOOK_PAGE_ACCOUNT_ID_MISMATCH',
      truthState: 'FAILED',
      retrySafe: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed before any request for invalid token, Page, and Graph version', async () => {
    const fetchMock = vi.fn();
    const instance = createFacebookPageFirstPartyAdapter({
      accessToken: '',
      pageId: PAGE_ID,
      apiVersion: 'v27.0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(instance.publish(prepared())).rejects.toBeInstanceOf(FacebookPageFirstPartyAdapterError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a successful write with a wrong author, copy, or publication state as UNKNOWN', async () => {
    for (const overrides of [
      { from: { id: '555555' } },
      { message: 'Changed after approval' },
      { is_published: false },
      { permalink_url: 'https://attacker.example/post' },
    ]) {
      const fetchMock = successFetch(overrides);
      await expect(adapter(fetchMock).publish(prepared())).rejects.toMatchObject({
        code: 'FACEBOOK_PAGE_READBACK_MISMATCH',
        truthState: 'UNKNOWN',
        retrySafe: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    }
  });

  it('never repeats a write when readback is denied or unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: PAGE_ID }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: POST_ID }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(adapter(fetchMock).publish(prepared())).rejects.toMatchObject({
      code: 'FACEBOOK_PAGE_READBACK_REJECTED',
      truthState: 'UNKNOWN',
      retrySafe: false,
    });
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
  });

  it('does not leak provider credentials in rejection messages', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error(`invalid token ${TOKEN}`));
    try {
      await adapter(fetchMock).publish(prepared());
      throw new Error('Expected a credential-safe rejection');
    } catch (error) {
      expect(String(error)).toContain('FACEBOOK_PAGE_IDENTITY_UNAVAILABLE');
      expect(String(error)).not.toContain(TOKEN);
    }
  });
});
