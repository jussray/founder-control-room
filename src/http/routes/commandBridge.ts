import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import {
  COMMAND_BRIDGE_CONTRACT,
  COMMAND_BRIDGE_MAX_REQUEST_WINDOW_MINUTES,
  commandBridgeSeverityForRisk,
  executionPayloadForRequest,
  type CommandBridgeRequestSnapshot,
  type CommandBridgeRequestStatus,
  type CommandBridgeRisk,
} from '../../lib/commandBridge.js';
import { supabase } from '../../lib/supabaseClient.js';
import { getTerminalCommand, listTerminalCommands } from '../../terminal/registry.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const commandBridgeRouter = Router();
commandBridgeRouter.use(requireFounder);

type DbRecord = Record<string, unknown>;

interface ProjectLookup {
  id: string;
  slug: string;
  name: string;
  verificationEnabled: boolean;
}

interface MissionLookup {
  id: string;
  projectId: string;
  title: string;
  status: string;
  expectedHeadSha: string | null;
}

const FULL_SHA = /^[0-9a-f]{40}$/;
const SECRETISH_PATTERN = /(github_pat_|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|TOKEN|SECRET|PASSWORD|SERVICE_ROLE|API_KEY|ACCESS_KEY)/i;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function recordOrNull(value: unknown): DbRecord | null {
  if (!value || typeof value !== 'object') return null;
  return value as DbRecord;
}

function relatedRecord(value: unknown): DbRecord | null {
  if (Array.isArray(value)) return recordOrNull(value[0]);
  return recordOrNull(value);
}

function statusOf(value: unknown): CommandBridgeRequestStatus {
  const status = stringOrNull(value);
  if (status === 'requested' || status === 'approved' || status === 'denied' || status === 'expired' || status === 'executed' || status === 'failed' || status === 'audit_incomplete') {
    return status;
  }
  return 'failed';
}

function riskOf(value: unknown): CommandBridgeRisk {
  const risk = stringOrNull(value);
  if (risk === 'read' || risk === 'verify' || risk === 'write') return risk;
  return 'verify';
}

function relationText(value: unknown, field: string): string | null {
  const row = relatedRecord(value);
  return row ? stringOrNull(row[field]) : null;
}

function normalizeRequest(row: DbRecord): CommandBridgeRequestSnapshot {
  return {
    id: stringOrNull(row.id) ?? '',
    projectId: stringOrNull(row.project_id) ?? '',
    projectSlug: relationText(row.projects, 'slug'),
    projectName: relationText(row.projects, 'name'),
    missionId: stringOrNull(row.mission_id) ?? '',
    missionTitle: relationText(row.missions, 'title'),
    missionStatus: relationText(row.missions, 'status'),
    commandId: stringOrNull(row.command_id) ?? '',
    expectedCommitSha: stringOrNull(row.expected_commit_sha) ?? '',
    requestingAgent: stringOrNull(row.requesting_agent) ?? 'unknown-agent',
    requestedBy: stringOrNull(row.requested_by) ?? 'founder',
    reason: stringOrNull(row.reason) ?? '',
    rollbackPlan: stringOrNull(row.rollback_plan),
    risk: riskOf(row.risk),
    status: statusOf(row.status),
    expiresAt: stringOrNull(row.expires_at) ?? '',
    approvedBy: stringOrNull(row.approved_by),
    approvedAt: stringOrNull(row.approved_at),
    approvalNote: stringOrNull(row.approval_note),
    terminalRunId: stringOrNull(row.terminal_run_id),
    createdAt: stringOrNull(row.created_at) ?? '',
    updatedAt: stringOrNull(row.updated_at) ?? '',
  };
}

function secretLike(...values: Array<string | null>): boolean {
  return values.some((value) => value ? SECRETISH_PATTERN.test(value) : false);
}

function expiryFromBody(body: DbRecord): string | null {
  const now = Date.now();
  const expiresAt = stringOrNull(body.expiresAt);
  const maxMs = COMMAND_BRIDGE_MAX_REQUEST_WINDOW_MINUTES * 60 * 1000;
  if (expiresAt) {
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed) || parsed <= now || parsed - now > maxMs) return null;
    return new Date(parsed).toISOString();
  }

  const rawDuration = body.durationMinutes;
  const durationMinutes = rawDuration === undefined ? 15 : Number(rawDuration);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > COMMAND_BRIDGE_MAX_REQUEST_WINDOW_MINUTES) return null;
  return new Date(now + durationMinutes * 60 * 1000).toISOString();
}

