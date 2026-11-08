import { describe, expect, it, vi } from 'vitest';
import {
  executeFirstPartyPublication,
  validateFirstPartySocialPost,
  type FirstPartySocialPostInput,
} from '../firstPartySocialPublisher.js';
import {
  XFirstPartyAdapterError,
  X_ME_ENDPOINT,
  X_POSTS_ENDPOINT,
  createXFirstPartyAdapter,
} from '../xFirstPartyAdapter.js';

const USER_ID = '123456789';
const POST_ID = '1999999999999999999';
const ACCESS_TOKEN = 'unit-test-user-token-not-for-logs';
const SHA = '899321488f281af150e60a1bc7ff354736d4cf17';
const PROOF_URL = 'https://github.com/jussray/founder-control-room/pull/1027';

function input(): FirstPartySocialPostInput {
  return {
    platform: 'x',
    accountId: USER_ID,
    contentField: 'x_draft',
    text: `FCR checks the account before an approved X post, and verifies the result with provider readback. Proof: ${PROOF_URL}`,
    traction: 'First-party X publishing has a guarded provider boundary.',
    governanceAdvantage: 'Exact founder approval and readback control publication truth.',
    audienceValue: 'People see checked updates, not prompts.',
    investorSignal: 'Direct, governed distribution is possible without a paid content manager.',
    proofLinks: [{ label: 'Implementation', url: PROOF_URL }],
    sourceRepository: 'jussray/founder-control-room',
    sourceCommitSha: SHA,
    mode: 'publish',
    publishAllowed: true,
    founderApprovalId: 'test-approval',
    media: [],
  };
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

const me = (id = USER_ID) => json({ data: { id, username: 'jussco' } });
const write = (text: string) => json({ data: { id: POST_ID, text } }, 201);
const readback = (text: string, authorId = USER_ID) =>
  json({ data: { id: POST_ID, text, author_id: authorId, created_at: '2026-11-08T01:02:00.000Z' } });

function adapter(mock: ReturnType<typeof vi.fn>, token = ACCESS_TOKEN, userId = USER_ID) {
  return createXFirstPartyAdapter({
    accessToken: token,
    userId,
    fetchImpl: mock as unknown as typeof fetch,
  });
}

describe('first-party X publishing', () => {
  it('proves user identity before write and readbacks exact published post', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(me())
      .mockResolvedValueOnce(write(prepared.text))
      .mockResolvedValueOnce(readback(prepared.text));
    const receipt = await executeFirstPartyPublication(prepared, { x: adapter(fetchMock) });

    expect(receipt).toMatchObject({
      platform: 'x',
      externalPostId: POST_ID,
      permalink: `https://x.com/i/web/status/${POST_ID}`,
      contentHash: prepared.contentHash,
      sourceCommitSha: SHA,
      publishedAt: '2026-11-08T01:02:00.000Z',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(X_ME_ENDPOINT);
    expect(fetchMock.mock.calls[1][0]).toBe(X_POSTS_ENDPOINT);
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ text: prepared.text });
    expect(fetchMock.mock.calls[2][0]).toBe(`${X_POSTS_ENDPOINT}/${POST_ID}?tweet.fields=author_id,created_at`);
    expect(fetchMock.mock.calls[2][1].method).toBe('GET');
  });

  it('rejects developer app keys and absent user context without a request', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn();
    await expect(adapter(fetchMock, '').publish(prepared)).rejects.toMatchObject({
      code: 'X_USER_ACCESS_TOKEN_NOT_CONFIGURED',
      truthState: 'FAILED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks the write when the authenticated account differs from the approved account', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn().mockResolvedValueOnce(me('222222222'));
    await expect(adapter(fetchMock).publish(prepared)).rejects.toMatchObject({
      code: 'X_AUTHENTICATED_ACCOUNT_MISMATCH',
      truthState: 'FAILED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a user id that disagrees with the approved post before network access', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn();
    await expect(adapter(fetchMock, ACCESS_TOKEN, '222222222').publish(prepared)).rejects.toMatchObject({
      code: 'X_ACCOUNT_AUTHORITY_MISMATCH',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an explicit 403 write rejection as FAILED without logging credentials', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn().mockResolvedValueOnce(me()).mockResolvedValueOnce(new Response('denied', { status: 403 }));
    let captured: unknown;
    try { await adapter(fetchMock).publish(prepared); } catch (error) { captured = error; }
    expect(captured).toBeInstanceOf(XFirstPartyAdapterError);
    const error = captured as XFirstPartyAdapterError;
    expect(error.truthState).toBe('FAILED');
    expect(error.evidence.httpStatus).toBe(403);
    expect(error.message).not.toContain(ACCESS_TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('consumes write uncertainty on a provider 5xx; no automatic retry', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn().mockResolvedValueOnce(me()).mockResolvedValueOnce(new Response('failed', { status: 503 }));
    await expect(adapter(fetchMock).publish(prepared)).rejects.toMatchObject({
      truthState: 'UNKNOWN',
      retrySafe: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps successful transport UNKNOWN when author, text, or id cannot be verified', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn().mockResolvedValueOnce(me()).mockResolvedValueOnce(write(prepared.text))
      .mockResolvedValueOnce(readback('wrong post', '222222222'));
    await expect(adapter(fetchMock).publish(prepared)).rejects.toMatchObject({
      truthState: 'UNKNOWN',
      retrySafe: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('preserves UNKNOWN and the post id when provider readback is inaccessible', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn().mockResolvedValueOnce(me()).mockResolvedValueOnce(write(prepared.text))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    let captured: unknown;
    try { await adapter(fetchMock).publish(prepared); } catch (error) { captured = error; }
    expect(captured).toBeInstanceOf(XFirstPartyAdapterError);
    const error = captured as XFirstPartyAdapterError;
    expect(error.truthState).toBe('UNKNOWN');
    expect(error.evidence.postId).toBe(POST_ID);
    expect(error.retrySafe).toBe(false);
  });
});
