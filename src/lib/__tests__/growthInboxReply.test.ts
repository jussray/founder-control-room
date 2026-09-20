import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  growthInboxReplyStatus,
  sendGmailReply,
  sendWhatsAppReply,
} from '../growthInboxReply.js';

const MANAGED_ENV = [
  'FCR_GMAIL_ACCESS_TOKEN',
  'FCR_GMAIL_REFRESH_TOKEN',
  'FCR_GMAIL_CLIENT_ID',
  'FCR_GMAIL_CLIENT_SECRET',
  'FCR_GMAIL_EXPECTED_EMAIL',
  'FCR_GMAIL_FROM_EMAIL',
  'FCR_WHATSAPP_ACCESS_TOKEN',
  'FCR_WHATSAPP_PHONE_NUMBER_ID',
  'FCR_WHATSAPP_WABA_ID',
  'FCR_WHATSAPP_GRAPH_VERSION',
] as const;

const originalEnv = Object.fromEntries(MANAGED_ENV.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of MANAGED_ENV) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('growthInboxReplyStatus', () => {
  it('fails closed when provider fingerprints or credentials are absent', () => {
    for (const key of MANAGED_ENV) delete process.env[key];
    const status = growthInboxReplyStatus();
    expect(status.mode).toBe('draft_only');
    expect(status.replyOnly).toBe(true);
    expect(status.channels.email.configured).toBe(false);
    expect(status.channels.whatsapp.configured).toBe(false);
  });

  it('requires a pinned Gmail sender identity separately from the authenticated account', () => {
    process.env.FCR_GMAIL_ACCESS_TOKEN = 'test-token';
    process.env.FCR_GMAIL_EXPECTED_EMAIL = 'founder@example.com';
    delete process.env.FCR_GMAIL_FROM_EMAIL;

    const status = growthInboxReplyStatus();
    expect(status.channels.email.configured).toBe(false);
    expect(status.channels.email.missing).toContain('FCR_GMAIL_FROM_EMAIL');
  });
});

describe('sendGmailReply', () => {
  it('verifies mailbox and sender fingerprints and derives the recipient from the referenced message', async () => {
    process.env.FCR_GMAIL_ACCESS_TOKEN = 'test-token';
    process.env.FCR_GMAIL_EXPECTED_EMAIL = 'founder@example.com';
    process.env.FCR_GMAIL_FROM_EMAIL = 'support@example.com';

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ emailAddress: 'founder@example.com' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'gmail-message-1',
        threadId: 'thread-7',
        payload: {
          headers: [
            { name: 'From', value: 'Customer <customer@example.net>' },
            { name: 'Reply-To', value: 'replies@example.net' },
            { name: 'Subject', value: 'Question about the launch' },
            { name: 'Message-ID', value: '<provider-123@example.net>' },
          ],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'sent-2', threadId: 'thread-7' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'sent-2',
        threadId: 'thread-7',
        payload: { headers: [{ name: 'From', value: 'support@example.com' }] },
      }));

    const result = await sendGmailReply({
      messageId: 'gmail-message-1',
      body: 'Thanks. I can help with that.',
    }, fetchMock);

    expect(result).toEqual({
      channel: 'email',
      providerMessageId: 'sent-2',
      threadId: 'thread-7',
      recipient: 'replies@example.net',
      account: 'founder@example.com',
      sender: 'support@example.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const sendInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    const sendBody = JSON.parse(String(sendInit.body)) as { raw: string; threadId: string };
    const decoded = Buffer.from(sendBody.raw, 'base64url').toString('utf8');
    expect(sendBody.threadId).toBe('thread-7');
    expect(decoded).toContain('From: support@example.com');
    expect(decoded).toContain('To: replies@example.net');
    expect(decoded).toContain('Subject: Re: Question about the launch');
    expect(decoded).toContain('In-Reply-To: <provider-123@example.net>');
    expect(decoded).toContain('Thanks. I can help with that.');
  });

  it('blocks a mismatched Gmail account fingerprint before reading or sending the message', async () => {
    process.env.FCR_GMAIL_ACCESS_TOKEN = 'test-token';
    process.env.FCR_GMAIL_EXPECTED_EMAIL = 'founder@example.com';
    process.env.FCR_GMAIL_FROM_EMAIL = 'support@example.com';
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ emailAddress: 'wrong@example.com' }));

    await expect(sendGmailReply({
      messageId: 'gmail-message-1',
      body: 'Reply',
    }, fetchMock)).rejects.toThrow('GMAIL_ACCOUNT_FINGERPRINT_MISMATCH');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('blocks success when Gmail rewrites or rejects the pinned sender identity', async () => {
    process.env.FCR_GMAIL_ACCESS_TOKEN = 'test-token';
    process.env.FCR_GMAIL_EXPECTED_EMAIL = 'founder@example.com';
    process.env.FCR_GMAIL_FROM_EMAIL = 'support@example.com';

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ emailAddress: 'founder@example.com' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'gmail-message-1',
        threadId: 'thread-7',
        payload: {
          headers: [
            { name: 'From', value: 'Customer <customer@example.net>' },
            { name: 'Subject', value: 'Question' },
          ],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'sent-2', threadId: 'thread-7' }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'sent-2',
        threadId: 'thread-7',
        payload: { headers: [{ name: 'From', value: 'founder@example.com' }] },
      }));

    await expect(sendGmailReply({
      messageId: 'gmail-message-1',
      body: 'Reply',
    }, fetchMock)).rejects.toThrow('GMAIL_SENDER_FINGERPRINT_MISMATCH');
  });
});

describe('sendWhatsAppReply', () => {
  it('binds the outbound message to an existing WhatsApp message context', async () => {
    process.env.FCR_WHATSAPP_ACCESS_TOKEN = 'wa-token';
    process.env.FCR_WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.FCR_WHATSAPP_WABA_ID = '987654321';
    process.env.FCR_WHATSAPP_GRAPH_VERSION = 'v25.0';

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.outbound-1' }] }));

    const result = await sendWhatsAppReply({
      recipientWaId: '15551234567',
      replyToMessageId: 'wamid.inbound-1',
      body: 'Got it. I will follow up here.',
    }, fetchMock);

    expect(result).toEqual({
      channel: 'whatsapp',
      providerMessageId: 'wamid.outbound-1',
      recipientWaId: '15551234567',
      phoneNumberId: '123456789',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/v25.0/123456789/messages');
    const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(sent).toMatchObject({
      messaging_product: 'whatsapp',
      to: '15551234567',
      context: { message_id: 'wamid.inbound-1' },
      type: 'text',
    });
  });
});