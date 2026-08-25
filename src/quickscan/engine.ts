import { randomUUID } from 'node:crypto';
import {
  QUICKSCAN_CURRENCY,
  QUICKSCAN_HIGH_PRIORITY_SCORE,
  QUICKSCAN_PRICE_CENTS,
  type ChiefQuickScanRecommendation,
  type PromptWorkflowReference,
  type QuickScanApproval,
  type QuickScanEvidence,
  type QuickScanLifecycleState,
  type QuickScanOverrideReceipt,
  type QuickScanProspect,
  type QuickScanQualification,
  type QuickScanScore,
  type QuickScanSegment,
} from './contracts.js';
import type { VerifiedStripeCheckoutEvent } from './stripeWebhook.js';

const NEXT: Record<QuickScanLifecycleState, QuickScanLifecycleState[]> = {
  discovered: ['researched', 'closed_lost'],
  researched: ['qualified_for_outreach', 'follow_up_later', 'closed_lost'],
  qualified_for_outreach: ['draft_ready', 'disqualified', 'follow_up_later'],
  draft_ready: ['approved_to_contact', 'follow_up_later', 'closed_lost'],
  approved_to_contact: ['contacted', 'follow_up_later', 'closed_lost'],
  contacted: ['replied', 'follow_up_later', 'closed_lost'],
  replied: ['fit_check_scheduled', 'disqualified', 'follow_up_later'],
  fit_check_scheduled: ['qualified', 'disqualified', 'follow_up_later'],
  qualified: ['payment_link_ready', 'follow_up_later', 'closed_lost'],
  disqualified: ['closed_lost', 'follow_up_later'],
  payment_link_ready: ['payment_link_sent', 'follow_up_later', 'closed_lost'],
  payment_link_sent: ['paid', 'follow_up_later', 'closed_lost'],
  paid: ['diagnostic_scheduled'],
  diagnostic_scheduled: ['diagnostic_complete', 'closed_lost'],
  diagnostic_complete: ['delivery_due'],
  delivery_due: ['delivered'],
  delivered: ['closed_won'],
  closed_won: [],
  closed_lost: [],
  follow_up_later: ['researched', 'draft_ready', 'fit_check_scheduled', 'payment_link_ready', 'closed_lost'],
};

const OVERRIDEABLE = new Set<string>([
  'researched:qualified_for_outreach',
  'replied:fit_check_scheduled',
  'qualified:payment_link_ready',
]);

/**
 * Lifecycle states that must never be reached through the generic transition
 * endpoint, because reaching them without their evidence requirement would
 * let a bare state-machine walk assert a claim (qualification happened, a
 * payment link was actually sent, a charge happened, a diagnostic was
 * delivered) with nothing behind it. The raw NEXT map alone permits every
 * one of these as an ordinary step-by-step transition; gating them here is
 * what forces the whole qualification -> payment-link -> paid chain through
 * its dedicated, evidence-checked routes instead of a bare `to` value.
 */
