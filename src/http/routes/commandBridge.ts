import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { getTerminalCommand } from '../../terminal/registry.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const commandBridgeRouter = Router();
commandBridgeRouter.use(requireFounder);

type DbRecord = Record<string, unknown>;

const HEAD_SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_COMMAND_CARD_MS = 24 * 60 * 60 * 1000;
const SECRETISH_PATTERN = /(github_pat_|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|TOKEN|SECRET|PASSWORD|SERVICE_ROLE|API_KEY|ACCESS_KEY)/i;

const COMMAND_BRIDGE_CONTRACT = Object.freeze({
  id: 'founder-command-bridge',
  version: '1.0.0',
  label: 'Founder Command Bridge',
  purpose: 'Agents may request command power, but the founder keeps direction and approval.',
  enforcementNote:
    'Command Bridge creates and audits command cards. Execution still goes through the guarded terminal runner and its command registry; this route is not a shell tunnel.',
  principles: Object.freeze([
    'Agents request; the founder approves, rejects, or revises.',
    'Every command card names a project, mission, command id, expected commit SHA, reason, rollback path, and expiry.',
    'A command card cannot approve commands outside the guarded terminal registry.',
    'No credential values may appear in command cards, logs, reasons, rollback notes, or metadata.',
    'Approval of a command card does not authorize deployment, billing, credentials, deletion, or external communications.',
  ]),
});

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function recordOrNull(value: unknown): DbRecord | null {
  return value && typeof value === 'object' ? value as DbRecord : null;
}

function relatedRecord(value: unknown): DbRecord | null {
  if (Array.isArray(value)) return recordOrNull(value[0]);
  return recordOrNull(value);
}

function secretLike(value: string | null): boolean {
  return value ? SECRETISH_PATTERN.test(value) : false;
}

function expiresAtFromBody(body: DbRecord): string | null {
  const now = Date.now();
  const expiresAt = stringOrNull(body.expiresAt);
  if (expiresAt) {
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed) || parsed <= now || parsed - now > MAX_COMMAND_CARD_MS) return null;
    return new Date(parsed).toISOString();
  }

  const rawDuration = body.durationHours;
  const durationHours = rawDuration === undefined ? 4 : Number(rawDuration);
  if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 24) return null;
  return new Date(now + durationHours * 60 * 60 * 1000).toISOString();
}

function normalizeCard(row: DbRecord): DbRecord {
  const project = relatedRecord(row.projects);
  const mission = relatedRecord(row.missions);
  return {
    id: stringOrNull(row.id),
    projectId: stringOrNull(row.project_id),
    projectSlug: stringOrNull(project?.slug),
    projectName: stringOrNull(project?.name),
    missionId: stringOrNull(row.mission_id),
    missionTitle: stringOrNull(mission?.title),
    commandId: stringOrNull(row.command_id),
    commandLabel: stringOrNull(row.command_label),
    commandRisk: stringOrNull(row.command_risk),
    expectedCommitSha: stringOrNull(row.expected_commit_sha),
    requestedByAgent: stringOrNull(row.requested_by_agent),
    requestedByFounder: stringOrNull(row.requested_by_founder),
    rationale: stringOrNull(row.rationale),
    rollbackPlan: stringOrNull(row.rollback_plan),
    evidenceRequired: Array.isArray(row.evidence_required) ? row.evidence_required : [],
    status: stringOrNull(row.status),
    founderDecisionBy: stringOrNull(row.founder_decision_by),
    founderDecisionAt: stringOrNull(row.founder_decision_at),
    founderDecisionNote: stringOrNull(row.founder_decision_note),
    expiresAt: stringOrNull(row.expires_at),
    createdAt: stringOrNull(row.created_at),
    updatedAt: stringOrNull(row.updated_at),
  };
}

async function audit(projectId: string, eventType: string, severity: 'info' | 'warning', metadata: DbRecord): Promise<string | null> {
  const { error } = await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: randomUUID(),
    event_type: eventType,
    severity,
    screen: 'command-bridge-api',
    metadata,
  });
  return error ? error.message : null;
}

