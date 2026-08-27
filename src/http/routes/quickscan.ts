import { Router, type Response } from 'express';
import {
  QUICKSCAN_CONTRACT,
  QUICKSCAN_PRICE_CENTS,
  type QuickScanApproval,
  type QuickScanEvidenceCategory,
  type QuickScanLifecycleState,
  type QuickScanSegment,
} from '../../quickscan/contracts.js';
import {
  addEvidence,
  advanceProspect,
  assertUngatedQuickScanTransition,
  createOverrideReceipt,
  createProspect,
  decideApproval,
  proposeApproval,
  qualificationIsValid,
  recordDelivery,
  recordQualification,
  setChiefRecommendation,
} from '../../quickscan/engine.js';
import { getQuickScanProspect, listQuickScanProspects, saveQuickScanProspect } from '../../quickscan/store.js';
import { buildTrackedStripePaymentLinkUrl } from '../../quickscan/stripeWebhook.js';
import {
  createOpenAiQuickScanChiefRunner,
  QuickScanChiefProviderError,
  type QuickScanChiefResult,
} from '../../quickscan/chiefOpenaiClient.js';
import { QUICKSCAN_CHIEF_WORKFLOW } from '../../quickscan/chiefPrompts.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

type RunQuickScanChief = ReturnType<typeof createOpenAiQuickScanChiefRunner>;

export interface QuickScanRouteDependencies {
  runChief?: RunQuickScanChief;
}

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function fail(res: Response, status: number, code: string, message: string) { return res.status(status).json({ ok: false, code, message, contract: QUICKSCAN_CONTRACT }); }

const SEGMENTS = new Set<QuickScanSegment>(['high_volume_solo_operator','salon_studio_team_owner','beauty_educator','wig_custom_order_business','high_ticket_beauty_wellness_operator']);
const EVIDENCE = new Set<QuickScanEvidenceCategory>(['visible_friction','active_demand','owner_reachable','repeat_high_value_service','operational_complexity','urgency']);

/**
 * Only these Chief next-action recommendations map onto an existing
 * QuickScanApproval action a founder can APPROVE/EDIT/SKIP; the rest
 * (capture_more_evidence, offer_fit_check, disqualify) have nothing to
 * "send" and are surfaced as a recommendation only, with no approval
 * auto-created.
 */
const CHIEF_ACTION_TO_APPROVAL: Partial<Record<string, QuickScanApproval['action']>> = {
  approve_outreach: 'outreach',
  send_payment_link: 'payment_link',
  prepare_delivery: 'delivery',
};

function providerErrorCode(error: unknown): string {
  return error instanceof QuickScanChiefProviderError ? error.code : 'QUICKSCAN_CHIEF_FAILED';
}

