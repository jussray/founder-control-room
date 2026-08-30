import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import {
  createFounderPermissionRequest,
  FOUNDER_PERMISSION_STATUSES,
  resolveFounderPermissionRequest,
  type FounderPermissionActionTarget,
  type FounderPermissionRequest,
  type FounderPermissionStatus,
} from '../../lib/founderPermissionBroker.js';
import { storedFounderPermissionDecisionMatches } from '../../lib/founderPermissionStoredDecision.js';
import {
  FOUNDER_CONTROL_SURFACES,
  type FounderControlDecisionValue,
  type FounderControlProposalBinding,
  type FounderControlSurface,
} from '../../lib/founderControlDecision.js';
import {
  requireFounder,
  requireInteractiveFounder,
  type FounderRequest,
} from '../middleware/requireFounder.js';
import { rateLimitFounderPermissions } from '../middleware/security.js';

type JsonRecord = Record<string, unknown>;

const FOUNDER_DECISION_TTL_MS = 20 * 60 * 1000;
const REQUEST_SELECT = [
  'request_id',
  'requested_by_surface',
  'request_hash',
  'proposal',
  'action_target',
  'note',
  'status',
  'decision',
  'decision_hash',
  'decision_surface',
  'requested_at',
  'decided_at',
  'expires_at',
  'revoked_at',
  'consumed_at',
].join(',');

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function asJsonRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
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
function actionTargetFrom(value: unknown): FounderPermissionActionTarget {
  if (value == null) return null;
  if (!isRecord(value) || text(value.type) !== 'merge') return null;
  return {
    type: 'merge',
    repo: text(value.repo),
    pullRequestNumber: Number(value.pullRequestNumber),
    baseSha: text(value.baseSha),
    headSha: text(value.headSha),
  };
}
function errorCode(value: unknown): string {
  return isRecord(value) ? text(value.code) : '';
}
function interactiveBrowserContextPresent(req: FounderRequest): boolean {
  // `corsMiddleware` runs before this router and rejects any Origin outside
  // FOUNDER_ALLOWED_ORIGINS. Requiring an Origin here prevents bearer-auth
  // requests from borrowing a founder cookie while preserving split-origin
  // deployments where the approved frontend origin differs from the API URL.
  return Boolean(req.get('Origin'));
}
function rowRequest(row: JsonRecord): FounderPermissionRequest | null {
  const requestedBySurface = surfaceFrom(row.requested_by_surface);
  const proposal = proposalFrom(row.proposal);
  if (!requestedBySurface || !proposal) return null;
  const requestId = text(row.request_id);
  const requestHash = text(row.request_hash).toLowerCase();
  if (!requestId || !requestHash) return null;
  try {
    const normalized = createFounderPermissionRequest({
      requestId,
      requestedBySurface,
      proposal,
      actionTarget: actionTargetFrom(row.action_target),
      note: text(row.note) || null,
    });
    return normalized.requestHash === requestHash ? normalized : null;
  } catch {
    return null;
  }
}
function projection(row: JsonRecord, now = new Date()) {
  const status = statusFrom(row.status) ?? 'pending';
  const expiresAt = text(row.expires_at) || null;
  const revokedAt = text(row.revoked_at) || null;
  const consumedAt = text(row.consumed_at) || null;
  const decisionSurface = surfaceFrom(row.decision_surface);
  const expiryMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const exactStoredRequest = rowRequest(row);
  const exactStoredDecision = exactStoredRequest !== null
    && storedFounderPermissionDecisionMatches(exactStoredRequest, {
      status,
      decision: row.decision,
      decisionHash: row.decision_hash,
      decisionSurface: row.decision_surface,
    });
  const approvedFreshUnconsumed = status === 'approved'
    && decisionSurface === 'fcr'
    && exactStoredRequest !== null
    && exactStoredDecision
    && Number.isFinite(expiryMs)
    && expiryMs > now.getTime()
    && !revokedAt
    && !consumedAt;
  const rawDecision = isRecord(row.decision) ? row.decision : null;
  const decision = rawDecision ? { ...rawDecision, executionAuthorized: false } : null;

  return {
    requestId: text(row.request_id), status, requestedBySurface: surfaceFrom(row.requested_by_surface),
    requestHash: text(row.request_hash) || null, proposal: isRecord(row.proposal) ? row.proposal : null,
    actionTarget: actionTargetFrom(row.action_target), note: text(row.note) || null,
    decision, decisionHash: text(row.decision_hash) || null, decisionSurface,
    requestedAt: text(row.requested_at) || null, decidedAt: text(row.decided_at) || null,
    expiresAt, revokedAt, consumedAt,
    founderPermissionSatisfied: approvedFreshUnconsumed,
    executionAuthorized: false,
    independentReviewSatisfied: null,
  };
}

async function readRequestRow(requestId: string): Promise<{ row: JsonRecord | null; error: unknown }> {
  const { data, error } = await supabase.from('founder_permission_requests')
    .select(REQUEST_SELECT)
    .eq('request_id', requestId).maybeSingle();
  return { row: data ? asJsonRecord(data) : null, error };
}

