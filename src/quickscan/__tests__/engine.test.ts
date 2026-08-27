import { describe, expect, it } from 'vitest';
import {
  addEvidence,
  advanceProspect,
  assertQuickScanTransition,
  assertUngatedQuickScanTransition,
  createOverrideReceipt,
  createProspect,
  decideApproval,
  markPaidFromVerifiedStripeEvent,
  proposeApproval,
  recordDelivery,
  setChiefRecommendation,
} from '../engine.js';
import type { PromptWorkflowReference } from '../contracts.js';
import type { VerifiedStripeCheckoutEvent } from '../stripeWebhook.js';

const SEGMENT = 'salon_studio_team_owner' as const;

function scoredProspect() {
  const prospect = createProspect({ businessName: 'Example Studio', segment: SEGMENT });
  for (const category of ['visible_friction','active_demand','owner_reachable','repeat_high_value_service','operational_complexity','urgency'] as const) {
    addEvidence(prospect, { category, note: `Observed ${category}` }, 'founder');
  }
  return prospect;
}

function prospectAtPaymentLinkSent() {
  const prospect = scoredProspect();
  for (const state of ['researched', 'qualified_for_outreach', 'draft_ready', 'approved_to_contact', 'contacted', 'replied', 'fit_check_scheduled', 'qualified', 'payment_link_ready', 'payment_link_sent'] as const) {
    advanceProspect(prospect, state, 'founder');
  }
  return prospect;
}

function prospectAtDeliveryDue() {
  const prospect = prospectAtPaymentLinkSent();
  markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id }), 'stripe-webhook');
  for (const state of ['diagnostic_scheduled', 'diagnostic_complete', 'delivery_due'] as const) {
    advanceProspect(prospect, state, 'founder');
  }
  return prospect;
}

function verifiedEvent(overrides: Partial<VerifiedStripeCheckoutEvent> = {}): VerifiedStripeCheckoutEvent {
  return {
    eventId: 'evt_1',
    sessionId: 'cs_1',
    paymentIntentId: 'pi_1',
    clientReferenceId: 'prospect_1',
    amountTotal: 24900,
    currency: 'usd',
    paymentStatus: 'paid',
    paymentLinkId: 'plink_quickscan_canonical',
    ...overrides,
  };
}

