import { describe, expect, it, vi } from 'vitest';
import { createXFirstPartyAdapter, XFirstPartyAdapterError } from '../xFirstPartyAdapter.js';
import { FIRST_PARTY_PLATFORM_CAPABILITIES } from '../firstPartySocialPublisher.js';
import type { PreparedFirstPartyPublication } from '../firstPartySocialPublisher.js';

const userId = '1234567';
const postId = '1999999999999999999';
const copy =
  'FCR shipping update: exact-head checks, independently observed receipts, and explicit founder approval gate production promotion.';
const prepared = {
  platform: 'x',
  accountId: userId,
  contentField: 'x_draft',
  text: copy,
  traction: 'Exact-head tests and readbacks must be observed.',
  governanceAdvantage: 'Publication is gated by explicit founder approval.',
  audienceValue: 'Accountability for every published provider action.',
  investorSignal: 'Verified execution evidence is distinguished from proposals.',
  proofLinks: [{ label: 'FCR source proof', url: 'https://github.com/jussray/founder-control-room/pull/1069' }],
  proofUrls: ['https://github.com/jussray/founder-control-room/pull/1069'],
  sourceRepository: 'jussray/founder-control-room',
  sourceCommitSha: 'b'.repeat(40),
  mode: 'publish',
  founderApprovalId: 'founder-approved-once',
  media: [],
  characterLimit: 270,
  contentHash: 'a'.repeat(64),
  idempotencyKey: 'c'.repeat(64),
  capability: FIRST_PARTY_PLATFORM_CAPABILITIES.x,
} satisfies PreparedFirstPartyPublication;

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function successfulFetch() {
  return vi.fn()
    .mockResolvedValueOnce(jsonResponse({ data: { id: userId, username: 'authorized' } }))
    .mockResolvedValueOnce(jsonResponse({ data: { id: postId, text: copy } }, 201))
    .mockResolvedValueOnce(jsonResponse({ data: {
      id: postId, text: copy, author_id: userId, created_at: '2026-11-07T15:00:00.000Z',
    } }));
}

describe('X first-party OAuth user-context publication adapter', () => {
  it('authenticates exact user before posting, then requires matching provider readback', async () => {
    const fetchImpl = successfulFetch();
    const result = await createXFirstPartyAdapter({
      accessToken: 'test-only-token',
      userId,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).publish(prepared);
    expect(result).toMatchObject({
      platform: 'x',
      externalPostId: postId,
      permalink: `https://x.com/i/web/status/${postId}`,
      publishedAt: '2026-11-07T15:00:00.000Z',
      contentHash: prepared.contentHash,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.x.com/2/users/me');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.x.com/2/tweets');
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ text: copy });
    expect(fetchImpl.mock.calls[2][0]).toContain(`/2/tweets/${postId}?tweet.fields=author_id%2Ccreated_at`);
    expect(JSON.stringify(result)).not.toContain('test-only-token');
  });

  it('rejects token/account mismatch without making any POST', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { id: '7654321' } }));
    await expect(createXFirstPartyAdapter({
      accessToken: 'test-only-token', userId, fetchImpl: fetchImpl as unknown as typeof fetch,
    }).publish(prepared)).rejects.toMatchObject({
      code: 'X_ACCOUNT_ID_MISMATCH', truthState: 'FAILED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('blocks missing founder authority and media before any network request', async () => {
    const fetchImpl = vi.fn();
    const adapter = createXFirstPartyAdapter({
      accessToken: 'test-only-token', userId, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(adapter.publish({ ...prepared, founderApprovalId: null })).rejects.toBeInstanceOf(XFirstPartyAdapterError);
    await expect(adapter.publish({ ...prepared, media: [{ type: 'image', url: 'https://example.com/image.png' }] })).rejects.toBeInstanceOf(XFirstPartyAdapterError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns UNKNOWN, never successful, if the write response is lost', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { id: userId } }))
      .mockRejectedValueOnce(new Error('network lost after provider write'));
    await expect(createXFirstPartyAdapter({
      accessToken: 'test-only-token', userId, fetchImpl: fetchImpl as unknown as typeof fetch,
    }).publish(prepared)).rejects.toMatchObject({
      code: 'X_WRITE_OUTCOME_UNKNOWN', truthState: 'UNKNOWN', retrySafe: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('refuses to claim PUBLISHED when readback author or content mismatches', async () => {
    for (const altered of [{ author_id: '7654321', text: copy }, { author_id: userId, text: 'different copy' }]) {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: { id: userId } }))
        .mockResolvedValueOnce(jsonResponse({ data: { id: postId, text: copy } }, 201))
        .mockResolvedValueOnce(jsonResponse({ data: {
          id: postId, ...altered, created_at: '2026-11-07T15:00:00.000Z',
        } }));
      await expect(createXFirstPartyAdapter({
        accessToken: 'test-only-token', userId, fetchImpl: fetchImpl as unknown as typeof fetch,
      }).publish(prepared)).rejects.toMatchObject({
        code: 'X_READBACK_MISMATCH', truthState: 'UNKNOWN', retrySafe: false,
        evidence: { postId },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    }
  });

  it('distinguishes 4xx rejection from ambiguous 5xx and never logs provider body', async () => {
    for (const [status, state] of [[403, 'FAILED'], [503, 'UNKNOWN']] as const) {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ data: { id: userId } }))
        .mockResolvedValueOnce(jsonResponse({ errors: [{ detail: 'sensitive provider text' }] }, status));
      try {
        await createXFirstPartyAdapter({
          accessToken: 'test-only-token', userId, fetchImpl: fetchImpl as unknown as typeof fetch,
        }).publish(prepared);
        throw new Error('expected fail-closed provider result');
      } catch (error) {
        expect(error).toBeInstanceOf(XFirstPartyAdapterError);
        const result = error as XFirstPartyAdapterError;
        expect(result.truthState).toBe(state);
        expect(result.message).not.toContain('sensitive provider text');
      }
    }
  });
});
