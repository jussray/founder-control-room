import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  type FounderSignalReviewCommandType,
  type FounderSignalReviewEmailReceipt,
  validateFounderSignalReviewEmailReceipt,
} from './receipt.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const MAX_RAW_BYTES = 128 * 1024;
const MAX_TEXT_BYTES = 12 * 1024;
const MAX_MIME_DEPTH = 3;
const MAX_MIME_PARTS = 12;
const MAX_COMMAND_LENGTH = 1000;
const QUOTE_OR_SIGNATURE_BOUNDARIES = [
  /^>/,
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^on\s.+wrote:\s*$/i,
  /^(from|sent|to|subject):\s/i,
  /^--\s*$/,
  /^sent from my (iphone|ipad|android)/i,
  /^get outlook for/i,
];

export interface ReviewEmailEnvelope {
  from: string;
  to: string;
  raw: Uint8Array;
}

export interface ReviewEmailParseOptions {
  founderEmail: string;
  reviewDomain: string;
  recipientPrefix?: string;
  now?: Date;
}

export class FounderSignalReviewEmailError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'FounderSignalReviewEmailError';
  }
}

interface MimePart {
  headers: Map<string, string>;
  body: string;
}

interface ParsedCommand {
  commandType: FounderSignalReviewCommandType;
  targetChannel: string | null;
  commandText: string;
}

function normalizeAddress(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const bracketed = trimmed.match(/<([^>]+)>/);
  const address = (bracketed ? bracketed[1] : trimmed).trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) ? address : null;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function uuidFromHash(hash: string): string {
  const bytes = Buffer.from(hash.slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function parseHeaders(raw: string): Map<string, string> {
  const headers = new Map<string, string>();
  let currentName = '';
  let currentValue = '';

  const commit = () => {
    if (currentName) headers.set(currentName, currentValue.trim());
    currentName = '';
    currentValue = '';
  };

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[ \t]/.test(line) && currentName) {
      currentValue += ` ${line.trim()}`;
      continue;
    }
    commit();
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    currentName = line.slice(0, separator).trim().toLowerCase();
    currentValue = line.slice(separator + 1).trim();
  }
  commit();
  return headers;
}

function splitPart(raw: string): MimePart {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const separator = normalized.indexOf('\n\n');
  if (separator < 0) {
    throw new FounderSignalReviewEmailError('malformed_mime_part');
  }
  return {
    headers: parseHeaders(normalized.slice(0, separator)),
    body: normalized.slice(separator + 2),
  };
}

function parseContentType(value: string | undefined): {
  mediaType: string;
  boundary: string | null;
  charset: string;
} {
  const segments = (value ?? 'text/plain; charset=utf-8')
    .split(';')
    .map(segment => segment.trim());
  const mediaType = (segments.shift() || 'text/plain').toLowerCase();
  let boundary: string | null = null;
  let charset = 'utf-8';

  for (const segment of segments) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim().toLowerCase();
    const parameter = segment.slice(separator + 1).trim().replace(/^"|"$/g, '');
    if (name === 'boundary') boundary = parameter;
    if (name === 'charset') charset = parameter.toLowerCase();
  }

  return { mediaType, boundary, charset };
}