function allowedMissionStatuses(risk: CommandBridgeRisk): Set<string> {
  return risk === 'write'
    ? new Set(['sandboxed'])
    : new Set(['sandboxed', 'in_review']);
}

async function fetchProject(slug: string): Promise<{ project: ProjectLookup | null; error: string | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, verification_enabled')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { project: null, error: error.message };
  const row = recordOrNull(data);
  if (!row) return { project: null, error: null };
  const id = stringOrNull(row.id);
  const projectSlug = stringOrNull(row.slug);
  const name = stringOrNull(row.name);
  if (!id || !projectSlug || !name) return { project: null, error: 'Project row is malformed' };
  return { project: { id, slug: projectSlug, name, verificationEnabled: row.verification_enabled !== false }, error: null };
}

async function fetchMission(missionId: string, projectId: string): Promise<{ mission: MissionLookup | null; error: string | null }> {
  const { data, error } = await supabase
    .from('missions')
    .select('id, project_id, title, status, policy_snapshot')
    .eq('id', missionId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) return { mission: null, error: error.message };
  const row = recordOrNull(data);
  if (!row) return { mission: null, error: null };
  const id = stringOrNull(row.id);
  const actualProjectId = stringOrNull(row.project_id);
  const title = stringOrNull(row.title) ?? '';
  const status = stringOrNull(row.status) ?? '';
  const policySnapshot = recordOrNull(row.policy_snapshot);
  const expectedHeadSha = stringOrNull(policySnapshot?.expectedHeadSha)?.toLowerCase() ?? null;
  if (!id || !actualProjectId || !status) return { mission: null, error: 'Mission row is malformed' };
  return { mission: { id, projectId: actualProjectId, title, status, expectedHeadSha }, error: null };
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
  return error?.message ?? null;
}

commandBridgeRouter.get('/', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('command_bridge_requests')
    .select('id, project_id, mission_id, command_id, expected_commit_sha, requesting_agent, requested_by, reason, rollback_plan, risk, status, expires_at, approved_by, approved_at, approval_note, terminal_run_id, created_at, updated_at, projects(id, slug, name), missions(id, title, status)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  const requests = (data ?? []).map((row) => normalizeRequest(row as DbRecord));
  return res.json({
    contract: COMMAND_BRIDGE_CONTRACT,
    summary: {
      total: requests.length,
      requested: requests.filter((request) => request.status === 'requested').length,
      approved: requests.filter((request) => request.status === 'approved').length,
      executed: requests.filter((request) => request.status === 'executed').length,
      writeRisk: requests.filter((request) => request.risk === 'write').length,
    },
    requests,
  });
});

commandBridgeRouter.get('/:projectSlug/commands', async (req: FounderRequest, res) => {
  const { projectSlug } = req.params as { projectSlug: string };
  const commands = listTerminalCommands(projectSlug).map((command) => ({
    id: command.id,
    label: command.label,
    risk: command.risk,
    evidenceKind: command.evidenceKind ?? null,
    timeoutMs: command.timeoutMs,
  }));
  return res.json({ projectSlug, commands });
});