describe('QuickScan engine', () => {
  it('scores observable evidence to 10 without demographic shortcuts', () => {
    const prospect = scoredProspect();
    expect(prospect.score.total).toBe(10);
    expect(createProspect({ businessName: 'Beauty Account', segment: SEGMENT }).score.total).toBe(0);
  });

  it('rejects contacted -> paid even when qualification might exist elsewhere', () => {
    expect(() => assertQuickScanTransition('contacted', 'paid')).toThrow('Invalid QuickScan lifecycle transition');
  });

  it('requires auditable evidence-bound overrides and limits overrideable transitions', () => {
    const prospect = scoredProspect();
    advanceProspect(prospect, 'researched', 'founder');
    const receipt = createOverrideReceipt({
      actor: 'founder@example.com',
      reason: 'Founder reviewed exact observed evidence.',
      from: 'researched',
      to: 'qualified_for_outreach',
      evidenceIds: prospect.score.evidenceIds,
    });
    expect(advanceProspect(prospect, 'qualified_for_outreach', 'founder', receipt).overrideReceipts).toHaveLength(1);
    expect(() => createOverrideReceipt({ actor: 'founder', reason: 'skip', from: 'contacted', to: 'paid', evidenceIds: ['e1'] })).toThrow('override is not permitted');
  });

  it('binds Chief output to the exact PromptOS-selected workflow reference', () => {
    const prospect = scoredProspect();
    const selected: PromptWorkflowReference = { workflowId: 'quickscan-outreach', workflowVersion: '1', promptId: 'pain-first', promptVersion: '2' };
    setChiefRecommendation(prospect, {
      summary: 'High-priority observable pain.',
      nextAction: 'approve_outreach',
      messageDraft: 'Question-first draft',
      promptWorkflow: selected,
    }, selected);
    expect(prospect.chiefRecommendation?.promptWorkflow.promptVersion).toBe('2');

    expect(() => setChiefRecommendation(prospect, {
      summary: 'Mismatch', nextAction: 'approve_outreach', promptWorkflow: { ...selected, promptVersion: '3' },
    }, selected)).toThrow('provenance');
  });

  it('marks a prospect paid from a verified Stripe checkout event', () => {
    const prospect = prospectAtPaymentLinkSent();
    const result = markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id }), 'stripe-webhook');

    expect(result.lifecycleState).toBe('paid');
    expect(result.payment).toMatchObject({
      status: 'paid',
      verifiedBy: 'stripe_webhook',
      stripeEventId: 'evt_1',
      stripeSessionId: 'cs_1',
      stripePaymentIntentId: 'pi_1',
    });
    expect(result.audit.some((entry) => entry.type === 'payment.stripe_webhook_verified')).toBe(true);
  });

  it('refuses to mark paid from an event whose payment_status is not paid', () => {
    const prospect = prospectAtPaymentLinkSent();
    expect(() => markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ paymentStatus: 'unpaid' }), 'stripe-webhook'))
      .toThrow('not paid');
    expect(prospect.lifecycleState).toBe('payment_link_sent');
  });

  it('refuses a verified event when the prospect is not awaiting payment', () => {
    const prospect = scoredProspect();
    expect(() => markPaidFromVerifiedStripeEvent(prospect, verifiedEvent(), 'stripe-webhook'))
      .toThrow('not payment_link_sent');
  });

  it('refuses to mark paid when the checkout amount does not match the QuickScan price', () => {
    const prospect = prospectAtPaymentLinkSent();
    expect(() => markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id, amountTotal: 100 }), 'stripe-webhook'))
      .toThrow('amount_total=100');
    expect(prospect.lifecycleState).toBe('payment_link_sent');
  });

  it('refuses to mark paid when the checkout amount is missing', () => {
    const prospect = prospectAtPaymentLinkSent();
    expect(() => markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id, amountTotal: null }), 'stripe-webhook'))
      .toThrow('amount_total=missing');
  });

  it('refuses to mark paid when the checkout currency does not match', () => {
    const prospect = prospectAtPaymentLinkSent();
    expect(() => markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id, currency: 'eur' }), 'stripe-webhook'))
      .toThrow('currency=eur');
    expect(prospect.lifecycleState).toBe('payment_link_sent');
  });

  it('accepts a checkout on the configured canonical Payment Link', () => {
    const prospect = prospectAtPaymentLinkSent();
    const result = markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id }), 'stripe-webhook', {
      expectedPaymentLinkId: 'plink_quickscan_canonical',
    });
    expect(result.lifecycleState).toBe('paid');
  });

  it('refuses a same-price checkout completed on a different Payment Link when one is configured', () => {
    const prospect = prospectAtPaymentLinkSent();
    expect(() => markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id, paymentLinkId: 'plink_unrelated_product' }), 'stripe-webhook', {
      expectedPaymentLinkId: 'plink_quickscan_canonical',
    })).toThrow('payment_link=plink_unrelated_product');
    expect(prospect.lifecycleState).toBe('payment_link_sent');
  });

  it('does not require a matching Payment Link when none is configured', () => {
    const prospect = prospectAtPaymentLinkSent();
    const result = markPaidFromVerifiedStripeEvent(prospect, verifiedEvent({ clientReferenceId: prospect.id, paymentLinkId: 'plink_anything' }), 'stripe-webhook');
    expect(result.lifecycleState).toBe('paid');
  });

  it('records delivery evidence and marks a delivery_due prospect delivered', () => {
    const prospect = prospectAtDeliveryDue();
    const result = recordDelivery(prospect, 'https://loom.com/share/example', 'founder');

    expect(result.lifecycleState).toBe('delivered');
    expect(result.delivery?.loomUrl).toBe('https://loom.com/share/example');
    expect(result.delivery?.deliveredAt).toBeTruthy();
    expect(result.audit.some((entry) => entry.type === 'delivery.recorded')).toBe(true);
  });

  it('refuses to record delivery without a Loom URL', () => {
    const prospect = prospectAtDeliveryDue();
    expect(() => recordDelivery(prospect, '  ', 'founder')).toThrow('Loom delivery URL');
    expect(prospect.lifecycleState).toBe('delivery_due');
  });

  it('refuses placeholder text or non-Loom URLs as delivery evidence', () => {
    const prospect = prospectAtDeliveryDue();
    expect(() => recordDelivery(prospect, 'not-delivered', 'founder')).toThrow('Loom delivery URL');
    expect(() => recordDelivery(prospect, 'https://example.com/not-loom', 'founder')).toThrow('Loom delivery URL');
    expect(() => recordDelivery(prospect, 'http://loom.com/share/example', 'founder')).toThrow('Loom delivery URL');
    expect(prospect.lifecycleState).toBe('delivery_due');
  });

  it('refuses to record delivery when the prospect is not delivery_due', () => {
    const prospect = prospectAtPaymentLinkSent();
    expect(() => recordDelivery(prospect, 'https://loom.com/share/example', 'founder')).toThrow('not delivery_due');
  });

  it('refuses to decide an approval that has already been decided', () => {
    const prospect = scoredProspect();
    const approval = proposeApproval(prospect, { action: 'outreach', proposedAction: 'Draft', reason: 'Observed pain', evidenceIds: [], recommendedBy: 'human' });
    decideApproval(prospect, approval.id, 'SKIP', 'founder');
    expect(() => decideApproval(prospect, approval.id, 'APPROVE', 'founder')).toThrow('already decided');
    expect(approval.decision).toBe('SKIP');
  });

  it('blocks the generic transition path from reaching evidence-gated states directly', () => {
    expect(() => assertUngatedQuickScanTransition('fit_check_scheduled', 'qualified')).toThrow('evidence-gated');
    expect(() => assertUngatedQuickScanTransition('qualified', 'payment_link_ready')).toThrow('evidence-gated');
    expect(() => assertUngatedQuickScanTransition('payment_link_ready', 'payment_link_sent')).toThrow('evidence-gated');
    expect(() => assertUngatedQuickScanTransition('payment_link_sent', 'paid')).toThrow('evidence-gated');
    expect(() => assertUngatedQuickScanTransition('delivery_due', 'delivered')).toThrow('evidence-gated');
    expect(() => assertUngatedQuickScanTransition('discovered', 'researched')).not.toThrow();
  });
});
