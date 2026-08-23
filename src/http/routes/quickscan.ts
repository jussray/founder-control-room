import { Router, type Response } from 'express';
import {
  QUICKSCAN_CONTRACT,
  QUICKSCAN_PRICE_CENTS,
  type QuickScanEvidenceCategory,
  type QuickScanLifecycleState,
  type QuickScanSegment,
} from '../../quickscan/contracts.js';
import {
  addEvidence,
  advanceProspect,
  createOverrideReceipt,
  createProspect,
  decideApproval,
  proposeApproval,
  qualificationIsValid,
  recordQualification,
} from '../../quickscan/engine.js';
import { getQuickScanProspect, listQuickScanProspects, saveQuickScanProspect } from '../../quickscan/store.js';
import { buildTrackedStripePaymentLinkUrl } from '../../quickscan/stripeWebhook.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const quickScanRouter = Router();
quickScanRouter.use(requireFounder);

function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function fail(res: Response, status: number, code: string, message: string) { return res.status(status).json({ ok: false, code, message, contract: QUICKSCAN_CONTRACT }); }

const SEGMENTS = new Set<QuickScanSegment>(['high_volume_solo_operator','salon_studio_team_owner','beauty_educator','wig_custom_order_business','high_ticket_beauty_wellness_operator']);
const EVIDENCE = new Set<QuickScanEvidenceCategory>(['visible_friction','active_demand','owner_reachable','repeat_high_value_service','operational_complexity','urgency']);

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