export const EVIDENCE_GATED_TRANSITIONS: Partial<Record<QuickScanLifecycleState, string>> = {
  qualified: 'qualified requires POST /prospects/:id/qualification with a valid qualification record',
  payment_link_ready: 'payment_link_ready requires POST /prospects/:id/payment/manual with status=link_ready',
  payment_link_sent: 'payment_link_sent requires POST /prospects/:id/payment/manual with status=link_sent',
  paid: 'paid requires a verified Stripe webhook event or POST /payment/manual with explicit evidence',
  delivered: 'delivered requires POST /prospects/:id/delivery with a Loom delivery URL',
};

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}_${randomUUID()}`; }

export function calculateQuickScanScore(evidence: QuickScanEvidence[]): QuickScanScore {
  const categories = new Set(evidence.map((item) => item.category));
  const score: QuickScanScore = {
    visibleFriction: categories.has('visible_friction') ? 2 : 0,
    activeDemand: categories.has('active_demand') ? 2 : 0,
    ownerReachable: categories.has('owner_reachable') ? 1 : 0,
    repeatHighValue: categories.has('repeat_high_value_service') ? 2 : 0,
    operationalComplexity: categories.has('operational_complexity') ? 1 : 0,
    urgency: categories.has('urgency') ? 2 : 0,
    total: 0,
    evidenceIds: evidence.map((item) => item.id),
    humanApproved: false,
  };
  score.total = score.visibleFriction + score.activeDemand + score.ownerReachable + score.repeatHighValue + score.operationalComplexity + score.urgency;
  return score;
}

export function quickScanHighPriority(prospect: QuickScanProspect): boolean {
  return prospect.lifecycleState !== 'disqualified' && prospect.score.total >= QUICKSCAN_HIGH_PRIORITY_SCORE;
}

export function qualificationIsValid(value?: QuickScanQualification): boolean {
  return Boolean(value && value.decision === 'qualified' && value.authority === 'confirmed' && value.urgency === 'now'
    && value.pain.trim() && value.frequency.trim() && value.economicImpact.trim());
}

export function assertQuickScanTransition(from: QuickScanLifecycleState, to: QuickScanLifecycleState): void {
  if (!NEXT[from].includes(to)) throw new Error(`Invalid QuickScan lifecycle transition: ${from} -> ${to}`);
}

/**
 * Same rule as `assertQuickScanTransition`, plus a refusal of any target in
 * `EVIDENCE_GATED_TRANSITIONS`. Callers that own a gated target's evidence
 * requirement (the Stripe webhook, `/payment/manual`, `/delivery`) transition
 * through `advanceProspect` directly instead, after checking that evidence.
 */
export function assertUngatedQuickScanTransition(from: QuickScanLifecycleState, to: QuickScanLifecycleState): void {
  const gateReason = EVIDENCE_GATED_TRANSITIONS[to];
  if (gateReason) throw new Error(`QuickScan transition to ${to} is evidence-gated: ${gateReason}`);
  assertQuickScanTransition(from, to);
}

export function createOverrideReceipt(input: {
  actor: string;
  reason: string;
  from: QuickScanLifecycleState;
  to: QuickScanLifecycleState;
  evidenceIds: string[];
}): QuickScanOverrideReceipt {
  if (!OVERRIDEABLE.has(`${input.from}:${input.to}`)) {
    throw new Error(`QuickScan override is not permitted for ${input.from} -> ${input.to}`);
  }
  if (!input.actor.trim() || !input.reason.trim() || input.evidenceIds.length === 0) {
    throw new Error('QuickScan override requires actor, reason, and evidence');
  }
  return { id: id('override'), ...input, createdAt: now() };
}

export function createProspect(input: { businessName: string; ownerName?: string; segment: QuickScanSegment }): QuickScanProspect {
  const createdAt = now();
  return {
    id: id('prospect'),
    businessName: input.businessName.trim(),
    ownerName: input.ownerName?.trim() || undefined,
    segment: input.segment,
    lifecycleState: 'discovered',
    evidence: [],
    score: calculateQuickScanScore([]),
    approvals: [],
    overrideReceipts: [],
    payment: { status: 'unpaid', amountCents: QUICKSCAN_PRICE_CENTS },
    audit: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function advanceProspect(prospect: QuickScanProspect, to: QuickScanLifecycleState, actor: string, override?: QuickScanOverrideReceipt): QuickScanProspect {
  if (override) {
    if (override.from !== prospect.lifecycleState || override.to !== to) throw new Error('QuickScan override does not bind this transition');
    prospect.overrideReceipts.push(override);
  } else {
    assertQuickScanTransition(prospect.lifecycleState, to);
  }
  const from = prospect.lifecycleState;
  prospect.lifecycleState = to;
  prospect.updatedAt = now();
  prospect.audit.push({ id: id('audit'), type: 'lifecycle.transition', message: `${from} -> ${to}`, actor, createdAt: prospect.updatedAt });
  return prospect;
}

export function addEvidence(prospect: QuickScanProspect, evidence: Omit<QuickScanEvidence, 'id' | 'observedAt'>, actor: string): QuickScanProspect {
  const item: QuickScanEvidence = { ...evidence, id: id('evidence'), observedAt: now() };
  prospect.evidence.push(item);
  prospect.score = calculateQuickScanScore(prospect.evidence);
  prospect.updatedAt = now();
  prospect.audit.push({ id: id('audit'), type: 'evidence.recorded', message: `${item.category}: ${item.note}`, actor, createdAt: prospect.updatedAt });
  return prospect;
}

export function setChiefRecommendation(prospect: QuickScanProspect, recommendation: ChiefQuickScanRecommendation, selectedWorkflow: PromptWorkflowReference, actor = 'chief'): QuickScanProspect {
  const used = recommendation.promptWorkflow;
  if (JSON.stringify(used) !== JSON.stringify(selectedWorkflow)) {
    throw new Error('Chief recommendation provenance does not match the PromptOS-selected workflow');
  }
  prospect.chiefRecommendation = recommendation;
  prospect.updatedAt = now();
  prospect.audit.push({ id: id('audit'), type: 'chief.recommendation', message: recommendation.nextAction, actor, createdAt: prospect.updatedAt });
  return prospect;
}

export function proposeApproval(prospect: QuickScanProspect, input: Omit<QuickScanApproval, 'id' | 'decision'>): QuickScanApproval {
  const approval: QuickScanApproval = { id: id('approval'), decision: 'PENDING', ...input };
  prospect.approvals.push(approval);
  return approval;
}

export function decideApproval(prospect: QuickScanProspect, approvalId: string, decision: 'APPROVE' | 'EDIT' | 'SKIP', actor: string, editedAction?: string): QuickScanProspect {
  const approval = prospect.approvals.find((item) => item.id === approvalId);
  if (!approval) throw new Error('QuickScan approval not found');
  if (approval.decision !== 'PENDING') {
    throw new Error(`QuickScan approval already decided (${approval.decision})`);
  }
  approval.decision = decision;
  approval.decidedBy = actor;
  approval.decidedAt = now();
  if (decision === 'EDIT') {
    if (!editedAction?.trim()) throw new Error('Edited QuickScan approval requires replacement action text');
    approval.proposedAction = editedAction.trim();
  }
  prospect.updatedAt = now();
  prospect.audit.push({ id: id('audit'), type: 'approval.decided', message: `${approval.action}:${decision}`, actor, createdAt: prospect.updatedAt });
  return prospect;
}

export function recordQualification(prospect: QuickScanProspect, qualification: QuickScanQualification, actor: string): QuickScanProspect {
  prospect.qualification = qualification;
  const target: QuickScanLifecycleState = qualificationIsValid(qualification) ? 'qualified' : 'disqualified';
  return advanceProspect(prospect, target, actor);
}

/**
 * Marks a prospect paid from a signature-verified Stripe checkout.session.
 * completed event. This is the only path that may transition to `paid`
 * without a founder-supplied evidence string: the verified event itself is
 * the evidence, recorded with Stripe's own identifiers so the claim can be
 * checked against the Stripe Dashboard later.
 *
 * Refuses (rather than silently no-ops) when the event's payment_status is
 * not `paid`, when the checkout session's amount or currency does not match
 * the QuickScan price exactly, when a configured expected Payment Link
 * identity doesn't match the session's own `payment_link`, or when the
 * prospect is not in `payment_link_sent` — a real webhook event is never
 * enough on its own to skip founder-controlled qualification and approval;
 * completing *some* checkout is never enough to skip verifying it was
 * completed for the full, correct amount; and, when the founder has
 * configured which Payment Link is the canonical QuickScan one, completing
 * checkout on a *different* Stripe product at the same price is never
 * enough either.
 */
export function markPaidFromVerifiedStripeEvent(
  prospect: QuickScanProspect,
  event: VerifiedStripeCheckoutEvent,
  actor: string,
  options: { expectedPaymentLinkId?: string } = {},
): QuickScanProspect {
  if (event.paymentStatus !== 'paid') {
    throw new Error(`QuickScan Stripe event ${event.eventId} reports payment_status=${event.paymentStatus}, not paid`);
  }
  if (event.amountTotal !== prospect.payment.amountCents) {
    throw new Error(`QuickScan Stripe event ${event.eventId} reports amount_total=${event.amountTotal ?? 'missing'}, expected ${prospect.payment.amountCents}; refusing to mark paid`);
  }
  if (event.currency?.toLowerCase() !== QUICKSCAN_CURRENCY) {
    throw new Error(`QuickScan Stripe event ${event.eventId} reports currency=${event.currency ?? 'missing'}, expected ${QUICKSCAN_CURRENCY}; refusing to mark paid`);
  }
  if (options.expectedPaymentLinkId && event.paymentLinkId !== options.expectedPaymentLinkId) {
    throw new Error(`QuickScan Stripe event ${event.eventId} reports payment_link=${event.paymentLinkId ?? 'missing'}, expected ${options.expectedPaymentLinkId}; refusing to mark paid`);
  }
  if (prospect.lifecycleState !== 'payment_link_sent') {
    throw new Error(`QuickScan prospect ${prospect.id} is ${prospect.lifecycleState}, not payment_link_sent; refusing to mark paid`);
  }

  const verifiedAt = now();
  prospect.payment = {
    ...prospect.payment,
    status: 'paid',
    verifiedBy: 'stripe_webhook',
    verifiedAt,
    stripeEventId: event.eventId,
    stripeSessionId: event.sessionId,
    stripePaymentIntentId: event.paymentIntentId ?? undefined,
  };
  prospect.audit.push({
    id: id('audit'),
    type: 'payment.stripe_webhook_verified',
    message: `event ${event.eventId}: amount_total=${event.amountTotal ?? 'unknown'} ${event.currency ?? ''}`.trim(),
    actor,
    createdAt: verifiedAt,
  });
  return advanceProspect(prospect, 'paid', actor);
}

const APPROVED_DELIVERY_HOSTS = new Set(['loom.com', 'www.loom.com']);

function isApprovedLoomUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && APPROVED_DELIVERY_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Records delivery evidence and is the only path that may transition a
 * prospect to `delivered`. A prospect must not be able to reach the
 * revenue-recognized terminal state of the funnel on a bare state-machine
 * walk with nothing behind it, so this requires an actual `https://loom.com`
 * URL — not just a non-empty string, which any caller could defeat with
 * placeholder text — and the prospect already being `delivery_due`.
 */
export function recordDelivery(prospect: QuickScanProspect, loomUrl: string, actor: string): QuickScanProspect {
  const trimmedUrl = loomUrl.trim();
  if (!isApprovedLoomUrl(trimmedUrl)) throw new Error('QuickScan delivery requires an https://loom.com Loom delivery URL');
  if (prospect.lifecycleState !== 'delivery_due') {
    throw new Error(`QuickScan prospect ${prospect.id} is ${prospect.lifecycleState}, not delivery_due; refusing to record delivery`);
  }
  const deliveredAt = now();
  prospect.delivery = { loomUrl: trimmedUrl, deliveredAt };
  prospect.audit.push({ id: id('audit'), type: 'delivery.recorded', message: `delivered via ${trimmedUrl}`, actor, createdAt: deliveredAt });
  return advanceProspect(prospect, 'delivered', actor);
}
