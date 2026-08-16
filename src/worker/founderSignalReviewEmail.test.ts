import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleFounderSignalReviewEmail } from './founderSignalReviewEmail.js';

const contextId = '45bb874d-69d4-4b32-8df2-c7934bb888c5';
const replyAddress = `review+${contextId}@foundercontrolroom.org`;
const reviewToken = '4'.repeat(64);
const reviewSubject = `[Founder Signal Review ${reviewToken}] 1 scheduled post · 2026-08-02T21:20:00.000Z`;
const env = {
  FOUNDER_REVIEW_FOUNDER_EMAIL: 'juss@example.com',
  FOUNDER_REVIEW_EMAIL_DOMAIN: 'foundercontrolroom.org',
  FOUNDER_REVIEW_EMAIL_INGRESS_SECRET:
    'worker-review-email-ingress-secret-32-bytes',
  FOUNDER_REVIEW_INGEST_URL:
    'https://api.foundercontrolroom.org/ingest/founder-review-email',
};

function rawMessage(command = 'cancel all') {
  return new TextEncoder().encode([
    'From: Juss Ray <juss@example.com>',
    `To: ${replyAddress}`,
    `Subject: Re: ${reviewSubject}`,
    'Message-ID: <worker-test@example.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    command,
  ].join('\r\n'));
}

function streamFrom(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function fakeMessage(overrides: Partial<{ from: string; to: string; rawSize: number }> = {}) {
  const bytes = rawMessage();
  return {
    from: overrides.from ?? 'juss@example.com',
    to: overrides.to ?? replyAddress,
    raw: streamFrom(bytes),
    rawSize: overrides.rawSize ?? bytes.byteLength,
    setReject: vi.fn(),
  };
}

function withApiBinding(fetchMock: ReturnType<typeof vi.fn>) {
  return {
    ...env,
    FOUNDER_CONTROL_ROOM_API: {
      fetch: fetchMock,
    },
  };
}

describe('Founder Signal review email Worker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts one signed sanitized unresolved receipt through the private API service binding', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_775_165_100_000);
    const bindingFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    const publicFetch = vi.fn();
    vi.stubGlobal('fetch', publicFetch);
    const message = fakeMessage();

    await handleFounderSignalReviewEmail(message, withApiBinding(bindingFetch));

    expect(message.setReject).not.toHaveBeenCalled();
    expect(bindingFetch).toHaveBeenCalledOnce();
    expect(publicFetch).not.toHaveBeenCalled();

    const [request] = bindingFetch.mock.calls[0] as [Request];
    expect(request.url).toBe(env.FOUNDER_REVIEW_INGEST_URL);
    expect(request.method).toBe('POST');
    expect(request.redirect).toBe('error');

    const body = await request.clone().text();
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      replyContextId: contextId,
      reviewTokenHash: createHash('sha256').update(reviewToken).digest('hex'),
      commandType: 'cancel_all',
      targetChannel: null,
      commandText: 'cancel all',
      senderAddressMatched: true,
      authorizationState: 'intake_only_unresolved',
      executionAllowed: false,
      providerActionsRequested: 0,
      source: 'cloudflare_email_routing',
    });
    expect(body).not.toContain('senderVerified');
    expect(body).not.toContain('juss@example.com');
    expect(body).not.toContain(replyAddress);
    expect(body).not.toContain(reviewToken);

    const timestamp = request.headers.get('x-founder-review-timestamp');
    expect(timestamp).not.toBeNull();
    const expectedSignature = createHmac(
      'sha256',
      env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET,
    )
      .update(timestamp!, 'utf8')
      .update('.', 'utf8')
      .update(body, 'utf8')
      .digest('hex');
    expect(request.headers.get('x-founder-review-signature')).toBe(expectedSignature);
  });

  it('rejects unauthorized or malformed mail without calling the backend', async () => {
    const bindingFetch = vi.fn();
    const message = fakeMessage({ from: 'attacker@example.com' });

    await handleFounderSignalReviewEmail(message, withApiBinding(bindingFetch));

    expect(message.setReject).toHaveBeenCalledWith('Review command rejected');
    expect(bindingFetch).not.toHaveBeenCalled();
  });

  it('rejects declared-size mismatches before MIME parsing', async () => {
    const bindingFetch = vi.fn();
    const message = fakeMessage({ rawSize: 1 });

    await handleFounderSignalReviewEmail(message, withApiBinding(bindingFetch));

    expect(message.setReject).toHaveBeenCalledWith('Review command rejected');
    expect(bindingFetch).not.toHaveBeenCalled();
  });

  it('rejects a weak shared ingress secret before reading mail', async () => {
    const message = fakeMessage();

    await expect(handleFounderSignalReviewEmail(message, {
      ...withApiBinding(vi.fn()),
      FOUNDER_REVIEW_EMAIL_INGRESS_SECRET: 'too-short',
    })).rejects.toThrow('weak_founder_review_email_ingress_secret');
  });

  it('fails closed when the private API service binding is missing', async () => {
    const publicFetch = vi.fn();
    vi.stubGlobal('fetch', publicFetch);
    const message = fakeMessage();

    await expect(handleFounderSignalReviewEmail(message, env)).rejects.toThrow(
      'missing_founder_control_room_api_service_binding',
    );
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it('throws on backend failure so valid founder mail is not silently lost', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    const message = fakeMessage();

    await expect(handleFounderSignalReviewEmail(
      message,
      withApiBinding(bindingFetch),
    )).rejects.toThrow('review_ingest_failed_503');
    expect(message.setReject).not.toHaveBeenCalled();
  });

  it('refuses an alternate ingest destination', async () => {
    const bindingFetch = vi.fn();
    const message = fakeMessage();

    await expect(handleFounderSignalReviewEmail(message, {
      ...withApiBinding(bindingFetch),
      FOUNDER_REVIEW_INGEST_URL: 'https://example.com/ingest',
    })).rejects.toThrow('unapproved_review_ingest_url');
    expect(bindingFetch).not.toHaveBeenCalled();
  });
});
