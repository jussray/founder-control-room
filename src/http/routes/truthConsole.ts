import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { truthContinuityState } from '../../lib/truthConsoleRules.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const truthConsoleRouter = Router();
truthConsoleRouter.use(requireFounder);

const CLAIM_LIMIT = 200;
const EVIDENCE_LIMIT = 300;
const RECEIPT_LIMIT = 200;
const CONTINUITY_LIMIT = 300;
const ATTACK_LIMIT = 200;
const TEXT_LIMIT = 4_000;

const EVIDENCE_STATUS = new Set(['pass', 'fail', 'warn', 'pending']);
const EVIDENCE_RELATION = new Set(['supports', 'contradicts', 'context']);
const ATTACK_TYPES = new Set(['version', 'premise', 'evidence', 'authority', 'runtime']);
const ATTACK_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);

type TruthClaim = {
  id: string;
  project_id: string;
  statement: string;
  classification: string;
  revision: number;
  current_truth_snapshot_id: string | null;
  current_subject_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

type RpcFailure = { status: number; message: string };

function stringField(value: unknown, name: string, max = TEXT_LIMIT): string {
  if (typeof value !== 'string') throw new Error(`${name} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /\u0000/.test(normalized)) {
    throw new Error(`${name} must be 1-${max} characters`);
  }
  return normalized;
}

function positiveIntegerField(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function optionalEnum(value: unknown, allowed: Set<string>, fallback: string, name: string): string {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.has(value)) throw new Error(`${name} is invalid`);
  return value;
}

function statusCodeForInputError(error: unknown): number {
  return error instanceof Error && /required|invalid|characters/.test(error.message) ? 400 : 500;
}

function rpcFailure(error: unknown, fallback: string): RpcFailure {
  const message = typeof error === 'object' && error && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  if (message.includes('truth_claim_not_found')) return { status: 404, message: 'Claim not found' };
  if (message.includes('truth_attack_not_found')) return { status: 404, message: 'Attack not found' };
  if (message.includes('truth_claim_revision_mismatch')) {
    return { status: 409, message: 'Claim changed since this screen loaded. Refresh before reconciling.' };
  }
  if (message.includes('truth_attack_already_resolved')) return { status: 409, message: 'Attack already resolved' };
  if (message.includes('truth_attack_evidence_not_linked')) {
    return { status: 400, message: 'evidenceId must already be attached to this claim' };
  }
  return { status: 500, message: fallback };
}

async function requireProject(projectId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, repo_provider, repo_identifier, status, risk_level')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error('project lookup failed');
  return data;
}

async function readClaim(claimId: string): Promise<TruthClaim | null> {
  const { data, error } = await supabase
    .from('truth_claims')
    .select('id, project_id, statement, classification, revision, current_truth_snapshot_id, current_subject_fingerprint, created_at, updated_at')
    .eq('id', claimId)
    .maybeSingle();
  if (error) throw new Error('claim lookup failed');
  return data as TruthClaim | null;
}

truthConsoleRouter.get('/overview', async (_req: FounderRequest, res) => {
  const [claimsResult, evidenceResult, runsResult, attacksResult, continuityResult] = await Promise.all([
    supabase.from('truth_claims').select('id, classification, updated_at').order('updated_at', { ascending: false }).limit(CLAIM_LIMIT),
    supabase.from('evidence').select('id, status, created_at').order('created_at', { ascending: false }).limit(EVIDENCE_LIMIT),
    supabase.from('reconciliation_runs').select('id, controller, resource_id, status, message, started_at, completed_at').eq('controller', 'TruthConsole').order('started_at', { ascending: false }).limit(RECEIPT_LIMIT),
    supabase.from('truth_attacks').select('id, status, severity, created_at').order('created_at', { ascending: false }).limit(ATTACK_LIMIT),
    supabase.from('continuity_records').select('id, proof_cookie, invalidated_at, valid_until, created_at').order('created_at', { ascending: false }).limit(CONTINUITY_LIMIT),
  ]);
  const error = claimsResult.error ?? evidenceResult.error ?? runsResult.error ?? attacksResult.error ?? continuityResult.error;
  if (error) return res.status(500).json({ error: 'Truth console overview unavailable' });

  const claims = claimsResult.data ?? [];
  const continuity = (continuityResult.data ?? []).map((row) => ({ ...row, state: truthContinuityState(row) }));
  return res.json({
    counts: {
      claims: claims.length,
      staleClaims: claims.filter((row) => row.classification === 'stale').length,
      evidence: (evidenceResult.data ?? []).length,
      reconciliations: (runsResult.data ?? []).length,
      openAttacks: (attacksResult.data ?? []).filter((row) => row.status === 'open').length,
      staleCookies: continuity.filter((row) => row.state !== 'current').length,
    },
    recentReceipt: (runsResult.data ?? [])[0] ?? null,
    recentContinuity: continuity[0] ?? null,
  });
});

truthConsoleRouter.get('/projects', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, repo_provider, repo_identifier, status, risk_level')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Project registry unavailable' });
  return res.json({ projects: data ?? [] });
});

truthConsoleRouter.get('/claims', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('truth_claims')
    .select('id, project_id, statement, classification, revision, current_truth_snapshot_id, current_subject_fingerprint, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(CLAIM_LIMIT);
  if (error) return res.status(500).json({ error: 'Claims unavailable' });
  return res.json({ claims: data ?? [] });
});

truthConsoleRouter.post('/claims', async (req: FounderRequest, res) => {
  try {
    const projectId = stringField(req.body?.projectId, 'projectId', 200);
    const statement = stringField(req.body?.statement, 'statement');
    const project = await requireProject(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { data, error } = await supabase
      .from('truth_claims')
      .insert({
        project_id: projectId,
        statement,
        classification: 'unknown',
        created_by: req.founder?.userId ?? 'founder',
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Claim creation failed' });
    return res.status(201).json({ claim: data, project, authorityEffect: 'none' });
  } catch (error) {
    return res.status(statusCodeForInputError(error)).json({ error: error instanceof Error ? error.message : 'Claim creation failed' });
  }
});

truthConsoleRouter.get('/evidence', async (_req: FounderRequest, res) => {
  const [evidenceResult, linkResult] = await Promise.all([
    supabase
      .from('evidence')
      .select('id, project_id, mission_id, subject, kind, status, provider, commit_sha, environment, details_ref, reusable_until, created_at')
      .order('created_at', { ascending: false })
      .limit(EVIDENCE_LIMIT),
    supabase
      .from('truth_claim_evidence')
      .select('claim_id, evidence_id, relation, created_at')
      .order('created_at', { ascending: false }),
  ]);
  const error = evidenceResult.error ?? linkResult.error;
  if (error) return res.status(500).json({ error: 'Evidence unavailable' });
  return res.json({ evidence: evidenceResult.data ?? [], claimLinks: linkResult.data ?? [] });
});

truthConsoleRouter.post('/claims/:claimId/evidence', async (req: FounderRequest, res) => {
  try {
    const kind = stringField(req.body?.kind ?? 'founder_observation', 'kind', 120);
    const status = optionalEnum(req.body?.status, EVIDENCE_STATUS, 'pass', 'status');
    const relation = optionalEnum(req.body?.relation, EVIDENCE_RELATION, 'supports', 'relation');
    const provider = stringField(req.body?.provider ?? 'founder', 'provider', 120);
    const detailsRef = stringField(req.body?.detailsRef, 'detailsRef', 2_000);

    const { data, error } = await supabase.rpc('truth_console_attach_evidence', {
      p_claim_id: req.params.claimId,
      p_kind: kind,
      p_status: status,
      p_relation: relation,
      p_provider: provider,
      p_details_ref: detailsRef,
    });
    if (error) {
      const failure = rpcFailure(error, 'Evidence creation failed');
      return res.status(failure.status).json({ error: failure.message });
    }
    return res.status(201).json(data);
  } catch (error) {
    return res.status(statusCodeForInputError(error)).json({ error: error instanceof Error ? error.message : 'Evidence creation failed' });
  }
});

truthConsoleRouter.get('/reconciliations', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('reconciliation_runs')
    .select('id, project_id, controller, resource_id, reason, status, observed_changes, proposed_actions, evidence_ids, requires_approval, message, started_at, completed_at')
    .eq('controller', 'TruthConsole')
    .order('started_at', { ascending: false })
    .limit(RECEIPT_LIMIT);
  if (error) return res.status(500).json({ error: 'Reconciliation receipts unavailable' });
  return res.json({ reconciliations: data ?? [] });
});

truthConsoleRouter.post('/claims/:claimId/reconcile', async (req: FounderRequest, res) => {
  try {
    const expectedRevision = positiveIntegerField(req.body?.expectedRevision, 'expectedRevision');
    const { data, error } = await supabase.rpc('truth_console_reconcile_claim', {
      p_claim_id: req.params.claimId,
      p_expected_revision: expectedRevision,
    });
    if (error) {
      const failure = rpcFailure(error, 'Claim reconciliation failed');
      return res.status(failure.status).json({ error: failure.message });
    }
    return res.json(data);
  } catch (error) {
    return res.status(statusCodeForInputError(error)).json({ error: error instanceof Error ? error.message : 'Claim reconciliation failed' });
  }
});

truthConsoleRouter.get('/attacks', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('truth_attacks')
    .select('id, claim_id, project_id, attack_type, challenge, severity, status, resolution_answer, resolution_evidence_id, resolved_at, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(ATTACK_LIMIT);
  if (error) return res.status(500).json({ error: 'Attack ledger unavailable' });
  return res.json({ attacks: data ?? [] });
});

truthConsoleRouter.post('/attacks', async (req: FounderRequest, res) => {
  try {
    const claimId = stringField(req.body?.claimId, 'claimId', 200);
    const claim = await readClaim(claimId);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const challenge = stringField(req.body?.challenge, 'challenge');
    const attackType = optionalEnum(req.body?.attackType, ATTACK_TYPES, 'version', 'attackType');
    const severity = optionalEnum(req.body?.severity, ATTACK_SEVERITY, 'medium', 'severity');
    const { data, error } = await supabase
      .from('truth_attacks')
      .insert({
        claim_id: claim.id,
        project_id: claim.project_id,
        attack_type: attackType,
        challenge,
        severity,
        status: 'open',
        created_by: req.founder?.userId ?? 'founder',
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: 'Attack creation failed' });
    return res.status(201).json({ attack: data, authorityEffect: 'none' });
  } catch (error) {
    return res.status(statusCodeForInputError(error)).json({ error: error instanceof Error ? error.message : 'Attack creation failed' });
  }
});

truthConsoleRouter.post('/attacks/:attackId/resolve', async (req: FounderRequest, res) => {
  try {
    const answer = stringField(req.body?.answer, 'answer');
    const evidenceId = stringField(req.body?.evidenceId, 'evidenceId', 200);
    const { data, error } = await supabase.rpc('truth_console_resolve_attack', {
      p_attack_id: req.params.attackId,
      p_answer: answer,
      p_evidence_id: evidenceId,
    });
    if (error) {
      const failure = rpcFailure(error, 'Attack resolution failed');
      return res.status(failure.status).json({ error: failure.message });
    }
    return res.json(data);
  } catch (error) {
    return res.status(statusCodeForInputError(error)).json({ error: error instanceof Error ? error.message : 'Attack resolution failed' });
  }
});

truthConsoleRouter.get('/continuity', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('continuity_records')
    .select('id, project_id, mission_id, subject_fingerprint, proof_cookie, truth_snapshot_id, authority_fingerprint, runtime_fingerprint, evidence_fingerprint, valid_until, invalidated_at, invalidation_reason, created_at')
    .order('created_at', { ascending: false })
    .limit(CONTINUITY_LIMIT);
  if (error) return res.status(500).json({ error: 'Continuity unavailable' });
  return res.json({ continuity: (data ?? []).map((row) => ({ ...row, state: truthContinuityState(row) })) });
});

truthConsoleRouter.get('/world-radar', async (_req: FounderRequest, res) => {
  const [jurisdictions, programs, opportunities, outcomes, observations] = await Promise.all([
    supabase.from('economic_jurisdictions').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('economic_programs').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('economic_opportunities').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('economic_outcomes').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('portfolio_signal_observations').select('*').order('created_at', { ascending: false }).limit(100),
  ]);
  const error = jurisdictions.error ?? programs.error ?? opportunities.error ?? outcomes.error ?? observations.error;
  if (error) return res.status(500).json({ error: 'World radar unavailable' });
  return res.json({
    jurisdictions: jurisdictions.data ?? [],
    programs: programs.data ?? [],
    opportunities: opportunities.data ?? [],
    outcomes: outcomes.data ?? [],
    observations: observations.data ?? [],
    empty: [jurisdictions.data, programs.data, opportunities.data, outcomes.data, observations.data].every((rows) => (rows ?? []).length === 0),
  });
});
