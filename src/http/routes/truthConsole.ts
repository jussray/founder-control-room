import { createHash } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const truthConsoleRouter = Router();
truthConsoleRouter.use(requireFounder);

const CLAIM_LIMIT = 200;
const EVIDENCE_LIMIT = 300;
const RECEIPT_LIMIT = 200;
const CONTINUITY_LIMIT = 300;
const ATTACK_LIMIT = 200;
const TEXT_LIMIT = 4_000;

const CLASSIFICATIONS = new Set(['verified', 'inferred', 'unknown', 'blocked', 'conflicted', 'stale']);
const EVIDENCE_STATUS = new Set(['pass', 'fail', 'warn', 'pending']);
const EVIDENCE_RELATION = new Set(['supports', 'contradicts', 'context']);
const ATTACK_TYPES = new Set(['version', 'premise', 'evidence', 'authority', 'runtime']);
const ATTACK_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);

type RecordValue = Record<string, unknown>;

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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stringField(value: unknown, name: string, max = TEXT_LIMIT): string {
  if (typeof value !== 'string') throw new Error(`${name} is required`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /\u0000/.test(normalized)) {
    throw new Error(`${name} must be 1-${max} characters`);
  }
  return normalized;
}

function optionalEnum(value: unknown, allowed: Set<string>, fallback: string, name: string): string {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.has(value)) throw new Error(`${name} is invalid`);
  return value;
}

function statusCodeForInputError(error: unknown): number {
  return error instanceof Error && /required|invalid|characters/.test(error.message) ? 400 : 500;
}

async function requireProject(projectId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name')
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

async function linkedEvidence(claimId: string) {
  const { data: links, error: linkError } = await supabase
    .from('truth_claim_evidence')
    .select('claim_id, evidence_id, relation, created_at')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true });
  if (linkError) throw new Error('claim evidence lookup failed');
  const evidenceIds = (links ?? []).map((link) => link.evidence_id as string);
  if (evidenceIds.length === 0) return [];
  const { data: evidence, error: evidenceError } = await supabase
    .from('evidence')
    .select('id, project_id, mission_id, subject, kind, status, provider, commit_sha, environment, details_ref, reusable_until, created_at')
    .in('id', evidenceIds);
  if (evidenceError) throw new Error('evidence lookup failed');
  const relationById = new Map((links ?? []).map((link) => [link.evidence_id, link.relation]));
  return (evidence ?? []).map((row) => ({ ...row, relation: relationById.get(row.id) ?? 'context' }));
}

function classifyEvidence(rows: Array<RecordValue>): string {
  if (rows.length === 0) return 'unknown';
  if (rows.some((row) => row.relation === 'contradicts' || row.status === 'fail')) return 'conflicted';
  const supporting = rows.filter((row) => row.relation === 'supports');
  if (supporting.length > 0 && supporting.every((row) => row.status === 'pass')) return 'verified';
  if (rows.some((row) => row.status === 'pending')) return 'unknown';
  return 'inferred';
}

function continuityState(row: RecordValue, now = Date.now()): 'current' | 'stale' | 'expired' {
  if (row.invalidated_at) return 'stale';
  if (typeof row.valid_until === 'string' && Date.parse(row.valid_until) <= now) return 'expired';
  return 'current';
}

async function invalidateCurrentContinuity(claim: TruthClaim, reason: string) {
  if (!claim.current_subject_fingerprint) return [];
  const invalidatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('continuity_records')
    .update({ invalidated_at: invalidatedAt, invalidation_reason: reason })
    .eq('project_id', claim.project_id)
    .eq('subject_fingerprint', claim.current_subject_fingerprint)
    .is('invalidated_at', null)
    .select('id, proof_cookie, subject_fingerprint, invalidated_at, invalidation_reason');
  if (error) throw new Error('continuity invalidation failed');
  return (data ?? []).map((row) => ({ ...row, state: 'stale' }));
}