export const founderPermissionsRouter = Router();

founderPermissionsRouter.get('/requests', rateLimitFounderPermissions, requireFounder, async (req: FounderRequest, res) => {
  const requestedStatus = req.query.status === undefined ? null : statusFrom(req.query.status);
  if (req.query.status !== undefined && !requestedStatus) return res.status(400).json({ error: 'unsupported founder permission status' });
  let query = supabase.from('founder_permission_requests')
    .select(REQUEST_SELECT)
    .order('requested_at', { ascending: false }).limit(100);
  if (requestedStatus) query = query.eq('status', requestedStatus);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Unable to list founder permission requests.' });
  return res.json({ requests: (data ?? []).map((row) => projection(asJsonRecord(row))) });
});

founderPermissionsRouter.get('/requests/:requestId', rateLimitFounderPermissions, requireFounder, async (req: FounderRequest, res) => {
  const requestId = text(req.params.requestId);
  if (!requestId) return res.status(400).json({ error: 'requestId is required' });
  const { row, error } = await readRequestRow(requestId);
  if (error) return res.status(500).json({ error: 'Unable to read founder permission request.' });
  if (!row) return res.status(404).json({ error: 'Founder permission request not found.' });
  return res.json(projection(row));
});

founderPermissionsRouter.post('/requests', rateLimitFounderPermissions, requireFounder, async (req: FounderRequest, res) => {
  const body = isRecord(req.body) ? req.body : null;
  const requestedBySurface = surfaceFrom(body?.requestedBySurface);
  const proposal = proposalFrom(body?.proposal);
  if (!body || !requestedBySurface || !proposal) return res.status(400).json({ error: 'requestId, requestedBySurface, and proposal are required.' });
  let permissionRequest: FounderPermissionRequest;
  try {
    permissionRequest = createFounderPermissionRequest({
      requestId: text(body.requestId),
      requestedBySurface,
      proposal,
      actionTarget: actionTargetFrom(body.actionTarget),
      note: body.note == null ? null : text(body.note),
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
  const { row: existing, error: lookupError } = await readRequestRow(permissionRequest.requestId);
  if (lookupError) return res.status(500).json({ error: 'Unable to inspect founder permission request.' });
  if (existing) {
    if (text(existing.request_hash).toLowerCase() !== permissionRequest.requestHash) return res.status(409).json({ error: 'requestId is already bound to a different proposal.', code: 'FOUNDER_PERMISSION_SCOPE_MISMATCH' });
    return res.json({ idempotent: true, ...projection(existing) });
  }
  const { data, error } = await supabase.from('founder_permission_requests').insert({
    request_id: permissionRequest.requestId, request_contract: permissionRequest.contract,
    requested_by_surface: permissionRequest.requestedBySurface, request_hash: permissionRequest.requestHash,
    proposal: permissionRequest.proposal, action_target: permissionRequest.actionTarget,
    note: permissionRequest.note, status: 'pending',
  }).select(REQUEST_SELECT).single();
  if (error || !data) {
    if (errorCode(error) === '23505') {
      const { row: winner, error: rereadError } = await readRequestRow(permissionRequest.requestId);
      if (rereadError) return res.status(500).json({ error: 'Unable to reconcile founder permission request retry.' });
      if (winner && text(winner.request_hash).toLowerCase() === permissionRequest.requestHash) {
        return res.json({ idempotent: true, ...projection(winner) });
      }
      if (winner) return res.status(409).json({ error: 'requestId is already bound to a different proposal.', code: 'FOUNDER_PERMISSION_SCOPE_MISMATCH' });
    }
    return res.status(500).json({ error: 'Unable to persist founder permission request.' });
  }
  return res.status(201).json(projection(asJsonRecord(data)));
});

founderPermissionsRouter.post('/requests/:requestId/decision', rateLimitFounderPermissions, requireInteractiveFounder, async (req: FounderRequest, res) => {
  if (!interactiveBrowserContextPresent(req)) {
    return res.status(403).json({
      error: 'An approved browser Origin and interactive founder session are required to decide a permission request.',
      code: 'FOUNDER_INTERACTIVE_APPROVAL_REQUIRED',
    });
  }

  const requestId = text(req.params.requestId);
  const body = isRecord(req.body) ? req.body : null;
  const decision = decisionFrom(body?.decision);
  if (!requestId || !body || !decision) return res.status(400).json({ error: 'requestId and decision are required.' });
  if (body.surface !== undefined && surfaceFrom(body.surface) !== 'fcr') {
    return res.status(400).json({
      error: 'Decision provenance is server-derived as fcr until a registered adapter attests another surface.',
      code: 'FOUNDER_PERMISSION_UNATTESTED_DECISION_SURFACE',
    });
  }

  const { row, error: lookupError } = await readRequestRow(requestId);
  if (lookupError) return res.status(500).json({ error: 'Unable to inspect founder permission request.' });
  if (!row) return res.status(404).json({ error: 'Founder permission request not found.' });
  const permissionRequest = rowRequest(row);
  if (!permissionRequest) return res.status(409).json({ error: 'Stored founder permission request is malformed.', code: 'FOUNDER_PERMISSION_STORED_SCOPE_INVALID' });
  let resolution;
  try { resolution = resolveFounderPermissionRequest({ request: permissionRequest, decision }); }
  catch (error) { return res.status(409).json({ error: error instanceof Error ? error.message : String(error), code: 'FOUNDER_PERMISSION_REQUEST_INVALID' }); }
  const currentStatus = statusFrom(row.status) ?? 'pending';
  if (currentStatus !== 'pending') {
    if (currentStatus === resolution.status
      && text(row.decision_hash).toLowerCase() === resolution.decision.decisionHash
      && surfaceFrom(row.decision_surface) === 'fcr') {
      return res.json({ idempotent: true, ...projection(row) });
    }
    return res.status(409).json({ error: 'Founder permission request was already decided.', code: 'FOUNDER_PERMISSION_ALREADY_DECIDED' });
  }
  const decidedAt = new Date();
  const expiresAt = new Date(decidedAt.getTime() + FOUNDER_DECISION_TTL_MS);
  const { data, error } = await supabase.from('founder_permission_requests').update({
    status: resolution.status, decision: resolution.decision, decision_hash: resolution.decision.decisionHash,
    decision_surface: 'fcr', founder_user_id: req.founder!.userId,
    founder_email: req.founder!.email, decided_at: decidedAt.toISOString(),
    expires_at: expiresAt.toISOString(), revoked_at: null,
  }).eq('request_id', requestId).eq('status', 'pending')
    .select(REQUEST_SELECT).maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to persist founder decision.' });
  if (!data) return res.status(409).json({ error: 'Founder permission request changed before decision could be recorded.', code: 'FOUNDER_PERMISSION_DECISION_RACE' });
  return res.json(projection(asJsonRecord(data)));
});

founderPermissionsRouter.post('/requests/:requestId/consume', rateLimitFounderPermissions, requireFounder, async (req: FounderRequest, res) => {
  const requestId = text(req.params.requestId);
  const body = isRecord(req.body) ? req.body : null;
  const requestHash = text(body?.requestHash).toLowerCase();
  const decisionHash = text(body?.decisionHash).toLowerCase();
  if (!requestId || !requestHash || !decisionHash) {
    return res.status(400).json({ error: 'requestId, requestHash, and decisionHash are required.' });
  }

  const { row, error: lookupError } = await readRequestRow(requestId);
  if (lookupError) return res.status(500).json({ error: 'Unable to inspect founder permission request.' });
  if (!row) return res.status(404).json({ error: 'Founder permission request not found.' });
  if (text(row.request_hash).toLowerCase() !== requestHash || text(row.decision_hash).toLowerCase() !== decisionHash) {
    return res.status(409).json({ error: 'Founder permission consumption does not match the exact decision.', code: 'FOUNDER_PERMISSION_CONSUMPTION_SCOPE_MISMATCH' });
  }
  if (!projection(row).founderPermissionSatisfied) {
    return res.status(409).json({ error: 'Founder permission is not fresh and consumable.', code: 'FOUNDER_PERMISSION_NOT_CONSUMABLE' });
  }

  const consumedAt = new Date().toISOString();
  const { data, error } = await supabase.from('founder_permission_requests').update({
    consumed_at: consumedAt,
  }).eq('request_id', requestId)
    .eq('status', 'approved')
    .eq('request_hash', requestHash)
    .eq('decision_hash', decisionHash)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .gt('expires_at', consumedAt)
    .select(REQUEST_SELECT).maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to consume founder permission.' });
  if (!data) return res.status(409).json({ error: 'Founder permission changed before it could be consumed.', code: 'FOUNDER_PERMISSION_CONSUMPTION_RACE' });
  return res.json({ consumed: true, ...projection(asJsonRecord(data)) });
});

founderPermissionsRouter.post('/requests/:requestId/revoke', rateLimitFounderPermissions, requireInteractiveFounder, async (req: FounderRequest, res) => {
  if (!interactiveBrowserContextPresent(req)) {
    return res.status(403).json({
      error: 'An approved browser Origin and interactive founder session are required to revoke a permission request.',
      code: 'FOUNDER_INTERACTIVE_APPROVAL_REQUIRED',
    });
  }
  const requestId = text(req.params.requestId);
  if (!requestId) return res.status(400).json({ error: 'requestId is required.' });
  const revokedAt = new Date().toISOString();
  const { data, error } = await supabase.from('founder_permission_requests').update({ revoked_at: revokedAt })
    .eq('request_id', requestId)
    .is('revoked_at', null)
    .is('consumed_at', null)
    .select(REQUEST_SELECT).maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to revoke founder permission.' });
  if (!data) return res.status(409).json({ error: 'Founder permission is already consumed, revoked, or unavailable.', code: 'FOUNDER_PERMISSION_NOT_REVOCABLE' });
  return res.json({ revoked: true, ...projection(asJsonRecord(data)) });
});
