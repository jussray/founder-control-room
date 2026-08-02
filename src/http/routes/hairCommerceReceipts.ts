import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  HairCommerceReceiptError,
  type HairCommerceReceipt,
  validateHairCommerceReceipt,
} from '../../hairCommerce/receipt.js';

export type HairCommerceReceiptDisposition = 'stored' | 'duplicate' | 'conflict';

export type HairCommerceReceiptStore = (
  receipt: HairCommerceReceipt,
) => Promise<HairCommerceReceiptDisposition>;

type StoredHairCommerceReceipt = {
  receipt_id: string;
  source_repo: string;
  order_ref_hash: string;
  event_type: string;
  group_count: number;
  unresolved_count: number;
  occurred_at: string;
  exact_commit_sha: string;
  evidence_url: string | null;
};

function safeToken(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const left = safeToken(provided);
  const right = safeToken(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isIdenticalReplay(
  stored: StoredHairCommerceReceipt,
  receipt: HairCommerceReceipt,
): boolean {
  return (
    stored.receipt_id === receipt.receiptId &&
    stored.source_repo === receipt.sourceRepo &&
    stored.order_ref_hash === receipt.orderRefHash &&
    stored.event_type === receipt.event &&
    Number(stored.group_count) === receipt.groupCount &&
    Number(stored.unresolved_count) === receipt.unresolvedCount &&
    new Date(stored.occurred_at).toISOString() === receipt.occurredAt &&
    stored.exact_commit_sha === receipt.exactCommitSha &&
    (stored.evidence_url ?? undefined) === receipt.evidenceUrl
  );
}

export const persistHairCommerceReceipt: HairCommerceReceiptStore = async (receipt) => {
  // Keep the service-role dependency behind the real persistence path. This
  // lets injected-store tests execute without production Supabase bindings and
  // still fails closed when the live route actually needs persistence.
  const { supabaseAdmin } = await import('../../lib/supabase.js');
  const client = supabaseAdmin();
  const { data, error } = await client
    .from('hair_commerce_receipts')
    .upsert(
      {
        receipt_id: receipt.receiptId,
        source_repo: receipt.sourceRepo,
        order_ref_hash: receipt.orderRefHash,
        event_type: receipt.event,
        group_count: receipt.groupCount,
        unresolved_count: receipt.unresolvedCount,
        occurred_at: receipt.occurredAt,
        exact_commit_sha: receipt.exactCommitSha,
        evidence_url: receipt.evidenceUrl ?? null,
      },
      { onConflict: 'receipt_id', ignoreDuplicates: true },
    )
    .select('receipt_id');

  if (error) throw new Error('hair_commerce_receipt_store_failed');
  if (data && data.length > 0) return 'stored';

  const { data: existing, error: existingError } = await client
    .from('hair_commerce_receipts')
    .select(
      'receipt_id,source_repo,order_ref_hash,event_type,group_count,unresolved_count,occurred_at,exact_commit_sha,evidence_url',
    )
    .eq('receipt_id', receipt.receiptId)
    .maybeSingle();

  if (existingError || !existing) {
    throw new Error('hair_commerce_receipt_reconciliation_failed');
  }

  return isIdenticalReplay(existing as StoredHairCommerceReceipt, receipt)
    ? 'duplicate'
    : 'conflict';
};

export function createHairCommerceReceiptIngestHandler(
  store: HairCommerceReceiptStore = persistHairCommerceReceipt,
): RequestHandler {
  return async function handleHairCommerceReceiptIngest(
    req: Request,
    res: Response,
  ) {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });

    const expectedToken = process.env.JBH_RECEIPT_INGEST_TOKEN?.trim();
    if (!expectedToken) {
      return res.status(503).json({ error: 'Receipt ingest is not configured' });
    }

    const provided = req.get('x-jbh-receipt-token');
    if (!tokenMatches(provided, expectedToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let receipt: HairCommerceReceipt;
    try {
      receipt = validateHairCommerceReceipt(req.body);
    } catch (error) {
      const code =
        error instanceof HairCommerceReceiptError ? error.code : 'invalid_receipt';
      return res.status(400).json({ error: code });
    }

    try {
      const disposition = await store(receipt);
      if (disposition === 'conflict') {
        return res.status(409).json({
          accepted: false,
          duplicate: false,
          error: 'receipt_id_payload_conflict',
          receiptId: receipt.receiptId,
        });
      }

      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        receiptId: receipt.receiptId,
        event: receipt.event,
      });
    } catch {
      return res.status(503).json({ error: 'Receipt store unavailable' });
    }
  };
}

export const handleHairCommerceReceiptIngest =
  createHairCommerceReceiptIngestHandler();