function decodeQuotedPrintable(value: string): Uint8Array {
  const normalized = value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === '=' && /^[0-9a-f]{2}$/i.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(normalized.charCodeAt(index) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function decodeBody(body: string, encoding: string | undefined, charset: string): string {
  let bytes: Uint8Array;
  const normalizedEncoding = (encoding ?? '8bit').trim().toLowerCase();

  if (normalizedEncoding === 'base64') {
    const compact = body.replace(/\s+/g, '');
    if (!/^[a-z0-9+/]*={0,2}$/i.test(compact)) {
      throw new FounderSignalReviewEmailError('invalid_base64_body');
    }
    bytes = Buffer.from(compact, 'base64');
  } else if (normalizedEncoding === 'quoted-printable') {
    bytes = decodeQuotedPrintable(body);
  } else if (['7bit', '8bit', 'binary', ''].includes(normalizedEncoding)) {
    bytes = Buffer.from(body, 'utf8');
  } else {
    throw new FounderSignalReviewEmailError('unsupported_transfer_encoding');
  }

  if (bytes.byteLength > MAX_TEXT_BYTES) {
    throw new FounderSignalReviewEmailError('text_body_too_large');
  }

  if (!['utf-8', 'utf8', 'us-ascii', 'ascii', 'iso-8859-1', 'latin1'].includes(charset)) {
    throw new FounderSignalReviewEmailError('unsupported_charset');
  }

  if (['iso-8859-1', 'latin1'].includes(charset)) {
    return Buffer.from(bytes).toString('latin1');
  }
  return Buffer.from(bytes).toString('utf8');
}

function splitMultipart(body: string, boundary: string): string[] {
  if (!boundary || boundary.length > 200 || /[\r\n]/.test(boundary)) {
    throw new FounderSignalReviewEmailError('invalid_mime_boundary');
  }
  const delimiter = `--${boundary}`;
  const parts = body
    .split(delimiter)
    .slice(1)
    .map(part => part.replace(/^\r?\n/, '').replace(/\r?\n$/, ''))
    .filter(part => part && !part.startsWith('--'));
  if (parts.length === 0 || parts.length > MAX_MIME_PARTS) {
    throw new FounderSignalReviewEmailError('invalid_mime_part_count');
  }
  return parts;
}

function extractTextPlain(part: MimePart, depth = 0): string | null {
  if (depth > MAX_MIME_DEPTH) {
    throw new FounderSignalReviewEmailError('mime_depth_exceeded');
  }

  const disposition = (part.headers.get('content-disposition') ?? '').toLowerCase();
  const contentTypeHeader = part.headers.get('content-type') ?? '';
  if (
    disposition.startsWith('attachment') ||
    disposition.includes('filename=') ||
    /(?:^|;)\s*name\s*=/i.test(contentTypeHeader)
  ) {
    return null;
  }

  const contentType = parseContentType(contentTypeHeader);
  if (contentType.mediaType.startsWith('multipart/')) {
    if (!contentType.boundary) {
      throw new FounderSignalReviewEmailError('missing_mime_boundary');
    }
    for (const rawChild of splitMultipart(part.body, contentType.boundary)) {
      const text = extractTextPlain(splitPart(rawChild), depth + 1);
      if (text !== null) return text;
    }
    return null;
  }

  if (contentType.mediaType !== 'text/plain') return null;
  return decodeBody(
    part.body,
    part.headers.get('content-transfer-encoding'),
    contentType.charset,
  );
}

function isQuoteBoundary(line: string): boolean {
  return QUOTE_OR_SIGNATURE_BOUNDARIES.some(pattern => pattern.test(line));
}

export function extractFounderReviewCommand(body: string): ParsedCommand {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let command: string | null = null;
  let quotedRegion = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (quotedRegion) continue;
    if (isQuoteBoundary(trimmed)) {
      quotedRegion = true;
      continue;
    }
    if (command === null) {
      command = trimmed;
      continue;
    }
    throw new FounderSignalReviewEmailError('multiple_unquoted_commands');
  }

  if (!command) throw new FounderSignalReviewEmailError('missing_unquoted_command');
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new FounderSignalReviewEmailError('command_too_long');
  }

  if (/^cancel(?:\s+all)?$/i.test(command)) {
    return { commandType: 'cancel_all', targetChannel: null, commandText: 'cancel all' };
  }

  const separator = command.indexOf(':');
  if (separator <= 0) {
    throw new FounderSignalReviewEmailError('channel_required');
  }
  const channel = command.slice(0, separator).trim().toLowerCase();
  const instruction = command.slice(separator + 1).trim();
  if (!CHANNEL.test(channel)) {
    throw new FounderSignalReviewEmailError('invalid_channel');
  }
  if (!instruction) {
    throw new FounderSignalReviewEmailError('missing_instruction');
  }

  if (/^cancel$/i.test(instruction)) {
    return {
      commandType: 'cancel_one',
      targetChannel: channel,
      commandText: `${channel}: cancel`,
    };
  }

  return {
    commandType: 'edit_one',
    targetChannel: channel,
    commandText: `${channel}: ${instruction}`,
  };
}

function parseReplyContext(recipient: string, domain: string, prefix: string): string {
  const normalizedRecipient = normalizeAddress(recipient);
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedRecipient || !normalizedDomain) {
    throw new FounderSignalReviewEmailError('invalid_recipient');
  }
  const [localPart, recipientDomain] = normalizedRecipient.split('@');
  if (recipientDomain !== normalizedDomain) {
    throw new FounderSignalReviewEmailError('unexpected_recipient_domain');
  }
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = localPart.match(new RegExp(`^${escapedPrefix}\\+(.+)$`, 'i'));
  const contextId = match?.[1]?.toLowerCase() ?? '';
  if (!UUID.test(contextId)) {
    throw new FounderSignalReviewEmailError('invalid_reply_context');
  }
  return contextId;
}

export function parseFounderSignalReviewEmail(
  envelope: ReviewEmailEnvelope,
  options: ReviewEmailParseOptions,
): FounderSignalReviewEmailReceipt {
  if (envelope.raw.byteLength === 0 || envelope.raw.byteLength > MAX_RAW_BYTES) {
    throw new FounderSignalReviewEmailError('raw_email_size_rejected');
  }

  const expectedSender = normalizeAddress(options.founderEmail);
  const sender = normalizeAddress(envelope.from);
  if (!expectedSender || !sender || sender !== expectedSender) {
    throw new FounderSignalReviewEmailError('founder_sender_mismatch');
  }

  const recipient = normalizeAddress(envelope.to);
  if (!recipient) throw new FounderSignalReviewEmailError('invalid_recipient');
  const replyContextId = parseReplyContext(
    recipient,
    options.reviewDomain,
    options.recipientPrefix ?? 'review',
  );

  const rawText = Buffer.from(envelope.raw).toString('utf8');
  const root = splitPart(rawText);
  const textBody = extractTextPlain(root);
  if (textBody === null) {
    throw new FounderSignalReviewEmailError('text_plain_body_required');
  }
  const command = extractFounderReviewCommand(textBody);

  const rawMessageHash = sha256(envelope.raw);
  const messageId = root.headers.get('message-id')?.trim().toLowerCase() ?? 'no-message-id';
  const messageRefHash = sha256(`${messageId}|${rawMessageHash}`);
  const commandHash = sha256(command.commandText);
  const ingressId = uuidFromHash(messageRefHash);
  const receivedAt = (options.now ?? new Date()).toISOString();

  return validateFounderSignalReviewEmailReceipt({
    version: 1,
    ingressId,
    replyContextId,
    messageRefHash,
    rawMessageHash,
    senderRefHash: sha256(sender),
    recipientRefHash: sha256(recipient),
    commandHash,
    commandType: command.commandType,
    targetChannel: command.targetChannel,
    commandText: command.commandText,
    senderAddressMatched: true,
    authorizationState: 'intake_only_unresolved',
    executionAllowed: false,
    providerActionsRequested: 0,
    receivedAt,
    source: 'cloudflare_email_routing',
  });
}