export function createQuickScanRouter(dependencies: QuickScanRouteDependencies = {}) {
  const quickScanRouter = Router();
  const runChief = dependencies.runChief ?? createOpenAiQuickScanChiefRunner();

  quickScanRouter.use(requireFounder);

quickScanRouter.get('/', (_req, res) => {
  const prospects = listQuickScanProspects();
  return res.json({
    ok: true,
    contract: QUICKSCAN_CONTRACT,
    authority: {
      recommend: true,
      approve: true,
      recordManualOutcome: true,
      sendExternal: false,
      scrape: false,
      executeN8n: false,
      stripeWebhookConfigured: Boolean(process.env.STRIPE_QUICKSCAN_WEBHOOK_SECRET?.trim()),
      chiefConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    architecture: { fcr: 'authority-evidence-ui', chief: 'replaceable-reasoning', promptos: 'versioned-workflow-provenance', ultrathink: 'domain-rules', n8n: 'orchestration-disabled-v1' },
    priceCents: QUICKSCAN_PRICE_CENTS,
    prospects,
  });
});

quickScanRouter.post('/prospects', (req: FounderRequest, res) => {
  const body = record(req.body);
  const segment = text(body.segment) as QuickScanSegment;
  if (!text(body.businessName) || !SEGMENTS.has(segment)) return fail(res, 400, 'INVALID_PROSPECT', 'businessName and a supported segment are required');
  const prospect = createProspect({ businessName: text(body.businessName), ownerName: text(body.ownerName) || undefined, segment });
  saveQuickScanProspect(prospect);
  return res.status(201).json({ ok: true, contract: QUICKSCAN_CONTRACT, prospect });
});

quickScanRouter.post('/prospects/:id/evidence', (req: FounderRequest, res) => {
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');
  const body = record(req.body);
  const category = text(body.category) as QuickScanEvidenceCategory;
  if (!EVIDENCE.has(category) || !text(body.note)) return fail(res, 400, 'INVALID_EVIDENCE', 'category and truthful evidence note are required');
  addEvidence(prospect, { category, note: text(body.note), sourceUrl: text(body.sourceUrl) || undefined }, req.founder?.email ?? 'founder');
  saveQuickScanProspect(prospect);
  return res.json({ ok: true, prospect });
});

quickScanRouter.post('/prospects/:id/transition', (req: FounderRequest, res) => {
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');
  const body = record(req.body);
  const to = text(body.to) as QuickScanLifecycleState;
  try {
    if (body.override === true) {
      const receipt = createOverrideReceipt({ actor: req.founder?.email ?? 'founder', reason: text(body.reason), from: prospect.lifecycleState, to, evidenceIds: Array.isArray(body.evidenceIds) ? body.evidenceIds.filter((v): v is string => typeof v === 'string') : [] });
      advanceProspect(prospect, to, req.founder?.email ?? 'founder', receipt);
    } else {
      assertUngatedQuickScanTransition(prospect.lifecycleState, to);
      advanceProspect(prospect, to, req.founder?.email ?? 'founder');
    }
    saveQuickScanProspect(prospect);
    return res.json({ ok: true, prospect });
  } catch (error) {
    return fail(res, 409, 'TRANSITION_BLOCKED', error instanceof Error ? error.message : 'transition blocked');
  }
});

quickScanRouter.post('/prospects/:id/approvals', (req: FounderRequest, res) => {
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');
  const body = record(req.body);
  const action = text(body.action) as 'outreach' | 'payment_link' | 'follow_up' | 'delivery';
  if (!['outreach','payment_link','follow_up','delivery'].includes(action) || !text(body.proposedAction) || !text(body.reason)) return fail(res, 400, 'INVALID_APPROVAL', 'action, proposedAction, and reason are required');
  const approval = proposeApproval(prospect, { action, proposedAction: text(body.proposedAction), reason: text(body.reason), evidenceIds: Array.isArray(body.evidenceIds) ? body.evidenceIds.filter((v): v is string => typeof v === 'string') : [], recommendedBy: 'human' });
  saveQuickScanProspect(prospect);
  return res.status(201).json({ ok: true, approval, prospect });
});

quickScanRouter.post('/prospects/:id/approvals/:approvalId/decision', (req: FounderRequest, res) => {
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');
  const body = record(req.body);
  const decision = text(body.decision) as 'APPROVE' | 'EDIT' | 'SKIP';
  if (!['APPROVE','EDIT','SKIP'].includes(decision)) return fail(res, 400, 'INVALID_DECISION', 'decision must be APPROVE, EDIT, or SKIP');
  try {
    decideApproval(prospect, req.params.approvalId, decision, req.founder?.email ?? 'founder', text(body.editedAction) || undefined);
    saveQuickScanProspect(prospect);
    return res.json({ ok: true, prospect });
  } catch (error) {
    return fail(res, 409, 'APPROVAL_BLOCKED', error instanceof Error ? error.message : 'approval blocked');
  }
});

quickScanRouter.post('/prospects/:id/qualification', (req: FounderRequest, res) => {
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');
  const body = record(req.body);
  const qualification = {
    pain: text(body.pain), frequency: text(body.frequency), economicImpact: text(body.economicImpact),
    authority: text(body.authority) as 'confirmed' | 'not_confirmed' | 'unknown',
    urgency: text(body.urgency) as 'now' | 'later' | 'unknown',
    decision: text(body.decision) as 'qualified' | 'disqualified' | 'pending',
  };
  try {
    recordQualification(prospect, qualification, req.founder?.email ?? 'founder');
    saveQuickScanProspect(prospect);
    return res.json({ ok: true, qualified: qualificationIsValid(qualification), prospect });
  } catch (error) {
    return fail(res, 409, 'QUALIFICATION_BLOCKED', error instanceof Error ? error.message : 'qualification blocked');
  }
});

quickScanRouter.post('/prospects/:id/payment/manual', (req: FounderRequest, res) => {
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');
  const body = record(req.body);
  if (!qualificationIsValid(prospect.qualification)) return fail(res, 409, 'QUALIFICATION_REQUIRED', 'verified qualification is required before payment progression');
  const paymentApproval = prospect.approvals.find((item) => item.action === 'payment_link' && (item.decision === 'APPROVE' || item.decision === 'EDIT'));
  if (!paymentApproval) return fail(res, 409, 'PAYMENT_APPROVAL_REQUIRED', 'founder approval is required before payment-link progression');
  const status = text(body.status);
  let trackedPaymentLinkUrl: string | null = null;
  if (status === 'link_ready') {
    const paymentLinkUrl = text(body.paymentLinkUrl) || undefined;
    prospect.payment = { ...prospect.payment, status: 'link_ready', paymentLinkUrl };
    if (prospect.lifecycleState === 'qualified') advanceProspect(prospect, 'payment_link_ready', req.founder?.email ?? 'founder');
    // The stored link stays exactly what the founder pasted; the tracked
    // variant (with ?client_reference_id=<prospectId>) is what must actually
    // be sent, or an inbound Stripe webhook cannot correlate back to this
    // prospect. Computed on read, never persisted as the link of record.
    trackedPaymentLinkUrl = paymentLinkUrl ? buildTrackedStripePaymentLinkUrl(paymentLinkUrl, prospect.id) : null;
  } else if (status === 'link_sent') {
    if (prospect.lifecycleState !== 'payment_link_ready') return fail(res, 409, 'PAYMENT_STATE_BLOCKED', 'payment link must be ready before it can be marked sent');
    prospect.payment.status = 'link_sent';
    advanceProspect(prospect, 'payment_link_sent', req.founder?.email ?? 'founder');
  } else if (status === 'paid') {
    if (prospect.lifecycleState !== 'payment_link_sent' || !text(body.evidence)) return fail(res, 409, 'PAYMENT_EVIDENCE_REQUIRED', 'manual paid state requires link_sent plus explicit payment evidence');
    prospect.payment.status = 'paid';
    prospect.audit.push({ id: `audit_${Date.now()}`, type: 'payment.manual_verified', message: text(body.evidence), actor: req.founder?.email ?? 'founder', createdAt: new Date().toISOString() });
    advanceProspect(prospect, 'paid', req.founder?.email ?? 'founder');
  } else return fail(res, 400, 'INVALID_PAYMENT_STATUS', 'supported manual statuses: link_ready, link_sent, paid');
  saveQuickScanProspect(prospect);
  return res.json({
    ok: true,
    externalMutation: false,
    stripeWebhookVerified: false,
    ...(trackedPaymentLinkUrl ? { trackedPaymentLinkUrl } : {}),
    prospect,
  });
});

quickScanRouter.post('/prospects/:id/delivery', (req: FounderRequest, res) => {
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');
  const body = record(req.body);
  try {
    recordDelivery(prospect, text(body.loomUrl), req.founder?.email ?? 'founder');
    saveQuickScanProspect(prospect);
    return res.json({ ok: true, prospect });
  } catch (error) {
    return fail(res, 409, 'DELIVERY_BLOCKED', error instanceof Error ? error.message : 'delivery blocked');
  }
});

/**
 * POST /prospects/:id/chief-recommendation
 *
 * Founder-triggered only: nothing calls Chief automatically. Reasons from
 * this prospect's own recorded evidence/segment/qualification/stage — never
 * anything the founder did not themselves observe and record — and returns
 * exactly one next action. When that action is one a founder can approve to
 * send (approve_outreach, send_payment_link, prepare_delivery) and Chief
 * drafted a message, this also proposes a PENDING approval the founder
 * still has to APPROVE/EDIT/SKIP through the existing approval routes;
 * Chief never sends anything itself.
 *
 * Sending this prospect's evidence notes and qualification text to OpenAI
 * is a real trust-boundary crossing ("founder-observed" is not by itself a
 * privacy classification), so the request must explicitly acknowledge it
 * via `acknowledgeDataSharing: true` — a UI confirm() alone is bypassable
 * by any direct caller and proves nothing; this makes the gate structural.
 *
 * Refuses (409 QUICKSCAN_CHIEF_INPUT_CHANGED) rather than applying the
 * recommendation if evidence, qualification, or lifecycle state changed
 * while the provider call was in flight — the recommendation would
 * otherwise be attached to input the model never actually reasoned about.
 * A prior undecided Chief-proposed approval is always superseded (SKIP)
 * before a new one is proposed, even when this recommendation is not
 * itself send-worthy, so the founder never sees more than one live draft.
 */
quickScanRouter.post('/prospects/:id/chief-recommendation', async (req: FounderRequest, res) => {
  const initial = getQuickScanProspect(req.params.id);
  if (!initial) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');

  const body = record(req.body);
  if (body.acknowledgeDataSharing !== true) {
    return fail(res, 400, 'DATA_SHARING_ACKNOWLEDGEMENT_REQUIRED', 'this prospect\'s business name, owner name, segment, evidence notes, and qualification text will be sent to the configured OpenAI-backed Chief provider; acknowledgeDataSharing: true is required to proceed');
  }

  let result: QuickScanChiefResult;
  try {
    result = await runChief({
      businessName: initial.businessName,
      ownerName: initial.ownerName ?? null,
      segment: initial.segment,
      lifecycleState: initial.lifecycleState,
      score: initial.score,
      evidence: initial.evidence,
      qualification: initial.qualification ?? null,
    });
  } catch (error) {
    const code = providerErrorCode(error);
    return fail(
      res,
      code === 'OPENAI_NOT_CONFIGURED' ? 503 : 502,
      code,
      code === 'OPENAI_NOT_CONFIGURED' ? 'QuickScan Chief model provider is not configured' : 'QuickScan Chief model provider failed',
    );
  }

  // Re-read: the provider call above can take seconds, and another request
  // (a Stripe webhook, an approval decision, new evidence) may have mutated
  // this prospect while it was in flight. Applying Chief's result to the
  // pre-await clone would silently overwrite that newer state on save.
  const prospect = getQuickScanProspect(req.params.id);
  if (!prospect) return fail(res, 404, 'PROSPECT_NOT_FOUND', 'prospect not found');

  // The re-read above only stops us from reverting a concurrent mutation —
  // it does not stop us from applying a recommendation Chief reasoned out
  // against a snapshot that no longer matches. If evidence, qualification,
  // or lifecycle state changed while the provider call was in flight, the
  // recommendation (and any evidenceIds an approval would bind to) may
  // reflect input the model never saw. Refuse and let the caller retry
  // against current state rather than silently misattributing the basis.
  const snapshotChanged =
    prospect.lifecycleState !== initial.lifecycleState ||
    JSON.stringify(prospect.evidence) !== JSON.stringify(initial.evidence) ||
    JSON.stringify(prospect.qualification ?? null) !== JSON.stringify(initial.qualification ?? null);
  if (snapshotChanged) {
    return fail(res, 409, 'QUICKSCAN_CHIEF_INPUT_CHANGED', 'this prospect\'s evidence, qualification, or lifecycle state changed while Chief was reasoning about it; retry the recommendation against current state');
  }

  try {
    setChiefRecommendation(prospect, result.recommendation, QUICKSCAN_CHIEF_WORKFLOW, 'chief');
  } catch (error) {
    return fail(res, 502, 'QUICKSCAN_CHIEF_PROVENANCE_MISMATCH', error instanceof Error ? error.message : 'Chief recommendation provenance mismatch');
  }
  prospect.audit.push({
    id: `audit_${Date.now()}`,
    type: 'chief.recommendation.provenance',
    message: `provider=${result.provenance.provider} model=${result.provenance.model} response=${result.provenance.responseId ?? 'none'} promptVersion=${result.provenance.promptVersion}`,
    actor: 'chief',
    createdAt: new Date().toISOString(),
  });

  // A prior Chief-proposed approval could still be sitting PENDING (the
  // founder never decided it, or triggered another recommendation before
  // deciding the first). The console only ever shows one pending approval,
  // so an undecided older one would become an invisible stale draft the
  // founder could still act on later — even when this newer recommendation
  // isn't itself send-worthy (e.g. Chief now says capture_more_evidence).
  // Supersede unconditionally, before deciding whether to propose anew.
  for (const existing of prospect.approvals) {
    if (existing.decision === 'PENDING' && existing.recommendedBy === 'chief') {
      decideApproval(prospect, existing.id, 'SKIP', 'chief');
    }
  }

  let approval: QuickScanApproval | null = null;
  const approvalAction = CHIEF_ACTION_TO_APPROVAL[result.recommendation.nextAction];
  if (approvalAction && result.recommendation.messageDraft) {
    approval = proposeApproval(prospect, {
      action: approvalAction,
      proposedAction: result.recommendation.messageDraft,
      reason: result.recommendation.summary,
      evidenceIds: prospect.evidence.map((item) => item.id),
      recommendedBy: 'chief',
    });
  }

  saveQuickScanProspect(prospect);
  return res.json({ ok: true, prospect, approval });
});

  return quickScanRouter;
}

export const quickScanRouter = createQuickScanRouter();