commandBridgeRouter.post('/requests', async (req: FounderRequest, res) => {
  const body = req.body as DbRecord;
  const projectSlug = stringOrNull(body.projectSlug);
  const missionId = stringOrNull(body.missionId);
  const commandId = stringOrNull(body.commandId);
  const expectedCommitSha = stringOrNull(body.expectedCommitSha)?.toLowerCase() ?? null;
  const requestingAgent = stringOrNull(body.requestingAgent) ?? 'unknown-agent';
  const reason = stringOrNull(body.reason);
  const rollbackPlan = stringOrNull(body.rollbackPlan);
  const expiresAt = expiryFromBody(body);

  if (!projectSlug || !missionId || !commandId || !expectedCommitSha || !reason) {
    return res.status(400).json({ error: 'projectSlug, missionId, commandId, expectedCommitSha, and reason are required.' });
  }
  if (!FULL_SHA.test(expectedCommitSha)) {
    return res.status(400).json({ error: 'expectedCommitSha must be a full 40-character Git commit SHA.', code: 'INVALID_HEAD_SHA' });
  }
  if (!expiresAt) {
    return res.status(400).json({ error: `expiresAt or durationMinutes must be greater than now and no more than ${COMMAND_BRIDGE_MAX_REQUEST_WINDOW_MINUTES} minutes.` });
  }
  if (secretLike(reason, rollbackPlan, requestingAgent)) {
    return res.status(400).json({ error: 'Command Bridge requests must not contain credential-like material.' });
  }

  const command = getTerminalCommand(projectSlug, commandId);
  if (!command) {
    return res.status(400).json({ error: `Command "${commandId}" is not approved for project "${projectSlug}".`, code: 'UNKNOWN_COMMAND' });
  }

  const { project, error: projectError } = await fetchProject(projectSlug);
  if (projectError) return res.status(500).json({ error: projectError });
  if (!project) return res.status(404).json({ error: `Unknown project: ${projectSlug}` });
  if (!project.verificationEnabled) {
    return res.status(409).json({ error: 'Verification is disabled for this project.', code: 'PROJECT_VERIFICATION_DISABLED' });
  }

  const { mission, error: missionError } = await fetchMission(missionId, project.id);
  if (missionError) return res.status(500).json({ error: missionError });
  if (!mission) return res.status(404).json({ error: 'Mission not found for this project.' });
  if (!mission.expectedHeadSha || mission.expectedHeadSha !== expectedCommitSha) {
    return res.status(409).json({
      error: 'The requested commit does not match the mission policy snapshot.',
      code: 'MISSION_HEAD_MISMATCH',
      missionExpectedHeadSha: mission.expectedHeadSha,
      requestedHeadSha: expectedCommitSha,
    });
  }

  const allowedStatuses = allowedMissionStatuses(command.risk);
  if (!allowedStatuses.has(mission.status)) {
    return res.status(409).json({
      error: `Command risk '${command.risk}' is not allowed while mission is '${mission.status}'.`,
      code: 'COMMAND_NOT_ALLOWED_IN_MISSION_STATE',
      allowedStatuses: [...allowedStatuses],
    });
  }

  const { data: request, error } = await supabase
    .from('command_bridge_requests')
    .insert({
      project_id: project.id,
      mission_id: mission.id,
      command_id: command.id,
      expected_commit_sha: expectedCommitSha,
      requesting_agent: requestingAgent,
      requested_by: req.founder?.email ?? 'founder',
      reason,
      rollback_plan: rollbackPlan,
      risk: command.risk,
      status: 'requested',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const requestRow = recordOrNull(request);
  const requestId = stringOrNull(requestRow?.id) ?? null;
  const auditError = await audit(project.id, 'command_bridge_request_created', commandBridgeSeverityForRisk(command.risk), {
    route: 'POST /command-bridge/requests',
    requestId,
    commandId: command.id,
    missionId: mission.id,
    expectedCommitSha,
    risk: command.risk,
    requestingAgent,
    requested_by: req.founder?.email,
    expiresAt,
  });

  if (auditError && requestId) {
    await supabase
      .from('command_bridge_requests')
      .update({ status: 'audit_incomplete', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    return res.status(500).json({ error: 'COMMAND_BRIDGE_AUDIT_INCOMPLETE', detail: auditError, requestId });
  }

  return res.status(201).json({ request });
});

async function decideRequest(req: FounderRequest, res: Response, decision: 'approved' | 'denied') {
  const { requestId } = req.params as { requestId: string };
  const body = req.body as DbRecord;
  const approvalNote = stringOrNull(body.approvalNote);
  if (secretLike(approvalNote)) return res.status(400).json({ error: 'Decision notes must not contain credential-like material.' });

  const { data, error: readError } = await supabase
    .from('command_bridge_requests')
    .select('id, project_id, mission_id, command_id, expected_commit_sha, requesting_agent, requested_by, reason, rollback_plan, risk, status, expires_at, approved_by, approved_at, approval_note, terminal_run_id, created_at, updated_at, projects(id, slug, name), missions(id, title, status)')
    .eq('id', requestId)
    .maybeSingle();

  if (readError) return res.status(500).json({ error: readError.message });
  const existingRow = recordOrNull(data);
  if (!existingRow) return res.status(404).json({ error: 'Command Bridge request not found.' });
  const snapshot = normalizeRequest(existingRow);

  if (snapshot.status !== 'requested') {
    return res.status(409).json({ error: `Only requested command cards can be decided. Current status: ${snapshot.status}`, code: 'COMMAND_CARD_NOT_REQUESTED' });
  }
  if (!snapshot.expiresAt || Date.parse(snapshot.expiresAt) <= Date.now()) {
    await supabase.from('command_bridge_requests').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', requestId);
    return res.status(409).json({ error: 'Command card has expired.', code: 'COMMAND_CARD_EXPIRED' });
  }

  const decidedAt = new Date().toISOString();
  const { data: decided, error } = await supabase
    .from('command_bridge_requests')
    .update({
      status: decision,
      approved_by: req.founder?.email ?? 'founder',
      approved_at: decidedAt,
      approval_note: approvalNote,
      updated_at: decidedAt,
    })
    .eq('id', requestId)
    .select('id, project_id, mission_id, command_id, expected_commit_sha, requesting_agent, requested_by, reason, rollback_plan, risk, status, expires_at, approved_by, approved_at, approval_note, terminal_run_id, created_at, updated_at, projects(id, slug, name), missions(id, title, status)')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  const decidedSnapshot = normalizeRequest(decided as DbRecord);
  const auditError = await audit(decidedSnapshot.projectId, `command_bridge_request_${decision}`, commandBridgeSeverityForRisk(decidedSnapshot.risk), {
    route: `POST /command-bridge/requests/${requestId}/${decision === 'approved' ? 'approve' : 'deny'}`,
    requestId,
    commandId: decidedSnapshot.commandId,
    missionId: decidedSnapshot.missionId,
    decided_by: req.founder?.email,
    decision,
  });
  if (auditError) return res.status(500).json({ error: 'COMMAND_BRIDGE_DECISION_AUDIT_INCOMPLETE', detail: auditError });

  return res.json({
    request: decidedSnapshot,
    ...(decision === 'approved' ? { execution: executionPayloadForRequest(decidedSnapshot) } : {}),
  });
}

commandBridgeRouter.post('/requests/:requestId/approve', async (req: FounderRequest, res) => decideRequest(req, res, 'approved'));
commandBridgeRouter.post('/requests/:requestId/deny', async (req: FounderRequest, res) => decideRequest(req, res, 'denied'));

commandBridgeRouter.post('/requests/:requestId/mark-executed', async (req: FounderRequest, res) => {
  const { requestId } = req.params as { requestId: string };
  const body = req.body as DbRecord;
  const terminalRunId = stringOrNull(body.terminalRunId);
  if (!terminalRunId) return res.status(400).json({ error: 'terminalRunId is required.' });

  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('command_bridge_requests')
    .update({ status: 'executed', terminal_run_id: terminalRunId, updated_at: updatedAt })
    .eq('id', requestId)
    .eq('status', 'approved')
    .select('id, project_id, mission_id, command_id, expected_commit_sha, requesting_agent, requested_by, reason, rollback_plan, risk, status, expires_at, approved_by, approved_at, approval_note, terminal_run_id, created_at, updated_at, projects(id, slug, name), missions(id, title, status)')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  const row = recordOrNull(data);
  if (!row) return res.status(404).json({ error: 'Approved command card not found.' });
  const executed = normalizeRequest(row);
  const auditError = await audit(executed.projectId, 'command_bridge_request_executed', commandBridgeSeverityForRisk(executed.risk), {
    route: `POST /command-bridge/requests/${requestId}/mark-executed`,
    requestId,
    terminalRunId,
    marked_by: req.founder?.email,
  });
  if (auditError) return res.status(500).json({ error: 'COMMAND_BRIDGE_EXECUTION_AUDIT_INCOMPLETE', detail: auditError });
  return res.json({ request: executed });
});
