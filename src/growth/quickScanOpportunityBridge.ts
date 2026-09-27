import type { OpportunityEvidence, GrowthOpportunityAssessment } from './opportunityIntelligence.js';
import { evaluateGrowthOpportunity } from './opportunityIntelligence.js';
import { qualificationIsValid } from '../quickscan/engine.js';
import type { QuickScanLifecycleState, QuickScanProspect } from '../quickscan/contracts.js';
import type { LeadRecord, LeadStage, RevenueState } from '../types/growthInbox.js';

export const QUICKSCAN_OPPORTUNITY_NORTH_STAR =
  'Convert evidence-qualified QuickScan prospects into collected revenue and verified customer value without bypassing founder authority.';

export const QUICKSCAN_OPPORTUNITY_OFFER_ID = 'business_leak_quickscan';

const BOOKED_STATES = new Set<QuickScanLifecycleState>([
  'paid',
  'diagnostic_scheduled',
  'diagnostic_complete',
  'delivery_due',
  'delivered',
  'closed_won',
]);

function latestLifecycleChangeAt(prospect: QuickScanProspect): string {
  for (let index = prospect.audit.length - 1; index >= 0; index -= 1) {
    const entry = prospect.audit[index];
    if (entry?.type === 'lifecycle.transition') return entry.createdAt;
  }
  return prospect.createdAt;
}

function stageFor(prospect: QuickScanProspect): LeadStage {
  const state = prospect.lifecycleState;
  if (state === 'closed_lost' || state === 'disqualified') return 'lost';
  if (state === 'follow_up_later') return 'nurture';
  if (BOOKED_STATES.has(state)) return 'booked';
  if (state === 'payment_link_ready' || state === 'payment_link_sent') return 'high_intent';
  if (state === 'qualified' || state === 'fit_check_scheduled') return 'qualified';
  if (state === 'replied') return 'engaged';
  return 'new';
}

function revenueStateFor(prospect: QuickScanProspect): RevenueState {
  if (prospect.payment.status === 'refunded') return 'refunded';
  if (prospect.payment.status === 'paid' && prospect.payment.verifiedBy === 'stripe_webhook') {
    return 'payment_collected';
  }
  if (prospect.payment.status === 'paid') return 'pledged';
  if (prospect.payment.status === 'link_ready' || prospect.payment.status === 'link_sent') return 'invoiced';
  if (qualificationIsValid(prospect.qualification)) return 'qualified';
  if (prospect.lifecycleState === 'replied' || prospect.lifecycleState === 'fit_check_scheduled') return 'conversation';
  return 'attention';
}

function transitionAudit(prospect: QuickScanProspect, to: QuickScanLifecycleState) {
  return prospect.audit.find((entry) =>
    entry.type === 'lifecycle.transition' && entry.message.endsWith(` -> ${to}`));
}

function opportunityEvidence(prospect: QuickScanProspect): OpportunityEvidence[] {
  const evidence: OpportunityEvidence[] = [];
  const reply = transitionAudit(prospect, 'replied');
  if (reply) {
    evidence.push({
      reference: `quickscan:audit:${reply.id}:reply`,
      signal: 'reply',
      state: 'verified',
      source: 'quickscan.lifecycle',
      observedAt: reply.createdAt,
    });
  }

  const fitCheck = transitionAudit(prospect, 'fit_check_scheduled');
  if (fitCheck) {
    evidence.push({
      reference: `quickscan:audit:${fitCheck.id}:booking`,
      signal: 'booking_action',
      state: 'verified',
      source: 'quickscan.lifecycle',
      observedAt: fitCheck.createdAt,
    });
  }

  const qualified = transitionAudit(prospect, 'qualified');
  if (qualified && qualificationIsValid(prospect.qualification)) {
    evidence.push({
      reference: `quickscan:audit:${qualified.id}:need`,
      signal: 'expressed_need',
      state: 'verified',
      source: 'quickscan.qualification',
      observedAt: qualified.createdAt,
    });
    if (prospect.qualification?.urgency === 'now') {
      evidence.push({
        reference: `quickscan:audit:${qualified.id}:timing`,
        signal: 'timing_interest',
        state: 'verified',
        source: 'quickscan.qualification',
        observedAt: qualified.createdAt,
      });
    }
  }

  const manualPaid = prospect.audit.find((entry) => entry.type === 'payment.manual_verified');
  if (prospect.payment.status === 'paid' && prospect.payment.verifiedBy !== 'stripe_webhook' && manualPaid) {
    evidence.push({
      reference: `quickscan:audit:${manualPaid.id}:purchase`,
      signal: 'purchase_action',
      state: 'unknown',
      source: 'quickscan.manual_claim',
      observedAt: manualPaid.createdAt,
    });
  }

  const stripePaid = prospect.audit.find((entry) => entry.type === 'payment.stripe_webhook_verified');
  if (
    prospect.payment.status === 'paid'
    && prospect.payment.verifiedBy === 'stripe_webhook'
    && prospect.payment.verifiedAt
    && stripePaid
  ) {
    evidence.push(
      {
        reference: `quickscan:audit:${stripePaid.id}:purchase`,
        signal: 'purchase_action',
        state: 'verified',
        source: 'quickscan.stripe_webhook',
        observedAt: prospect.payment.verifiedAt,
      },
      {
        reference: `quickscan:audit:${stripePaid.id}:conversion`,
        signal: 'verified_conversion',
        state: 'verified',
        source: 'quickscan.stripe_webhook',
        observedAt: prospect.payment.verifiedAt,
      },
    );
  }

  return evidence;
}

export function buildQuickScanLeadRecord(prospect: QuickScanProspect): LeadRecord {
  const revenueState = revenueStateFor(prospect);
  return {
    projectId: 'founder-control-room',
    contactId: prospect.id,
    stage: stageFor(prospect),
    expressedNeed: prospect.qualification?.pain || undefined,
    productOrOffer: 'Business Leak QuickScan',
    sourceCampaign: 'quickscan',
    qualificationEvidence: prospect.evidence.map((item) => `quickscan:evidence:${item.id}`),
    nextAction: prospect.chiefRecommendation?.nextAction,
    owner: 'founder',
    projectedValueCents: prospect.payment.amountCents,
    ...(revenueState === 'payment_collected'
      ? { actualCollectedValueCents: prospect.payment.amountCents }
      : {}),
    revenueState,
    lastStageChangeAt: latestLifecycleChangeAt(prospect),
  };
}

export function assessQuickScanProspectOpportunity(
  prospect: QuickScanProspect,
): GrowthOpportunityAssessment {
  return evaluateGrowthOpportunity({
    lead: buildQuickScanLeadRecord(prospect),
    projectNorthStar: QUICKSCAN_OPPORTUNITY_NORTH_STAR,
    evaluatedAt: prospect.updatedAt,
    evidence: opportunityEvidence(prospect),
    offerId: QUICKSCAN_OPPORTUNITY_OFFER_ID,
  });
}
