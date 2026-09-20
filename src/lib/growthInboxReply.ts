import { Buffer } from 'node:buffer';

export type GrowthInboxReplyChannel = 'email' | 'whatsapp';

export interface GrowthInboxReplyStatus {
  contract: 'fcr/growth-inbox-reply@v1';
  mode: 'draft_only';
  replyOnly: true;
  channels: {
    email: {
      configured: boolean;
      expectedAccount: string | null;
      fromAddress: string | null;
      fingerprint: string | null;
      missing: string[];
    };
    whatsapp: {
      configured: boolean;
      phoneNumberId: string | null;
      wabaId: string | null;
      graphVersion: string | null;
      fingerprint: string | null;
      missing: string[];
    };
  };
}

export interface GmailReplyInput {
  messageId: string;
  body: string;
}

export interface GmailReplyResult {
  channel: 'email';
  providerMessageId: string;
  threadId: string;
  recipient: string;
  account: string;
  sender: string;
}

export interface WhatsAppReplyInput {
  recipientWaId: string;
  replyToMessageId: string;
  body: string;
}

export interface WhatsAppReplyResult {
  channel: 'whatsapp';
  providerMessageId: string;
  recipientWaId: string;
  phoneNumberId: string;
}

type FetchLike = typeof fetch;

type GmailHeader = { name?: unknown; value?: unknown };
type GmailMessage = {
  id?: unknown;
  threadId?: unknown;
  payload?: { headers?: GmailHeader[] };
};

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const MAX_REPLY_LENGTH = 16_000;
const MAX_WHATSAPP_TEXT_LENGTH = 4_096;
const SAFE_GRAPH_VERSION = /^v\d+\.\d+$/;
const SAFE_GMAIL_ID = /^[A-Za-z0-9_-]{1,256}$/;
const SAFE_WA_ID = /^\d{7,20}$/;
const SAFE_WA_MESSAGE_ID = /^[A-Za-z0-9._:=\/-]{1,256}$/;

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function emailFromHeader(value: string): string | null {
  const cleaned = oneLine(value);
  const angle = cleaned.match(/<([^<>\s]+@[^<>\s]+)>/);
  const candidate = angle?.[1] ?? cleaned.match(/\b[^\s<>,;]+@[^\s<>,;]+\b/)?.[0] ?? null;
  if (!candidate) return null;
  const normalized = candidate.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? normalized : null;
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const row = headers?.find((item) => typeof item.name === 'string' && item.name.toLowerCase() === name.toLowerCase());
  return typeof row?.value === 'string' && row.value.trim() ? row.value.trim() : null;
}

function replySubject(subject: string | null): string {
  const safe = oneLine(subject ?? '').slice(0, 900);
  if (!safe) return 'Re:';
  return /^re\s*:/i.test(safe) ? safe : `Re: ${safe}`;
}

function configuredGmailMissing(): string[] {
  const missing: string[] = [];
  if (!env('FCR_GMAIL_EXPECTED_EMAIL')) missing.push('FCR_GMAIL_EXPECTED_EMAIL');
  const fromAddress = env('FCR_GMAIL_FROM_EMAIL');
  if (!fromAddress) missing.push('FCR_GMAIL_FROM_EMAIL');
  else if (!emailFromHeader(fromAddress)) missing.push('FCR_GMAIL_FROM_EMAIL must be a valid email address');
  const directToken = env('FCR_GMAIL_ACCESS_TOKEN');
  const refreshReady = Boolean(
    env('FCR_GMAIL_REFRESH_TOKEN')
      && env('FCR_GMAIL_CLIENT_ID')
      && env('FCR_GMAIL_CLIENT_SECRET'),
  );
  if (!directToken && !refreshReady) {
    missing.push('FCR_GMAIL_ACCESS_TOKEN or refresh-token OAuth secret set');
  }
  return missing;
}

function configuredWhatsAppMissing(): string[] {
  const required = [
    'FCR_WHATSAPP_ACCESS_TOKEN',
    'FCR_WHATSAPP_PHONE_NUMBER_ID',
    'FCR_WHATSAPP_WABA_ID',
    'FCR_WHATSAPP_GRAPH_VERSION',
  ] as const;
  return required.filter((name) => !env(name));
}

