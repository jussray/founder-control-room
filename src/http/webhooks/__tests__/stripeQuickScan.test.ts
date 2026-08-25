import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProspect, advanceProspect, addEvidence } from '../../../quickscan/engine.js';
import { resetQuickScanStoreForTests, saveQuickScanProspect } from '../../../quickscan/store.js';
import { handleStripeQuickScanWebhook } from '../stripeQuickScan.js';

const SECRET = 'whsec_test_secret';
const ORIGINAL_SECRET = process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET;
const ORIGINAL_PAYMENT_LINK_ID = process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID;

function makeResponse() {
  const response = { status: vi.fn(), json: vi.fn() } as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  response.status.mockReturnValue(response);
  return response;
}

function signedRequest(payload: unknown, timestampSeconds = Math.floor(Date.now() / 1000)): Request {
  const body = Buffer.from(JSON.stringify(payload));
  const signature = createHmac('sha256', SECRET).update(`${timestampSeconds}.${body.toString('utf8')}`).digest('hex');
  const header = `t=${timestampSeconds},v1=${signature}`;
  return {
    body,
    header: (name: string) => (name.toLowerCase() === 'stripe-signature' ? header : undefined),
  } as unknown as Request;
}

function checkoutCompletedPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        client_reference_id: 'prospect_1',
        payment_intent: 'pi_1',
        amount_total: 24900,
        currency: 'usd',
        payment_status: 'paid',
        ...overrides,
      },
    },
  };
}

function prospectAtPaymentLinkSent(id: string) {
  const prospect = createProspect({ businessName: 'Glow Studio', segment: 'salon_studio_team_owner' });
  prospect.id = id;
  for (const category of ['visible_friction', 'active_demand', 'owner_reachable', 'repeat_high_value_service', 'operational_complexity', 'urgency'] as const) {
    addEvidence(prospect, { category, note: `Observed ${category}` }, 'founder');
  }
  for (const state of ['researched', 'qualified_for_outreach', 'draft_ready', 'approved_to_contact', 'contacted', 'replied', 'fit_check_scheduled', 'qualified', 'payment_link_ready', 'payment_link_sent'] as const) {
    advanceProspect(prospect, state, 'founder');
  }
  saveQuickScanProspect(prospect);
  return prospect;
}

beforeEach(() => {
  process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET = SECRET;
  delete process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID;
  resetQuickScanStoreForTests();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET;
  else process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_PAYMENT_LINK_ID === undefined) delete process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID;
  else process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID = ORIGINAL_PAYMENT_LINK_ID;
  resetQuickScanStoreForTests();
});

describe('QuickScan Stripe webhook', () => {
  it('marks a matching prospect paid on a verified checkout.session.completed event', async () => {
    prospectAtPaymentLinkSent('prospect_1');
    const req = signedRequest(checkoutCompletedPayload());
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      applied: true,
      prospectId: 'prospect_1',
      lifecycleState: 'paid',
    });
  });

  it('rejects a request with an invalid signature', async () => {
    prospectAtPaymentLinkSent('prospect_1');
    const req = {
      body: Buffer.from(JSON.stringify(checkoutCompletedPayload())),
      header: () => 't=1,v1=deadbeef',
    } as unknown as Request;
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, code: 'INVALID_SIGNATURE' });
  });

  it('returns 503 when the webhook secret is not configured', async () => {
    delete process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET;
    const req = signedRequest(checkoutCompletedPayload());
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ ok: false, code: 'STRIPE_QUICKSCAN_WEBHOOK_NOT_CONFIGURED' });
  });

  it('acknowledges but ignores an unmatched prospect without erroring', async () => {
    const req = signedRequest(checkoutCompletedPayload({ client_reference_id: 'no-such-prospect' }));
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, applied: false, code: 'PROSPECT_NOT_FOUND' });
  });

  it('does not double-credit a replayed event id', async () => {
    prospectAtPaymentLinkSent('prospect_1');
    const payload = checkoutCompletedPayload();

    const first = makeResponse();
    await handleStripeQuickScanWebhook(signedRequest(payload), first);
    expect(first.json).toHaveBeenCalledWith({ ok: true, applied: true, prospectId: 'prospect_1', lifecycleState: 'paid' });

    const second = makeResponse();
    await handleStripeQuickScanWebhook(signedRequest(payload), second);
    expect(second.status).toHaveBeenCalledWith(200);
    expect(second.json).toHaveBeenCalledWith({ ok: true, applied: false, code: 'DUPLICATE_EVENT' });
  });

  it('acknowledges but does not apply a business-rule refusal, e.g. a prospect not awaiting payment', async () => {
    const prospect = createProspect({ businessName: 'Not Ready Yet', segment: 'salon_studio_team_owner' });
    prospect.id = 'prospect_1';
    saveQuickScanProspect(prospect);

    const req = signedRequest(checkoutCompletedPayload());
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      applied: false,
      code: 'TRANSITION_REFUSED',
      detail: expect.stringContaining('not payment_link_sent'),
    });
  });

  it('marks paid when the checkout matches the configured canonical Payment Link', async () => {
    process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID = 'plink_quickscan_canonical';
    prospectAtPaymentLinkSent('prospect_1');
    const req = signedRequest(checkoutCompletedPayload({ payment_link: 'plink_quickscan_canonical' }));
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      applied: true,
      prospectId: 'prospect_1',
      lifecycleState: 'paid',
    });
  });

  it('acknowledges but does not apply a same-price checkout from a different Payment Link once one is configured', async () => {
    process.env.STRIPE_QUICKSCAN_PAYMENT_LINK_ID = 'plink_quickscan_canonical';
    prospectAtPaymentLinkSent('prospect_1');
    const req = signedRequest(checkoutCompletedPayload({ payment_link: 'plink_unrelated_product' }));
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      applied: false,
      code: 'TRANSITION_REFUSED',
      detail: expect.stringContaining('payment_link=plink_unrelated_product'),
    });
  });

  it('acknowledges a signature-verified event of a type it does not act on', async () => {
    const payload = { id: 'evt_2', type: 'payment_intent.succeeded', data: { object: {} } };
    const req = signedRequest(payload);
    const res = makeResponse();

    await handleStripeQuickScanWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, applied: false, code: 'IGNORED_EVENT_TYPE' });
  });
});
