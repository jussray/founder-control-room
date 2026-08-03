import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleFounderSignalReviewEmail } from './founderSignalReviewEmail.js';

const contextId = '45bb874d-69d4-4b32-8df2-c7934bb888c5';
const replyAddress = `review+${contextId}@foundercontrolroom.org`;
const env = {
  FOUNDER_REVIEW_FOUNDER_EMAIL: 'juss@example.com',
  FOUNDER_REVIEW_EMAIL_DOMAIN: 'foundercontrolroom.org',
  FOUNDER_REVIEW_EMAIL_INGRESS_SECRET: 'worker-ingress-secret',
  FOUNDER_REVIEW_INGEST_URL:
    'https://api.foundercontrolroom.org/ingest/founder-review-email',
};

function rawMessage(command = 'cancel all') {
  return new TextEncoder().encode([
    'From: Juss Ray <juss@example.com>',
    `To: ${replyAddress}`,
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

describe('Founder Signal review email Worker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts one signed sanitized receipt to the approved backend route', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_775_165_100_000);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const message = fakeMessage();

    await handleFounderSignalReviewEmail(message, env);

    expect(message.setReject).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(env.FOUNDER_REVIEW_INGEST_URL);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');

    const body = String(init.body);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      replyContextId: contextId,
      commandType: 'cancel_all',
      targetChannel: null,
      commandText: 'cancel all',
      senderVerified: true,
      providerActionsRequested: 0,
      source: 'cloudflare_email_routing',
    });
    expect(body).not.toContain('juss@example.com');
    expect(body).not.toContain(replyAddress);

    const headers = init.headers as Record<string, string>;
    const timestamp = headers['x-founder-review-timestamp'];
    const expectedSignature = createHmac(
      'sha256',
      env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET,
    )
      .update(timestamp, 'utf8')
      .update('.', 'utf8')
      .update(body, 'utf8')
      .digest('hex');
    expect(headers['x-founder-review-signature']).toBe(expectedSignature);
  });

  it('rejects unauthorized or malformed mail without calling the backend', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const message = fakeMessage({ from: 'attacker@example.com' });

    await handleFounderSignalReviewEmail(message, env);

    expect(message.setReject).toHaveBeenCalledWith('Review command rejected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects declared-size mismatches before MIME parsing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const message = fakeMessage({ rawSize: 1 });

    await handleFounderSignalReviewEmail(message, env);

    expect(message.setReject).toHaveBeenCalledWith('Review command rejected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on backend failure so valid founder mail is not silently lost', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const message = fakeMessage();

    await expect(handleFounderSignalReviewEmail(message, env)).rejects.toThrow(
      'review_ingest_failed_503',
    );
    expect(message.setReject).not.toHaveBeenCalled();
  });

  it('refuses an alternate ingest destination', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const message = fakeMessage();

    await expect(handleFounderSignalReviewEmail(message, {
      ...env,
      FOUNDER_REVIEW_INGEST_URL: 'https://example.com/ingest',
    })).rejects.toThrow('unapproved_review_ingest_url');
  });
});
