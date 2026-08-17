import { describe, expect, it, vi } from 'vitest';
import {
  executeFirstPartyPublication,
  validateFirstPartySocialPost,
  type FirstPartySocialPostInput,
} from '../firstPartySocialPublisher.js';
import {
  LINKEDIN_POSTS_ENDPOINT,
  LinkedInFirstPartyAdapterError,
  createLinkedInFirstPartyAdapter,
} from '../linkedinFirstPartyAdapter.js';

const AUTHOR = 'urn:li:person:ray';
const POST_URN = 'urn:li:share:123456789';
const SHA = '8e63605ca4f2c5db223b3e3b0bb9fd7259a7135c';
const PROOF_URL = 'https://github.com/jussray/founder-control-room/pull/184';
const ACCESS_TOKEN = 'test-access-token-never-log-this';

function input(overrides: Partial<FirstPartySocialPostInput> = {}): FirstPartySocialPostInput {
  return {
    platform: 'linkedin',
    accountId: AUTHOR,
    contentField: 'linkedin_draft',
    text:
      `Founder Control Room now has a first-party LinkedIn publication boundary. ` +
      `The provider write is not called published until exact readback confirms it. ` +
      `Implementation proof: ${PROOF_URL}`,
    traction: 'A first-party LinkedIn adapter is implemented behind the governed publisher.',
    governanceAdvantage: 'Publication remains UNKNOWN until provider readback verifies the exact post.',
    audienceValue: 'Followers receive source-backed progress without exposing internal operating details.',
    investorSignal: 'Distribution is becoming a first-party governed capability rather than a SaaS dependency.',
    proofLinks: [{ label: 'Implementation proof', url: PROOF_URL }],
    sourceRepository: 'jussray/founder-control-room',
    sourceCommitSha: SHA,
    mode: 'publish',
    publishAllowed: true,
    founderApprovalId: 'founder-approval:first-party-linkedin-001',
    media: [],
    ...overrides,
  };
}

function readback(commentary: string) {
  return {
    id: POST_URN,
    author: AUTHOR,
    commentary,
    lifecycleState: 'PUBLISHED',
    visibility: 'PUBLIC',
    publishedAt: 1_786_990_000_000,
  };
}

function adapter(fetchMock: ReturnType<typeof vi.fn>) {
  return createLinkedInFirstPartyAdapter({
    accessToken: ACCESS_TOKEN,
    authorUrn: AUTHOR,
    apiVersion: '202607',
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

describe('first-party LinkedIn adapter', () => {
  it('publishes through the official Posts endpoint and accepts success only after exact readback', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 201,
          headers: {
            'x-restli-id': POST_URN,
            'x-restli-request-id': 'request-123',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(readback(prepared.text)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const receipt = await executeFirstPartyPublication(prepared, {
      linkedin: adapter(fetchMock),
    });

    expect(receipt.externalPostId).toBe(POST_URN);
    expect(receipt.permalink).toBe(`https://www.linkedin.com/feed/update/${POST_URN}/`);
    expect(receipt.contentHash).toBe(prepared.contentHash);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [writeUrl, writeInit] = fetchMock.mock.calls[0];
    expect(writeUrl).toBe(LINKEDIN_POSTS_ENDPOINT);
    expect(writeInit.method).toBe('POST');
    expect(writeInit.headers['Linkedin-Version']).toBe('202607');
    expect(writeInit.headers['X-Restli-Protocol-Version']).toBe('2.0.0');
    const body = JSON.parse(writeInit.body);
    expect(body).toMatchObject({
      author: AUTHOR,
      commentary: prepared.text,
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
    });

    const [readUrl, readInit] = fetchMock.mock.calls[1];
    expect(readUrl).toBe(
      `${LINKEDIN_POSTS_ENDPOINT}/${encodeURIComponent(POST_URN)}?viewContext=AUTHOR`,
    );
    expect(readInit.method).toBe('GET');
  });

  it('keeps a 201 write UNKNOWN when member readback permission is unavailable', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 201, headers: { 'x-restli-id': POST_URN } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    let captured: unknown;
    try {
      await executeFirstPartyPublication(prepared, { linkedin: adapter(fetchMock) });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LinkedInFirstPartyAdapterError);
    const error = captured as LinkedInFirstPartyAdapterError;
    expect(error.truthState).toBe('UNKNOWN');
    expect(error.retrySafe).toBe(false);
    expect(error.evidence.postUrn).toBe(POST_URN);
    expect(error.evidence.httpStatus).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an explicit 4xx write rejection as FAILED without exposing the token', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('denied', { status: 401 }));

    let captured: unknown;
    try {
      await executeFirstPartyPublication(prepared, { linkedin: adapter(fetchMock) });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LinkedInFirstPartyAdapterError);
    const error = captured as LinkedInFirstPartyAdapterError;
    expect(error.truthState).toBe('FAILED');
    expect(error.retrySafe).toBe(true);
    expect(error.evidence.httpStatus).toBe(401);
    expect(JSON.stringify(error)).not.toContain(ACCESS_TOKEN);
    expect(error.message).not.toContain(ACCESS_TOKEN);
  });

  it('treats transport failure or provider 5xx after write dispatch as UNKNOWN and non-retryable', async () => {
    const prepared = validateFirstPartySocialPost(input());

    for (const firstResult of [new Error('socket lost'), new Response(null, { status: 503 })]) {
      const fetchMock = vi.fn();
      if (firstResult instanceof Error) fetchMock.mockRejectedValueOnce(firstResult);
      else fetchMock.mockResolvedValueOnce(firstResult);

      let captured: unknown;
      try {
        await executeFirstPartyPublication(prepared, { linkedin: adapter(fetchMock) });
      } catch (error) {
        captured = error;
      }

      expect(captured).toBeInstanceOf(LinkedInFirstPartyAdapterError);
      const error = captured as LinkedInFirstPartyAdapterError;
      expect(error.truthState).toBe('UNKNOWN');
      expect(error.retrySafe).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('fails closed when account authority is mutated before any provider request', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi.fn();
    const mutatedAdapter = createLinkedInFirstPartyAdapter({
      accessToken: ACCESS_TOKEN,
      authorUrn: 'urn:li:person:someone-else',
      apiVersion: '202607',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      executeFirstPartyPublication(prepared, { linkedin: mutatedAdapter }),
    ).rejects.toThrow('LINKEDIN_ACCOUNT_AUTHORITY_MISMATCH');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps mismatched provider readback UNKNOWN instead of manufacturing a publication receipt', async () => {
    const prepared = validateFirstPartySocialPost(input());
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 201, headers: { 'x-restli-id': POST_URN } }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...readback('different copy'), author: 'urn:li:person:someone-else' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    let captured: unknown;
    try {
      await executeFirstPartyPublication(prepared, { linkedin: adapter(fetchMock) });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(LinkedInFirstPartyAdapterError);
    const error = captured as LinkedInFirstPartyAdapterError;
    expect(error.truthState).toBe('UNKNOWN');
    expect(error.code).toContain('LINKEDIN_READBACK_AUTHOR_MISMATCH');
    expect(error.code).toContain('LINKEDIN_READBACK_COPY_MISMATCH');
    expect(error.retrySafe).toBe(false);
  });
});