async function markClaimStale(claim: TruthClaim, reason: string) {
  const invalidated = await invalidateCurrentContinuity(claim, reason);
  const nextRevision = Number(claim.revision) + 1;
  const { data, error } = await supabase
    .from('truth_claims')
    .update({
      classification: 'stale',
      revision: nextRevision,
      current_truth_snapshot_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claim.id)
    .select()
    .single();
  if (error) throw new Error('claim stale transition failed');
  return { claim: data, invalidated };
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
  const continuity = (continuityResult.data ?? []).map((row) => ({ ...row, state: continuityState(row as RecordValue) }));
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
    .select('id, slug, name, status')
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
    return res.status(201).json({ claim: data });
  } catch (error) {
    return res.status(statusCodeForInputError(error)).json({ error: error instanceof Error ? error.message : 'Claim creation failed' });
  }
});

truthConsoleRouter.get('/evidence', async (_req: FounderRequest, res) => {
  const { data, error } = await supabase
    .from('evidence')
    .select('id, project_id, mission_id, subject, kind, status, provider, commit_sha, environment, details_ref, reusable_until, created_at')
    .order('created_at', { ascending: false })
    .limit(EVIDENCE_LIMIT);
  if (error) return res.status(500).json({ error: 'Evidence unavailable' });
  return res.json({ evidence: data ?? [] });
});

truthConsoleRouter.post('/claims/:claimId/evidence', async (req: FounderRequest, res) => {
  try {
    const claim = await readClaim(req.params.claimId);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const kind = stringField(req.body?.kind ?? 'founder_observation', 'kind', 120);
    const status = optionalEnum(req.body?.status, EVIDENCE_STATUS, 'pass', 'status');
    const relation = optionalEnum(req.body?.relation, EVIDENCE_RELATION, 'supports', 'relation');
    const provider = stringField(req.body?.provider ?? 'founder', 'provider', 120);
    const detailsRef = stringField(req.body?.detailsRef, 'detailsRef', 2_000);

    const { data: evidence, error: evidenceError } = await supabase
      .from('evidence')
      .insert({
        project_id: claim.project_id,
        subject: claim.statement,
        kind,
        status,
        provider,
        environment: 'truth-console',
        details_ref: detailsRef,
      })
      .select()
      .single();
    if (evidenceError) return res.status(500).json({ error: 'Evidence creation failed' });

    const { error: linkError } = await supabase
      .from('truth_claim_evidence')
      .insert({ claim_id: claim.id, evidence_id: evidence.id, relation });
    if (linkError) return res.status(500).json({ error: 'Evidence link failed' });

    const stale = await markClaimStale(claim, 'claim_evidence_changed');
    return res.status(201).json({ evidence: { ...evidence, relation }, claim: stale.claim, invalidatedContinuity: stale.invalidated });
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
    const claim = await readClaim(req.params.claimId);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const rows = await linkedEvidence(claim.id) as Array<RecordValue>;
    const classification = classifyEvidence(rows);
    const evidenceFingerprint = sha256(JSON.stringify(rows
      .map((row) => ({ id: row.id, status: row.status, relation: row.relation }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))));
    const subjectFingerprint = sha256(JSON.stringify({
      contract: 'fcr/truth-claim-subject@v1',
      claimId: claim.id,
      projectId: claim.project_id,
      statement: claim.statement,
      revision: claim.revision,
    }));
    const now = new Date();
    const completedAt = now.toISOString();
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: snapshot, error: snapshotError } = await supabase
      .from('truth_snapshots')
      .insert({
        project_id: claim.project_id,
        source_truth: {
          contract: 'fcr/truth-claim@v1',
          claimId: claim.id,
          statement: claim.statement,
          revision: claim.revision,
          evidenceIds: rows.map((row) => row.id),
        },
        outcome_truth: { classification },
        classification,
        observed_at: completedAt,
        expires_at: validUntil,
      })
      .select()
      .single();
    if (snapshotError) return res.status(500).json({ error: 'Truth snapshot creation failed' });

    await invalidateCurrentContinuity(claim, 'superseded_by_reconciliation');
    const proofCookie = `fcr-proof-v1:${sha256(`${subjectFingerprint}:${evidenceFingerprint}:${snapshot.id}`).slice(0, 40)}`;
    const { data: continuity, error: continuityError } = await supabase
      .from('continuity_records')
      .insert({
        project_id: claim.project_id,
        subject_fingerprint: subjectFingerprint,
        proof_cookie: proofCookie,
        truth_snapshot_id: snapshot.id,
        evidence_fingerprint: evidenceFingerprint,
        valid_until: validUntil,
      })
      .select()
      .single();
    if (continuityError) return res.status(500).json({ error: 'Continuity record creation failed' });

    const status = classification === 'verified' ? 'converged' : 'drifted';
    const { data: receipt, error: receiptError } = await supabase
      .from('reconciliation_runs')
      .insert({
        project_id: claim.project_id,
        controller: 'TruthConsole',
        resource_id: claim.id,
        reason: 'founder_truth_reconciliation',
        status,
        observed_changes: [{ classification, revision: claim.revision }],
        proposed_actions: classification === 'verified' ? [] : [{ action: 'review_evidence', authority: 'none' }],
        evidence_ids: rows.map((row) => row.id),
        requires_approval: false,
        message: `Truth claim reconciled as ${classification}`,
        completed_at: completedAt,
      })
      .select()
      .single();
    if (receiptError) return res.status(500).json({ error: 'Reconciliation receipt creation failed' });

    const { data: updatedClaim, error: claimError } = await supabase
      .from('truth_claims')
      .update({
        classification,
        current_truth_snapshot_id: snapshot.id,
        current_subject_fingerprint: subjectFingerprint,
        updated_at: completedAt,
      })
      .eq('id', claim.id)
      .select()
      .single();
    if (claimError) return res.status(500).json({ error: 'Claim reconciliation update failed' });

    return res.json({
      claim: updatedClaim,
      snapshot,
      receipt,
      continuity: { ...continuity, state: continuityState(continuity as RecordValue) },
      authorityEffect: 'none',
    });
  } catch {
    return res.status(500).json({ error: 'Claim reconciliation failed' });
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
    return res.status(201).json({ attack: data });
  } catch (error) {
    return res.status(statusCodeForInputError(error)).json({ error: error instanceof Error ? error.message : 'Attack creation failed' });
  }
});

