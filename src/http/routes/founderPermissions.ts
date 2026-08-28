import { Router } from 'express';
import { readFounderSession } from '../../auth/founderSession.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  createFounderPermissionRequest,
  FOUNDER_PERMISSION_REQUEST_CONTRACT,
  FOUNDER_PERMISSION_STATUSES,
  resolveFounderPermissionRequest,
  type FounderPermissionRequest,
  type FounderPermissionStatus,
} from '../../lib/founderPermissionBroker.js';
import {
  FOUNDER_CONTROL_SURFACES,
  type FounderControlDecisionValue,
  type FounderControlProposalBinding,
  type FounderControlSurface,
} from '../../lib/founderControlDecision.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { rateLimitGeneral } from '../middleware/security.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function proposalFrom(value: unknown): FounderControlProposalBinding | null {
  if (!isRecord(value)) return null;
  return {
    proposalId: text(value.proposalId), proposalHash: text(value.proposalHash), projectSlug: text(value.projectSlug),
    actionType: text(value.actionType), expectedHeadSha: text(value.expectedHeadSha) || null,
    capabilityPlanHash: text(value.capabilityPlanHash) || null,
  };
}
function surfaceFrom(value: unknown): FounderControlSurface | null {
  const candidate = text(value) as FounderControlSurface;
  return FOUNDER_CONTROL_SURFACES.includes(candidate) ? candidate : null;
}
function decisionFrom(value: unknown): FounderControlDecisionValue | null {
  const candidate = text(value) as FounderControlDecisionValue;
  return ['approved', 'rejected', 'change_requested'].includes(candidate) ? candidate : null;
}
function statusFrom(value: unknown): FounderPermissionStatus | null {
  const candidate = text(value) as FounderPermissionStatus;
  return FOUNDER_PERMISSION_STATUSES.includes(candidate) ? candidate : null;
}
function rowRequest(row: JsonRecord): FounderPermissionRequest | null {
  const requestedBySurface = surfaceFrom(row.requested_by_surface);
  const proposal = proposalFrom(row.proposal);
  if (!requestedBySurface || !proposal) return null;
  const requestId = text(row.request_id);
  const requestHash = text(row.request_hash).toLowerCase();
  if (!requestId || !requestHash) return null;
  return { contract: FOUNDER_PERMISSION_REQUEST_CONTRACT, requestId, requestedBySurface, proposal, requestHash, note: text(row.note) || null };
}
function projection(row: JsonRecord) {
  const status = statusFrom(row.status) ?? 'pending';
  return {
    requestId: text(row.request_id), status, requestedBySurface: surfaceFrom(row.requested_by_surface),
    requestHash: text(row.request_hash) || null, proposal: isRecord(row.proposal) ? row.proposal : null,
    note: text(row.note) || null, decision: isRecord(row.decision) ? row.decision : null,
    decisionHash: text(row.decision_hash) || null, decisionSurface: surfaceFrom(row.decision_surface),
    requestedAt: text(row.requested_at) || null, decidedAt: text(row.decided_at) || null,
    consumedAt: text(row.consumed_at) || null, founderPermissionSatisfied: status === 'approved',
    independentReviewSatisfied: null,
  };
}

export const founderPermissionsRouter = Router();
founderPermissionsRouter.use(rateLimitGeneral, requireFounder);

founderPermissionsRouter.get('/requests', async (req: FounderRequest, res) => {
  const requestedStatus = req.query.status === undefined ? null : statusFrom(req.query.status);
  if (req.query.status !== undefined && !requestedStatus) return res.status(400).json({ error: 'unsupported founder permission status' });
  let query = supabase.from('founder_permission_requests')
    .select('request_id,requested_by_surface,request_hash,proposal,note,status,decision,decision_hash,decision_surface,requested_at,decided_at,consumed_at')
    .order('requested_at', { ascending: false }).limit(100);
  if (requestedStatus) query = query.eq('status', requestedStatus);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Unable to list founder permission requests.' });
  return res.json({ requests: (data ?? []).map((row) => projection(row as JsonRecord)) });
});

founderPermissionsRouter.get('/requests/:requestId', async (req: FounderRequest, res) => {
  const requestId = text(req.params.requestId);
  if (!requestId) return res.status(400).json({ error: 'requestId is required' });
  const { data, error } = await supabase.from('founder_permission_requests')
    .select('request_id,requested_by_surface,request_hash,proposal,note,status,decision,decision_hash,decision_surface,requested_at,decided_at,consumed_at')
    .eq('request_id', requestId).maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to read founder permission request.' });
  if (!data) return res.status(404).json({ error: 'Founder permission request not found.' });
  return res.json(projection(data as JsonRecord));
});

