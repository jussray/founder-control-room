import type { Request, RequestHandler, Response } from 'express';

import {
  FcrWhopMoneyPathError,
  buildFcrWhopPaidReceipt,
  verifyWhopWebhookSignature,
  type FcrWhopPaidReceipt,
} from '../../fcrCommerce/whopMoneyPath.js';

export type FcrWhopReceiptStoreDisposition = 'stored' | 'duplicate' | 'conflict';
export type FcrWhopReceiptStore = (
  receipt: FcrWhopPaidReceipt,
) => Promise<FcrWhopReceiptStoreDisposition>;

const RECEIPT_COLUMNS = [
  'provider',
  'delivery_id',
  'event_id',
  'contract_id',
  'account_fingerprint',
  'resource_ref_hash',
  'event_type',
  'revenue_state',
  'collected_value_cents',
  'currency',
  'occurred_at',
  'api_version',
  'api_version_date',
].join(',');

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function storedFcrWhopSemanticReceiptMatches(
  stored: unknown,
  receipt: FcrWhopPaidReceipt,
): boolean {
  if (!isRecord(stored)) return false;
  return (
    stored.event_id === receipt.eventId
    && stored.contract_id === receipt.contract
    && stored.provider === receipt.provider
    && stored.account_fingerprint === receipt.accountFingerprint
    && stored.resource_ref_hash === receipt.paymentRefHash
    && stored.event_type === receipt.event
    && stored.revenue_state === receipt.revenueState
    && stored.collected_value_cents === receipt.collectedValueCents
    && stored.currency === receipt.currency
    && stored.api_version === receipt.apiVersion
    && stored.api_version_date === receipt.apiVersionDate
  );
}

export function storedFcrWhopDeliveryReceiptMatches(
  stored: unknown,
  receipt: FcrWhopPaidReceipt,
): boolean {
  return isRecord(stored)
    && stored.delivery_id === receipt.webhookId
    && stored.occurred_at === receipt.occurredAt
    && storedFcrWhopSemanticReceiptMatches(stored, receipt);
}

export const persistFcrWhopReceipt: FcrWhopReceiptStore = async (receipt) => {
  const { supabase: admin } = await import('../../lib/supabaseClient.js');

  const readByDelivery = async (): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('fcr_external_commerce_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('provider', receipt.provider)
      .eq('delivery_id', receipt.webhookId)
      .maybeSingle();
    if (error) throw new Error('fcr_whop_receipt_lookup_failed');
    return isRecord(data) ? data : null;
  };

  const readByEvent = async (): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('fcr_external_commerce_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('provider', receipt.provider)
      .eq('account_fingerprint', receipt.accountFingerprint)
      .eq('event_id', receipt.eventId)
      .maybeSingle();
    if (error) throw new Error('fcr_whop_receipt_lookup_failed');
    return isRecord(data) ? data : null;
  };

  const readByResource = async (): Promise<Record<string, unknown> | null> => {
    const { data, error } = await admin
      .from('fcr_external_commerce_receipts')
      .select(RECEIPT_COLUMNS)
      .eq('provider', receipt.provider)
      .eq('account_fingerprint', receipt.accountFingerprint)
      .eq('resource_ref_hash', receipt.paymentRefHash)
      .eq('event_type', receipt.event)
      .maybeSingle();
    if (error) throw new Error('fcr_whop_receipt_lookup_failed');
    return isRecord(data) ? data : null;
  };

  const classify = async (): Promise<FcrWhopReceiptStoreDisposition | null> => {
    const byDelivery = await readByDelivery();
    if (byDelivery) {
      return storedFcrWhopDeliveryReceiptMatches(byDelivery, receipt)
        ? 'duplicate'
        : 'conflict';
    }

    const byEvent = await readByEvent();
    if (byEvent) {
      return storedFcrWhopSemanticReceiptMatches(byEvent, receipt)
        ? 'duplicate'
        : 'conflict';
    }

    const byResource = await readByResource();
    if (byResource) {
      return storedFcrWhopSemanticReceiptMatches(byResource, receipt)
        ? 'duplicate'
        : 'conflict';
    }

    return null;
  };

  const existing = await classify();
  if (existing) return existing;

  const { error: insertError } = await admin.from('fcr_external_commerce_receipts').insert({
    provider: receipt.provider,
    delivery_id: receipt.webhookId,
    event_id: receipt.eventId,
    contract_id: receipt.contract,
    account_fingerprint: receipt.accountFingerprint,
    resource_ref_hash: receipt.paymentRefHash,
    event_type: receipt.event,
    revenue_state: receipt.revenueState,
    collected_value_cents: receipt.collectedValueCents,
    currency: receipt.currency,
    occurred_at: receipt.occurredAt,
    api_version: receipt.apiVersion,
    api_version_date: receipt.apiVersionDate,
  });

  if (!insertError) return 'stored';
  if ((insertError as { code?: string }).code !== '23505') {
    throw new Error('fcr_whop_receipt_store_failed');
  }

  const raced = await classify();
  if (raced) return raced;
  throw new Error('fcr_whop_receipt_store_failed');
};

export function createWhopFcrCommerceWebhookHandler(
  store: FcrWhopReceiptStore = persistFcrWhopReceipt,
): RequestHandler {
  return async function handleWhopFcrCommerceWebhook(req: Request, res: Response) {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });

    const secret = process.env.FCR_WHOP_WEBHOOK_SECRET?.trim();
    const hashSalt = process.env.FCR_COMMERCE_HASH_SALT?.trim();
    if (!secret || !hashSalt || hashSalt.length < 16) {
      return res.status(503).json({ error: 'FCR Whop commerce ingest is not configured' });
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) return res.status(400).json({ error: 'invalid_body' });

    const webhookId = req.get('webhook-id')?.trim() ?? '';
    const webhookTimestamp = req.get('webhook-timestamp')?.trim() ?? '';
    const webhookSignature = req.get('webhook-signature')?.trim() ?? '';

    if (!verifyWhopWebhookSignature({
      rawBody,
      headers: { webhookId, webhookTimestamp, webhookSignature },
      secret,
    })) {
      return res.status(401).json({ error: 'invalid_signature' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid_json' });
    }

    let receipt: FcrWhopPaidReceipt;
    try {
      receipt = buildFcrWhopPaidReceipt({ rawPayload: payload, webhookId, hashSalt });
    } catch (error) {
      const code = error instanceof FcrWhopMoneyPathError
        ? error.code
        : 'invalid_whop_payment';
      return res.status(400).json({ error: code });
    }

    try {
      const disposition = await store(receipt);
      if (disposition === 'conflict') {
        return res.status(409).json({
          accepted: false,
          error: 'commerce_receipt_conflict',
          webhookId: receipt.webhookId,
        });
      }

      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        webhookId: receipt.webhookId,
        event: receipt.event,
        revenueState: receipt.revenueState,
        collectedValueCents: receipt.collectedValueCents,
        currency: receipt.currency,
      });
    } catch {
      return res.status(503).json({ error: 'receipt_store_unavailable' });
    }
  };
}

export const handleWhopFcrCommerceWebhook = createWhopFcrCommerceWebhookHandler();
