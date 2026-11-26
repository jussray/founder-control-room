/**
 * QuickScan Stripe Payment Link webhook.
 *
 * Verifies the raw request, loads and persists prospect state through the
 * FCR-owned durable store, and records processed Stripe event ids so replay
 * protection survives a worker/process restart.
 */

import type { Request, Response } from 'express';
import { markPaidFromVerifiedStripeEvent } from '../../quickscan/engine.js';
import {
  getQuickScanProspectDurable,
  isStripeEventProcessedDurable,
  markStripeEventProcessedDurable,
  saveQuickScanProspectDurable,
} from '../../quickscan/store.js';
import { parseStripeCheckoutCompletedEvent, verifyStripeWebhookSignature } from '../../quickscan/stripeWebhook.js';

export async function handleStripeQuickScanWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET?.trim();
  if (!secret) {
    res.status(503).json({ ok: false, code: 'STRIPE_QUICKSCAN_WEBHOOK_NOT_CONFIGURED' });
    return;
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ ok: false, code: 'INVALID_BODY' });
    return;
  }

  const signatureHeader = req.header('stripe-signature');
  if (!verifyStripeWebhookSignature(rawBody, signatureHeader, secret)) {
    res.status(400).json({ ok: false, code: 'INVALID_SIGNATURE' });
    return;
  }

  const event = parseStripeCheckoutCompletedEvent(rawBody);
  if (!event) {
    res.status(200).json({ ok: true, applied: false, code: 'IGNORED_EVENT_TYPE' });
    return;
  }

  try {
    if (await isStripeEventProcessedDurable(event.eventId)) {
      res.status(200).json({ ok: true, applied: false, code: 'DUPLICATE_EVENT' });
      return;
    }

    if (!event.clientReferenceId) {
      res.status(200).json({ ok: true, applied: false, code: 'MISSING_CLIENT_REFERENCE_ID' });
      return;
    }

    const prospect = await getQuickScanProspectDurable(event.clientReferenceId);
    if (!prospect) {
      res.status(200).json({ ok: true, applied: false, code: 'PROSPECT_NOT_FOUND' });
      return;
    }

    const expectedPaymentLinkId = process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID?.trim() || undefined;
    try {
      markPaidFromVerifiedStripeEvent(prospect, event, 'stripe-webhook', { expectedPaymentLinkId });
    } catch (error) {
      res.status(200).json({
        ok: true,
        applied: false,
        code: 'TRANSITION_REFUSED',
        detail: error instanceof Error ? error.message : 'blocked',
      });
      return;
    }

    // Persist the payment transition before acknowledging the event as
    // processed. A failed write returns 500 so Stripe can retry delivery.
    await saveQuickScanProspectDurable(prospect);
    await markStripeEventProcessedDurable(event.eventId);

    res.status(200).json({
      ok: true,
      applied: true,
      prospectId: prospect.id,
      lifecycleState: prospect.lifecycleState,
    });
  } catch {
    res.status(500).json({ ok: false, code: 'QUICKSCAN_WEBHOOK_PERSISTENCE_FAILED' });
  }
}
