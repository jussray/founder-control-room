import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  FounderSignalReviewEmailReceiptError,
  type FounderSignalReviewEmailReceipt,
  validateFounderSignalReviewEmailReceipt,
} from '../../founderSignalEmailIngress/receipt.js';

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MIN_INGRESS_SECRET_LENGTH = 32;
const HEX_SHA256 = /^[0-9a-f]{64}$/;

export type FounderSignalReviewEmailReceiptStore = (
  receipt: FounderSignalReviewEmailReceipt,
) => Promise<'stored' | 'duplicate'>;

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function safeEqualHex(left: string, right: string): boolean {
  if (!HEX_SHA256.test(left) || !HEX_SHA256.test(right)) return false;
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function verifySignedBody(
  rawBody: Uint8Array,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
  nowMs: number,
): boolean {
  if (!timestampHeader || !/^\d{13}$/.test(timestampHeader)) return false;
  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowMs - timestamp) > MAX_CLOCK_SKEW_MS) {
    return false;
  }
  const expected = createHmac('sha256', secret)
    .update(timestampHeader, 'utf8')
    .update('.', 'utf8')
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(signatureHeader ?? '', expected);
}

export const persistFounderSignalReviewEmailReceipt:
FounderSignalReviewEmailReceiptStore = async (receipt) => {
  const { supabaseAdmin } = await import('../../lib/supabase.js');
  const { error } = await supabaseAdmin()
    .from('founder_signal_review_email_receipts')
    .insert({
      ingress_id: receipt.ingressId,
      reply_context_id: receipt.replyContextId,
      message_ref_hash: receipt.messageRefHash,
      raw_message_hash: receipt.rawMessageHash,
      sender_ref_hash: receipt.senderRefHash,
      recipient_ref_hash: receipt.recipientRefHash,
      command_hash: receipt.commandHash,
      command_type: receipt.commandType,
      target_channel: receipt.targetChannel,
      command_text: receipt.commandText,
      sender_verified: receipt.senderAddressMatched,
      sender_address_matched: receipt.senderAddressMatched,
      authorization_state: receipt.authorizationState,
      execution_allowed: receipt.executionAllowed,
      provider_actions_requested: receipt.providerActionsRequested,
      received_at: receipt.receivedAt,
      source: receipt.source,
    });

  if (error?.code === '23505') return 'duplicate';
  if (error) throw new Error('founder_review_email_receipt_store_failed');
  return 'stored';
};

export function createFounderSignalReviewEmailIngestHandler(
  store: FounderSignalReviewEmailReceiptStore = persistFounderSignalReviewEmailReceipt,
  options: { now?: () => number } = {},
): RequestHandler {
  return async function handleFounderSignalReviewEmailIngest(
    req: Request,
    res: Response,
  ) {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });

    const secret = process.env.FOUNDER_REVIEW_EMAIL_INGRESS_SECRET?.trim();
    if (!secret || secret.length < MIN_INGRESS_SECRET_LENGTH) {
      return res.status(503).json({ error: 'Review email ingest is not configured' });
    }

    if (!(req.body instanceof Uint8Array)) {
      return res.status(400).json({ error: 'raw_json_body_required' });
    }

    const signatureValid = verifySignedBody(
      req.body,
      req.get('x-founder-review-timestamp'),
      req.get('x-founder-review-signature'),
      secret,
      options.now?.() ?? Date.now(),
    );
    if (!signatureValid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(req.body));
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }

    let receipt: FounderSignalReviewEmailReceipt;
    try {
      receipt = validateFounderSignalReviewEmailReceipt(parsed);
    } catch (error) {
      const code = error instanceof FounderSignalReviewEmailReceiptError
        ? error.code
        : 'invalid_receipt';
      return res.status(400).json({ error: code });
    }

    try {
      const disposition = await store(receipt);
      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        ingressId: receipt.ingressId,
        replyContextId: receipt.replyContextId,
        commandType: receipt.commandType,
        authorizationState: receipt.authorizationState,
        executionAllowed: false,
        providerActionsRequested: 0,
      });
    } catch {
      return res.status(503).json({ error: 'Review email receipt store unavailable' });
    }
  };
}

export const handleFounderSignalReviewEmailIngest =
  createFounderSignalReviewEmailIngestHandler();