export function growthInboxReplyStatus(): GrowthInboxReplyStatus {
  const gmailMissing = configuredGmailMissing();
  const whatsappMissing = configuredWhatsAppMissing();
  const expectedAccount = env('FCR_GMAIL_EXPECTED_EMAIL')?.toLowerCase() ?? null;
  const fromAddress = emailFromHeader(env('FCR_GMAIL_FROM_EMAIL') ?? '');
  const phoneNumberId = env('FCR_WHATSAPP_PHONE_NUMBER_ID');
  const wabaId = env('FCR_WHATSAPP_WABA_ID');
  const graphVersion = env('FCR_WHATSAPP_GRAPH_VERSION');

  return {
    contract: 'fcr/growth-inbox-reply@v1',
    mode: 'draft_only',
    replyOnly: true,
    channels: {
      email: {
        configured: gmailMissing.length === 0,
        expectedAccount,
        fromAddress,
        fingerprint: expectedAccount && fromAddress
          ? `gmail:account=${expectedAccount}:from=${fromAddress}`
          : null,
        missing: gmailMissing,
      },
      whatsapp: {
        configured: whatsappMissing.length === 0 && Boolean(graphVersion && SAFE_GRAPH_VERSION.test(graphVersion)),
        phoneNumberId,
        wabaId,
        graphVersion,
        fingerprint: phoneNumberId && wabaId ? `whatsapp:waba=${wabaId}:phone=${phoneNumberId}` : null,
        missing: graphVersion && !SAFE_GRAPH_VERSION.test(graphVersion)
          ? [...whatsappMissing, 'FCR_WHATSAPP_GRAPH_VERSION must look like vNN.N']
          : whatsappMissing,
      },
    },
  };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function gmailAccessToken(fetchImpl: FetchLike): Promise<string> {
  const direct = env('FCR_GMAIL_ACCESS_TOKEN');
  if (direct) return direct;

  const refreshToken = env('FCR_GMAIL_REFRESH_TOKEN');
  const clientId = env('FCR_GMAIL_CLIENT_ID');
  const clientSecret = env('FCR_GMAIL_CLIENT_SECRET');
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('GMAIL_NOT_CONFIGURED');
  }

  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const payload = await responseJson(response);
  const token = typeof payload.access_token === 'string' ? payload.access_token : null;
  if (!response.ok || !token) throw new Error('GMAIL_TOKEN_REFRESH_FAILED');
  return token;
}

async function gmailJson(
  fetchImpl: FetchLike,
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await responseJson(response);
  if (!response.ok) throw new Error(`GMAIL_PROVIDER_${response.status}`);
  return payload;
}

