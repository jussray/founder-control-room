const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const CHANNEL = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const MAX_COMMAND_LENGTH = 1000;
const ALLOWED_FIELDS = new Set([
  'version',
  'ingressId',
  'replyContextId',
  'messageRefHash',
  'rawMessageHash',
  'senderRefHash',
  'recipientRefHash',
  'commandHash',
  'commandType',
  'targetChannel',
  'commandText',
  'senderVerified',
  'providerActionsRequested',
  'receivedAt',
  'source',
]);

export type FounderSignalReviewCommandType =
  | 'cancel_all'
  | 'cancel_one'
  | 'edit_one';

export interface FounderSignalReviewEmailReceipt {
  version: 1;
  ingressId: string;
  replyContextId: string;
  messageRefHash: string;
  rawMessageHash: string;
  senderRefHash: string;
  recipientRefHash: string;
  commandHash: string;
  commandType: FounderSignalReviewCommandType;
  targetChannel: string | null;
  commandText: string;
  senderVerified: true;
  providerActionsRequested: 0;
  receivedAt: string;
  source: 'cloudflare_email_routing';
}

export class FounderSignalReviewEmailReceiptError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'FounderSignalReviewEmailReceiptError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactString(
  value: unknown,
  code: string,
  options: { maxLength?: number; pattern?: RegExp } = {},
): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0) {
    throw new FounderSignalReviewEmailReceiptError(code);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new FounderSignalReviewEmailReceiptError(code);
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw new FounderSignalReviewEmailReceiptError(code);
  }
  return value;
}

function exactIsoTimestamp(value: unknown): string {
  const text = exactString(value, 'invalid_received_at', { maxLength: 64 });
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== text) {
    throw new FounderSignalReviewEmailReceiptError('invalid_received_at');
  }
  return text;
}

export function validateFounderSignalReviewEmailReceipt(
  value: unknown,
): FounderSignalReviewEmailReceipt {
  if (!isRecord(value)) {
    throw new FounderSignalReviewEmailReceiptError('invalid_receipt');
  }

  for (const key of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new FounderSignalReviewEmailReceiptError('unknown_or_private_field');
    }
  }

  if (value.version !== 1) {
    throw new FounderSignalReviewEmailReceiptError('invalid_version');
  }

  const commandType = exactString(value.commandType, 'invalid_command_type', {
    maxLength: 32,
  });
  if (!['cancel_all', 'cancel_one', 'edit_one'].includes(commandType)) {
    throw new FounderSignalReviewEmailReceiptError('invalid_command_type');
  }

  const targetChannel = value.targetChannel === null
    ? null
    : exactString(value.targetChannel, 'invalid_target_channel', {
      maxLength: 100,
      pattern: CHANNEL,
    });

  if (commandType === 'cancel_all' && targetChannel !== null) {
    throw new FounderSignalReviewEmailReceiptError('unexpected_target_channel');
  }
  if (commandType !== 'cancel_all' && targetChannel === null) {
    throw new FounderSignalReviewEmailReceiptError('missing_target_channel');
  }

  const commandText = exactString(value.commandText, 'invalid_command_text', {
    maxLength: MAX_COMMAND_LENGTH,
  });

  if (value.senderVerified !== true) {
    throw new FounderSignalReviewEmailReceiptError('sender_not_verified');
  }
  if (value.providerActionsRequested !== 0) {
    throw new FounderSignalReviewEmailReceiptError('provider_action_not_allowed');
  }
  if (value.source !== 'cloudflare_email_routing') {
    throw new FounderSignalReviewEmailReceiptError('invalid_source');
  }

  return {
    version: 1,
    ingressId: exactString(value.ingressId, 'invalid_ingress_id', { pattern: UUID }),
    replyContextId: exactString(value.replyContextId, 'invalid_reply_context_id', {
      pattern: UUID,
    }),
    messageRefHash: exactString(value.messageRefHash, 'invalid_message_ref_hash', {
      pattern: SHA256,
    }),
    rawMessageHash: exactString(value.rawMessageHash, 'invalid_raw_message_hash', {
      pattern: SHA256,
    }),
    senderRefHash: exactString(value.senderRefHash, 'invalid_sender_ref_hash', {
      pattern: SHA256,
    }),
    recipientRefHash: exactString(value.recipientRefHash, 'invalid_recipient_ref_hash', {
      pattern: SHA256,
    }),
    commandHash: exactString(value.commandHash, 'invalid_command_hash', {
      pattern: SHA256,
    }),
    commandType: commandType as FounderSignalReviewCommandType,
    targetChannel,
    commandText,
    senderVerified: true,
    providerActionsRequested: 0,
    receivedAt: exactIsoTimestamp(value.receivedAt),
    source: 'cloudflare_email_routing',
  };
}