truthConsoleRouter.post('/attacks/:attackId/resolve', async (req: FounderRequest, res) => {
  try {
    const answer = stringField(req.body?.answer, 'answer');
    const evidenceId = stringField(req.body?.evidenceId, 'evidenceId', 200);
    const { data: attack, error: attackError } = await supabase
      .from('truth_attacks')
      .select('id, claim_id, project_id, status')
      .eq('id', req.params.attackId)
      .maybeSingle();
    if (attackError) return res.status(500).json({ error: 'Attack lookup failed' });
    if (!attack) return res.status(404).json({ error: 'Attack not found' });
    if (attack.status === 'resolved') return res.status(409).json({ error: 'Attack already resolved' });

    const { data: link, error: linkError } = await supabase
      .from('truth_claim_evidence')
      .select('claim_id, evidence_id')
      .eq('claim_id', attack.claim_id)
      .eq('evidence_id', evidenceId)
      .maybeSingle();
    if (linkError) return res.status(500).json({ error: 'Attack evidence lookup failed' });
    if (!link) return res.status(400).json({ error: 'evidenceId must already be attached to this claim' });

    const claim = await readClaim(attack.claim_id as string);
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    const stale = await markClaimStale(claim, 'attack_resolution_changed_truth');
    const resolvedAt = new Date().toISOString();
    const { data: updatedAttack, error: updateError } = await supabase
      .from('truth_attacks')
      .update({
        status: 'resolved',
        resolution_answer: answer,
        resolution_evidence_id: evidenceId,
        resolved_at: resolvedAt,
        updated_at: resolvedAt,
      })
      .eq('id', attack.id)
      .select()
      .single();
    if (updateError) return res.status(500).json({ error: 'Attack resolution failed' });

    return res.json({ attack: updatedAttack, claim: stale.claim, invalidatedContinuity: stale.invalidated, cookieState: 'stale', authorityEffect: 'none' });
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
  return res.json({ continuity: (data ?? []).map((row) => ({ ...row, state: continuityState(row as RecordValue) })) });
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