commandBridgeRouter.get('/', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('command_bridge_requests')
    .select('id, project_id, mission_id, command_id, command_label, command_risk, expected_commit_sha, requested_by_agent, requested_by_founder, rationale, rollback_plan, evidence_required, status, founder_decision_by, founder_decision_at, founder_decision_note, expires_at, created_at, updated_at, projects(id, slug, name), missions(id, title)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  const cards = (data ?? []).map((row) => normalizeCard(row as DbRecord));
  return res.json({
    contract: COMMAND_BRIDGE_CONTRACT,
    summary: {
      total: cards.length,
      pending: cards.filter((card) => card.status === 'pending').length,
      approved: cards.filter((card) => card.status === 'approved').length,
      rejected: cards.filter((card) => card.status === 'rejected').length,
      expired: cards.filter((card) => card.expiresAt && Date.parse(String(card.expiresAt)) <= Date.now()).length,
    },
    cards,
  });
});

commandBridgeRouter.post('/requests', async (req: FounderRequest, res) => {
  const body = req.body as DbRecord;
  const projectSlug = stringOrNull(body.projectSlug);
  const missionId = stringOrNull(body.missionId);
  const commandId = stringOrNull(body.commandId);
  const expectedCommitSha = stringOrNull(body.expectedCommitSha)?.toLowerCase() ?? null;
  const requestedByAgent = stringOrNull(body.requestedByAgent) ?? 'unspecified-agent';
  const rationale = stringOrNull(body.rationale);
  const rollbackPlan = stringOrNull(body.rollbackPlan);
  const expiresAt = expiresAtFromBody(body);
  const evidenceRequired = Array.isArray(body.evidenceRequired) && body.evidenceRequired.every((item) => typeof item === 'string')
    ? body.evidenceRequired
    : [];

  if (!projectSlug || !missionId || !commandId || !expectedCommitSha) {
    return res.status(400).json({ error: 'projectSlug, missionId, commandId, and expectedCommitSha are required.' });
  }
  if (!HEAD_SHA_PATTERN.test(expectedCommitSha)) {
    return res.status(400).json({ error: 'expectedCommitSha must be a full 40-character Git commit SHA.', code: 'INVALID_HEAD_SHA' });
  }
  if (!rationale || !rollbackPlan) {
    return res.status(400).json({ error: 'rationale and rollbackPlan are required.' });
  }
  if (!expiresAt) {
    return res.status(400).json({ error: 'expiresAt or durationHours must be greater than now and no more than 24 hours.' });
  }
  if ([requestedByAgent, rationale, rollbackPlan, ...evidenceRequired].some(secretLike)) {
    return res.status(400).json({ error: 'Command cards must not contain credential-like material.' });
  }

  const command = getTerminalCommand(projectSlug, commandId);
  if (!command) {
    return res.status(400).json({ error: `Command "${commandId}" is not approved for project "${projectSlug}".`, code: 'UNKNOWN_COMMAND' });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, slug, name, verification_enabled')
    .eq('slug', projectSlug)
    .maybeSingle();
  if (projectError) return res.status(500).json({ error: projectError.message });
  const projectRow = recordOrNull(project);
  if (!projectRow) return res.status(404).json({ error: `Unknown project: ${projectSlug}` });
  if (projectRow.verification_enabled !== true) {
    return res.status(409).json({ error: 'Verification is disabled for this project.', code: 'PROJECT_VERIFICATION_DISABLED' });
  }

  const projectId = stringOrNull(projectRow.id);
  if (!projectId) return res.status(500).json({ error: 'Project row is missing id.' });

  const { data: mission, error: missionError } = await supabase
    .from('missions')
    .select('id, project_id, title, status, policy_snapshot')
    .eq('id', missionId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (missionError) return res.status(500).json({ error: missionError.message });
  const missionRow = recordOrNull(mission);
  if (!missionRow) return res.status(404).json({ error: 'Mission not found for this project.' });

  const policy = recordOrNull(missionRow.policy_snapshot);
  const missionExpectedHeadSha = stringOrNull(policy?.expectedHeadSha)?.toLowerCase() ?? null;
  if (!missionExpectedHeadSha || missionExpectedHeadSha !== expectedCommitSha) {
    return res.status(409).json({
      error: 'The requested commit does not match the mission policy snapshot.',
      code: 'MISSION_HEAD_MISMATCH',
      missionExpectedHeadSha,
      requestedHeadSha: expectedCommitSha,
    });
  }

  const allowedStatuses = command.risk === 'write' ? new Set(['sandboxed']) : new Set(['sandboxed', 'in_review']);
  if (!allowedStatuses.has(String(missionRow.status))) {
    return res.status(409).json({
      error: `Command risk '${command.risk}' is not allowed while mission is '${String(missionRow.status)}'.`,
      code: 'COMMAND_NOT_ALLOWED_IN_MISSION_STATE',
      allowedStatuses: [...allowedStatuses],
    });
  }

  const { data: card, error } = await supabase
    .from('command_bridge_requests')
    .insert({
      project_id: projectId,
      mission_id: missionId,
      command_id: command.id,
      command_label: command.label,
      command_risk: command.risk,
      expected_commit_sha: expectedCommitSha,
      requested_by_agent: requestedByAgent,
      requested_by_founder: req.founder?.email ?? null,
      rationale,
      rollback_plan: rollbackPlan,
      evidence_required: evidenceRequired,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const cardRow = recordOrNull(card);
  const cardId = stringOrNull(cardRow?.id);
  const auditError = await audit(projectId, 'command_bridge_request_created', 'warning', {
    route: 'POST /command-bridge/requests',
    cardId,
    projectSlug,
    missionId,
    commandId,
    commandRisk: command.risk,
    expectedCommitSha,
    requestedByAgent,
    requestedByFounder: req.founder?.email,
    expiresAt,
  });
  if (auditError) return res.status(500).json({ error: 'COMMAND_BRIDGE_AUDIT_INCOMPLETE', detail: auditError });

  return res.status(201).json({ card });
});

async function decideCard(req: FounderRequest, res: Parameters<Parameters<typeof commandBridgeRouter.post>[1]>[1], decision: 'approved' | 'rejected') {
  const { requestId } = req.params as { requestId: string };
  const body = req.body as DbRecord;
  const note = stringOrNull(body.note);
  if (secretLike(note)) return res.status(400).json({ error: 'Decision notes must not contain credential-like material.' });

  const { data: existing, error: readError } = await supabase
    .from('command_bridge_requests')
    .select('id, project_id, status, expires_at')
    .eq('id', requestId)
    .maybeSingle();
  if (readError) return res.status(500).json({ error: readError.message });
  const existingRow = recordOrNull(existing);
  if (!existingRow) return res.status(404).json({ error: 'Command card not found.' });
  if (existingRow.status !== 'pending') {
    return res.status(409).json({ error: `Only pending command cards can be ${decision}.`, code: 'COMMAND_CARD_NOT_PENDING' });
  }
  const expiresAt = stringOrNull(existingRow.expires_at);
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    await supabase.from('command_bridge_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', requestId);
    return res.status(409).json({ error: 'Command card expired before founder decision.', code: 'COMMAND_CARD_EXPIRED' });
  }

  const decidedAt = new Date().toISOString();
  const { data: card, error } = await supabase
    .from('command_bridge_requests')
    .update({
      status: decision,
      founder_decision_by: req.founder?.email ?? 'founder',
      founder_decision_at: decidedAt,
      founder_decision_note: note,
      updated_at: decidedAt,
    })
    .eq('id', requestId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const projectId = stringOrNull(existingRow.project_id);
  if (!projectId) return res.status(500).json({ error: 'Command card is missing project_id.' });
  const auditError = await audit(projectId, `command_bridge_request_${decision}`, decision === 'approved' ? 'warning' : 'info', {
    route: `POST /command-bridge/requests/${requestId}/${decision === 'approved' ? 'approve' : 'reject'}`,
    cardId: requestId,
    decidedBy: req.founder?.email,
    decidedAt,
    note,
  });
  if (auditError) return res.status(500).json({ error: 'COMMAND_BRIDGE_DECISION_AUDIT_INCOMPLETE', detail: auditError });

  return res.json({ card });
}

commandBridgeRouter.post('/requests/:requestId/approve', async (req: FounderRequest, res) => decideCard(req, res, 'approved'));
commandBridgeRouter.post('/requests/:requestId/reject', async (req: FounderRequest, res) => decideCard(req, res, 'rejected'));