founderPermissionsRouter.post('/requests', async (req: FounderRequest, res) => {
  const body = isRecord(req.body) ? req.body : null;
  const requestedBySurface = surfaceFrom(body?.requestedBySurface);
  const proposal = proposalFrom(body?.proposal);
  if (!body || !requestedBySurface || !proposal) return res.status(400).json({ error: 'requestId, requestedBySurface, and proposal are required.' });
  let permissionRequest: FounderPermissionRequest;
  try {
    permissionRequest = createFounderPermissionRequest({ requestId: text(body.requestId), requestedBySurface, proposal, note: body.note == null ? null : text(body.note) });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
  const { data: existing, error: lookupError } = await supabase.from('founder_permission_requests')
    .select('request_id,requested_by_surface,request_hash,proposal,note,status,decision,decision_hash,decision_surface,requested_at,decided_at,consumed_at')
    .eq('request_id', permissionRequest.requestId).maybeSingle();
  if (lookupError) return res.status(500).json({ error: 'Unable to inspect founder permission request.' });
  if (existing) {
    const row = existing as JsonRecord;
    if (text(row.request_hash).toLowerCase() !== permissionRequest.requestHash) return res.status(409).json({ error: 'requestId is already bound to a different proposal.', code: 'FOUNDER_PERMISSION_SCOPE_MISMATCH' });
    return res.json({ idempotent: true, ...projection(row) });
  }
  const { data, error } = await supabase.from('founder_permission_requests').insert({
    request_id: permissionRequest.requestId, request_contract: permissionRequest.contract,
    requested_by_surface: permissionRequest.requestedBySurface, request_hash: permissionRequest.requestHash,
    proposal: permissionRequest.proposal, note: permissionRequest.note, status: 'pending',
  }).select('request_id,requested_by_surface,request_hash,proposal,note,status,decision,decision_hash,decision_surface,requested_at,decided_at,consumed_at').single();
  if (error || !data) return res.status(500).json({ error: 'Unable to persist founder permission request.' });
  return res.status(201).json(projection(data as JsonRecord));
});

founderPermissionsRouter.post('/requests/:requestId/decision', async (req: FounderRequest, res) => {
  // Bearer-authenticated agents may ask, but may not convert their own request
  // into founder authority. Until registered adapters can attest a distinct
  // founder interaction, decision writes require the signed same-origin FCR
  // browser session cookie.
  if (!readFounderSession(req)) {
    return res.status(403).json({
      error: 'Interactive founder approval is required to decide a permission request.',
      code: 'FOUNDER_INTERACTIVE_APPROVAL_REQUIRED',
    });
  }

  const requestId = text(req.params.requestId);
  const body = isRecord(req.body) ? req.body : null;
  const decision = decisionFrom(body?.decision);
  const decisionSurface = surfaceFrom(body?.surface);
  if (!requestId || !body || !decision || !decisionSurface) return res.status(400).json({ error: 'requestId, decision, and supported surface are required.' });
  const { data: existing, error: lookupError } = await supabase.from('founder_permission_requests')
    .select('request_id,requested_by_surface,request_hash,proposal,note,status,decision,decision_hash,decision_surface,requested_at,decided_at,consumed_at')
    .eq('request_id', requestId).maybeSingle();
  if (lookupError) return res.status(500).json({ error: 'Unable to inspect founder permission request.' });
  if (!existing) return res.status(404).json({ error: 'Founder permission request not found.' });
  const row = existing as JsonRecord;
  const permissionRequest = rowRequest(row);
  if (!permissionRequest) return res.status(409).json({ error: 'Stored founder permission request is malformed.', code: 'FOUNDER_PERMISSION_STORED_SCOPE_INVALID' });
  let resolution;
  try { resolution = resolveFounderPermissionRequest({ request: permissionRequest, decisionSurface, decision }); }
  catch (error) { return res.status(409).json({ error: error instanceof Error ? error.message : String(error), code: 'FOUNDER_PERMISSION_REQUEST_INVALID' }); }
  const currentStatus = statusFrom(row.status) ?? 'pending';
  if (currentStatus !== 'pending') {
    if (currentStatus === resolution.status && text(row.decision_hash).toLowerCase() === resolution.decision.decisionHash) return res.json({ idempotent: true, ...projection(row) });
    return res.status(409).json({ error: 'Founder permission request was already decided.', code: 'FOUNDER_PERMISSION_ALREADY_DECIDED' });
  }
  const decidedAt = new Date().toISOString();
  const { data, error } = await supabase.from('founder_permission_requests').update({
    status: resolution.status, decision: resolution.decision, decision_hash: resolution.decision.decisionHash,
    decision_surface: resolution.decision.surface, founder_user_id: req.founder!.userId,
    founder_email: req.founder!.email, decided_at: decidedAt,
  }).eq('request_id', requestId).eq('status', 'pending')
    .select('request_id,requested_by_surface,request_hash,proposal,note,status,decision,decision_hash,decision_surface,requested_at,decided_at,consumed_at').maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to persist founder decision.' });
  if (!data) return res.status(409).json({ error: 'Founder permission request changed before decision could be recorded.', code: 'FOUNDER_PERMISSION_DECISION_RACE' });
  return res.json(projection(data as JsonRecord));
});
