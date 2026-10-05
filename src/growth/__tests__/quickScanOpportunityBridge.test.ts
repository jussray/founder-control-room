import { describe, expect, it } from 'vitest';
import type { QuickScanProspect } from '../../quickscan/contracts.js';
import { assessQuickScanProspectOpportunity, buildQuickScanLeadRecord } from '../quickScanOpportunityBridge.js';

const AT = '2026-09-26T22:00:00.000Z';

function prospect(overrides: Partial<QuickScanProspect> = {}): QuickScanProspect {
  return {
    id: 'prospect_real_candidate_001',
    businessName: 'Example Beauty Studio',
    ownerName: 'Owner',
    segment: 'salon_studio_team_owner',
    lifecycleState: 'discovered',
    evidence: [],
    score: {
      visibleFriction: 0,
      activeDemand: 0,
      ownerReachable: 0,
      repeatHighValue: 0,
      operationalComplexity: 0,
      urgency: 0,
      total: 0,
      evidenceIds: [],
      humanApproved: false,
    },
    approvals: [],
    overrideReceipts: [],
    payment: { status: 'unpaid', amountCents: 24900 },
    audit: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

describe('QuickScan opportunity intelligence bridge', () => {
  it('keeps a discovery-only prospect unknown instead of manufacturing buyer intent', () => {
    const result = assessQuickScanProspectOpportunity(prospect());

    expect(result.priorityBand).toBe('unknown');
    expect(result.score).toBe(0);
    expect(result.recommendedStage).toBe('new');
    expect(result.nextGate).toBe('collect_qualification_evidence');
    expect(result.authority).toMatchObject({
      advisoryOnly: true,
      authorizesOutreach: false,
      authorizesLeadMutation: false,
      authorizesSpend: false,
    });
  });

  it('turns recorded reply, fit-check booking, and valid qualification into evidence-bound opportunity signals', () => {
    const item = prospect({
      lifecycleState: 'qualified',
      qualification: {
        pain: 'Booking requests are getting lost between comments and DMs.',
        frequency: 'several times per week',
        economicImpact: 'missed appointments exceed the QuickScan fee',
        authority: 'confirmed',
        urgency: 'now',
        decision: 'qualified',
      },
      audit: [
        { id: 'audit_reply', type: 'lifecycle.transition', message: 'contacted -> replied', actor: 'founder', createdAt: '2026-09-26T21:00:00.000Z' },
        { id: 'audit_fit', type: 'lifecycle.transition', message: 'replied -> fit_check_scheduled', actor: 'founder', createdAt: '2026-09-26T21:15:00.000Z' },
        { id: 'audit_qualified', type: 'lifecycle.transition', message: 'fit_check_scheduled -> qualified', actor: 'founder', createdAt: '2026-09-26T21:30:00.000Z' },
      ],
    });

    const result = assessQuickScanProspectOpportunity(item);

    expect(result.priorityBand).toBe('hot');
    expect(result.score).toBe(60);
    expect(result.recommendedStage).toBe('booked');
    expect(result.personalizationContext.verifiedSignals).toEqual([
      'booking_action',
      'expressed_need',
      'reply',
      'timing_interest',
    ]);
  });

  it('does not recognize a founder-typed manual paid claim as collected revenue', () => {
    const item = prospect({
      lifecycleState: 'paid',
      payment: { status: 'paid', amountCents: 24900 },
      audit: [
        { id: 'audit_manual_paid', type: 'payment.manual_verified', message: 'Founder recorded dashboard receipt', actor: 'founder', createdAt: '2026-09-26T21:50:00.000Z' },
        { id: 'audit_paid', type: 'lifecycle.transition', message: 'payment_link_sent -> paid', actor: 'founder', createdAt: '2026-09-26T21:50:00.000Z' },
      ],
    });

    const lead = buildQuickScanLeadRecord(item);
    const result = assessQuickScanProspectOpportunity(item);

    expect(lead.revenueState).toBe('pledged');
    expect(lead.actualCollectedValueCents).toBeUndefined();
    expect(result.priorityBand).not.toBe('won');
    expect(result.unknowns).toContain('unknown:purchase_action:quickscan:audit:audit_manual_paid:purchase');
  });

  it('recognizes collected revenue only when Stripe webhook evidence is bound to the paid prospect', () => {
    const item = prospect({
      lifecycleState: 'paid',
      payment: {
        status: 'paid',
        amountCents: 24900,
        verifiedBy: 'stripe_webhook',
        verifiedAt: '2026-09-26T21:55:00.000Z',
        stripeEventId: 'evt_quickscan_001',
        stripeSessionId: 'cs_quickscan_001',
      },
      audit: [
        { id: 'audit_stripe_paid', type: 'payment.stripe_webhook_verified', message: 'event evt_quickscan_001: amount_total=24900 usd', actor: 'stripe', createdAt: '2026-09-26T21:55:00.000Z' },
        { id: 'audit_paid', type: 'lifecycle.transition', message: 'payment_link_sent -> paid', actor: 'stripe', createdAt: '2026-09-26T21:55:00.000Z' },
      ],
    });

    const lead = buildQuickScanLeadRecord(item);
    const first = assessQuickScanProspectOpportunity(item);
    const second = assessQuickScanProspectOpportunity(item);

    expect(lead.revenueState).toBe('payment_collected');
    expect(lead.actualCollectedValueCents).toBe(24900);
    expect(first.priorityBand).toBe('won');
    expect(first.recommendedStage).toBe('won');
    expect(first.nextGate).toBe('deliver_and_verify_customer_value');
    expect(first.personalizationContext.verifiedSignals).toEqual(['purchase_action', 'verified_conversion']);
    expect(first.continuity.fingerprint).toBe(second.continuity.fingerprint);
  });
});