export async function sendGmailReply(
  input: GmailReplyInput,
  fetchImpl: FetchLike = fetch,
): Promise<GmailReplyResult> {
  const messageId = input.messageId.trim();
  const body = input.body.trim();
  if (!SAFE_GMAIL_ID.test(messageId)) throw new Error('GMAIL_MESSAGE_ID_INVALID');
  if (!body || body.length > MAX_REPLY_LENGTH) throw new Error('REPLY_BODY_INVALID');

  const status = growthInboxReplyStatus();
  if (!status.channels.email.configured || !status.channels.email.expectedAccount || !status.channels.email.fromAddress) {
    throw new Error('GMAIL_NOT_CONFIGURED');
  }

  const token = await gmailAccessToken(fetchImpl);
  const profile = await gmailJson(fetchImpl, token, `${GMAIL_API}/profile`);
  const account = typeof profile.emailAddress === 'string' ? profile.emailAddress.trim().toLowerCase() : '';
  if (!account || account !== status.channels.email.expectedAccount) {
    throw new Error('GMAIL_ACCOUNT_FINGERPRINT_MISMATCH');
  }

  const sender = status.channels.email.fromAddress;
  const params = new URLSearchParams({ format: 'metadata' });
  for (const name of ['From', 'Reply-To', 'Subject', 'Message-ID']) params.append('metadataHeaders', name);
  const original = await gmailJson(
    fetchImpl,
    token,
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?${params.toString()}`,
  ) as GmailMessage;

  const originalId = typeof original.id === 'string' ? original.id : '';
  const threadId = typeof original.threadId === 'string' ? original.threadId : '';
  if (originalId !== messageId || !threadId) throw new Error('GMAIL_REPLY_TARGET_UNVERIFIED');

  const headers = original.payload?.headers;
  const recipient = emailFromHeader(header(headers, 'Reply-To') ?? header(headers, 'From') ?? '');
  if (!recipient || recipient === account || recipient === sender) throw new Error('GMAIL_REPLY_RECIPIENT_INVALID');
  const providerMessageId = oneLine(header(headers, 'Message-ID') ?? '');
  const subject = replySubject(header(headers, 'Subject'));

  const rawHeaders = [
    `From: ${sender}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    ...(providerMessageId ? [`In-Reply-To: ${providerMessageId}`, `References: ${providerMessageId}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  const raw = `${rawHeaders.join('\r\n')}\r\n\r\n${body}\r\n`;

  const sent = await gmailJson(fetchImpl, token, `${GMAIL_API}/messages/send`, {
    method: 'POST',
    body: JSON.stringify({ raw: base64Url(raw), threadId }),
  });
  const sentId = typeof sent.id === 'string' ? sent.id : '';
  const sentThreadId = typeof sent.threadId === 'string' ? sent.threadId : '';
  if (!sentId || sentThreadId !== threadId) throw new Error('GMAIL_SEND_RECEIPT_INVALID');

  const receiptParams = new URLSearchParams({ format: 'metadata' });
  receiptParams.append('metadataHeaders', 'From');
  const receipt = await gmailJson(
    fetchImpl,
    token,
    `${GMAIL_API}/messages/${encodeURIComponent(sentId)}?${receiptParams.toString()}`,
  ) as GmailMessage;
  const receiptId = typeof receipt.id === 'string' ? receipt.id : '';
  const receiptThreadId = typeof receipt.threadId === 'string' ? receipt.threadId : '';
  const receiptSender = emailFromHeader(header(receipt.payload?.headers, 'From') ?? '');
  if (receiptId !== sentId || receiptThreadId !== threadId || receiptSender !== sender) {
    throw new Error('GMAIL_SENDER_FINGERPRINT_MISMATCH');
  }

  return {
    channel: 'email',
    providerMessageId: sentId,
    threadId,
    recipient,
    account,
    sender,
  };
}

export async function sendWhatsAppReply(
  input: WhatsAppReplyInput,
  fetchImpl: FetchLike = fetch,
): Promise<WhatsAppReplyResult> {
  const recipientWaId = input.recipientWaId.trim();
  const replyToMessageId = input.replyToMessageId.trim();
  const body = input.body.trim();
  if (!SAFE_WA_ID.test(recipientWaId)) throw new Error('WHATSAPP_RECIPIENT_INVALID');
  if (!SAFE_WA_MESSAGE_ID.test(replyToMessageId)) throw new Error('WHATSAPP_REPLY_TARGET_INVALID');
  if (!body || body.length > MAX_WHATSAPP_TEXT_LENGTH) throw new Error('REPLY_BODY_INVALID');

  const status = growthInboxReplyStatus();
  const channel = status.channels.whatsapp;
  if (!channel.configured || !channel.phoneNumberId || !channel.wabaId || !channel.graphVersion) {
    throw new Error('WHATSAPP_NOT_CONFIGURED');
  }
  const token = env('FCR_WHATSAPP_ACCESS_TOKEN');
  if (!token) throw new Error('WHATSAPP_NOT_CONFIGURED');

  const response = await fetchImpl(
    `https://graph.facebook.com/${channel.graphVersion}/${encodeURIComponent(channel.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientWaId,
        context: { message_id: replyToMessageId },
        type: 'text',
        text: { preview_url: false, body },
      }),
    },
  );
  const payload = await responseJson(response);
  if (!response.ok) throw new Error(`WHATSAPP_PROVIDER_${response.status}`);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const first = messages[0] && typeof messages[0] === 'object' && !Array.isArray(messages[0])
    ? messages[0] as Record<string, unknown>
    : null;
  const providerMessageId = typeof first?.id === 'string' ? first.id : '';
  if (!providerMessageId) throw new Error('WHATSAPP_SEND_RECEIPT_INVALID');

  return {
    channel: 'whatsapp',
    providerMessageId,
    recipientWaId,
    phoneNumberId: channel.phoneNumberId,
  };
}