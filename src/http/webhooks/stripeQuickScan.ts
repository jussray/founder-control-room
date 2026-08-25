/**
 * QuickScan Stripe Payment Link webhook.
 *
 * Verifies the raw request against `STRIPE_QUICKSCAN_WEBHOOK_SECRET`, then
 * hands a `checkout.session.completed` event to the QuickScan engine as the
 * sole route that may mark a prospect paid without a founder-typed evidence
 * string. When `STRIPE_QUICKSCAN_PAYMENT_LINK_ID` is configured, the engine
 * also requires the session's own `payment_link` to match it, so a
 * same-price checkout completed on an unrelated Stripe product cannot
 * satisfy this prospect's payment truth. Every other outcome — wrong
 * event type, unconfigured secret,
 * unmatched prospect, a business-rule refusal from the engine, a replayed
 * event id — is acknowledged with 200 so Stripe does not retry a delivery
 * this endpoint has already durably handled or intentionally ignored; only
 * an unverifiable request (bad or missing signature) is rejected with 400.
 */

import type { Request, Response } from 'express';
import { markPaidFromVerifiedStripeEvent } from '../../quickscan/engine.js';
import {
  getQuickScanProspect,
  isStripeEventProcessed,
  markStripeEventProcessed,
  saveQuickScanProspect,
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

  if (isStripeEventProcessed(event.eventId)) {
    res.status(200).json({ ok: true, applied: false, code: 'DUPLICATE_EVENT' });
    return;
  }

  if (!event.clientReferenceId) {
    res.status(200).json({ ok: true, applied: false, code: 'MISSING_CLIENT_REFERENCE_ID' });
    return;
  }

  const prospect = getQuickScanProspect(event.clientReferenceId);
  if (!prospect) {
    res.status(200).json({ ok: true, applied: false, code: 'PROSPECT_NOT_FOUND' });
    return;
  }

  try {
    const expectedPaymentLinkId = process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID?.trim() || undefined;
    markPaidFromVerifiedStripeEvent(prospect, event, 'stripe-webhook', { expectedPaymentLinkId });
    saveQuickScanProspect(prospect);
    markStripeEventProcessed(event.eventId);
    res.status(200).json({
      ok: true,
      applied: true,
      prospectId: prospect.id,
      lifecycleState: prospect.lifecycleState,
    });
  } catch (error) {
    res.status(200).json({
      ok: true,
      applied: false,
      code: 'TRANSITION_REFUSED',
      detail: error instanceof Error ? error.message : 'blocked',
    });
  }
}
