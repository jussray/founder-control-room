/**
 * L99 OODA Launch Track
 *
 * Exposes three founder-gated endpoints for tracking L99 standalone
 * release readiness. All reads and writes are audited to project_events.
 *
 * OODA firing order (matches docs/L99_IMPLEMENTATION_PLAN.md):
 *   gate 1 — l99-creator-journey     (evidence gate)
 *   gate 2 — l99-auth                (approval gate — auth-change)
 *   gate 3 — l99-story-engine        (evidence gate)
 *   gate 4 — l99-continuity          (evidence gate)
 *   gate 5 — l99-release-safety      (approval gate — deploy)
 *
 * Red-team rule enforced at every gate:
 *   unresolvedRisks.length > 0 && !approvedBy => fail
 * This is the existing ProofGate contract — no new surface.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { supabase } from '../../lib/supabaseClient.js';
import { runProofGate } from '../../proof-gate/gate.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import type { ProofEvidence } from '../../proof-gate/types.js';

export const l99Router = Router();

// ─── Constants ───────────────────────────────────────────────────────────────

export const L99_SLUG = 'l99';

/**
 * The five OODA gate IDs for L99 standalone release.
 * Gate IDs that also appear in APPROVAL_GATES require founder sign-off.
 */
export const L99_GATES = [
  { id: 'l99-creator-journey', order: 1, label: 'Canonical creator journey' },
  { id: 'l99-auth',            order: 2, label: 'Auth + session recovery',   approvalGate: 'auth-change' as const },
  { id: 'l99-story-engine',    order: 3, label: 'Story Engine vertical slice' },
  { id: 'l99-continuity',      order: 4, label: 'Continuity state persistence' },
  { id: 'l99-release-safety',  order: 5, label: 'Tests, deploy, rollback, cost controls', approvalGate: 'deploy' as const },
] as const;

export type L99GateId = typeof L99_GATES[number]['id'];

const GATE_IDS = L99_GATES.map((g) => g.id);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getL99Project() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', L99_SLUG)
    .maybeSingle();
  return { project: data, error };
}

async function auditEvent(
  projectId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  severity: 'info' | 'warning' | 'error' = 'info',
) {
  await supabase.from('project_events').insert({
    project_id: projectId,
    source_event_id: randomUUID(),
    event_type: eventType,
    severity,
    screen: 'l99-ooda-route',
    metadata,
  });
}

// ─── GET /l99/status ─────────────────────────────────────────────────────────
/**
 * Returns the live OODA firing-order status for all 5 L99 gates.
 * Reads the latest proof_gate_results row per gateId from Supabase.
 * Red-team safe: never reports 'all good' if any gate has no evidence.
 */
l99Router.get('/status', requireFounder, async (req: FounderRequest, res) => {
  const { project, error: projectError } = await getL99Project();

  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) {
    return res.status(404).json({
      error: 'L99 project not seeded. POST /l99/seed first.',
      hint: 'Use POST /l99/seed to register L99 in the Control Room project registry.',
    });
  }

  // Fetch latest result per gate — one query, ordered by created_at desc
  const { data: results, error: resultsError } = await supabase
    .from('proof_gate_results')
    .select('gate_id, status, all_failures, approved_by, created_at')
    .eq('project_id', project.id)
    .in('gate_id', GATE_IDS)
    .order('created_at', { ascending: false });

  if (resultsError) return res.status(500).json({ error: resultsError.message });

  // Reduce to latest per gateId
  const latestByGate = new Map<string, typeof results[0]>();
  for (const row of results ?? []) {
    if (!latestByGate.has(row.gate_id)) latestByGate.set(row.gate_id, row);
  }

  const gates = L99_GATES.map((gate) => {
    const latest = latestByGate.get(gate.id);
    return {
      order: gate.order,
      gateId: gate.id,
      label: gate.label,
      status: latest?.status ?? 'not_run',
      failures: latest?.all_failures ?? [],
      approvedBy: latest?.approved_by ?? null,
      lastRun: latest?.created_at ?? null,
      requiresApproval: 'approvalGate' in gate,
    };
  });

  const allPass = gates.every((g) => g.status === 'pass');
  const blockedAt = gates.find((g) => g.status !== 'pass');

  await auditEvent(project.id, 'l99_status_read', {
    route: 'GET /l99/status',
    read_by: req.founder?.email,
    all_pass: allPass,
    blocked_at: blockedAt?.gateId ?? null,
  });

  return res.json({
    project: { slug: project.slug, name: project.name, status: project.status },
    oodaFiringOrder: gates,
    standaloneLaunchReady: allPass,
    blockedAt: blockedAt ?? null,
    redTeamVerdict: allPass
      ? 'All 5 gates passed. Standalone launch candidate proven.'
      : `Blocked at gate ${blockedAt?.order}: ${blockedAt?.label}. Do not report ready.`,
  });
});

// ─── POST /l99/gate/:gateId ───────────────────────────────────────────────────
/**
 * Run a proof gate for a specific L99 lane.
 * Body: ProofEvidence + optional approvedBy string.
 * The APPROVAL_GATES check in runProofGate() enforces founder sign-off
 * for l99-auth (maps to 'auth-change') and l99-release-safety (maps to 'deploy').
 */
l99Router.post('/gate/:gateId', requireFounder, async (req: FounderRequest, res) => {
  const { gateId } = req.params as { gateId: string };

  if (!GATE_IDS.includes(gateId as L99GateId)) {
    return res.status(400).json({
      error: `Unknown L99 gate: "${gateId}"`,
      validGates: GATE_IDS,
    });
  }

  const { project, error: projectError } = await getL99Project();
  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) {
    return res.status(404).json({ error: 'L99 project not seeded. POST /l99/seed first.' });
  }

  const evidence: ProofEvidence = req.body.evidence;
  const approvedBy: string | undefined = req.body.approvedBy;

  if (!evidence) {
    return res.status(400).json({
      error: 'Request body must include { evidence: ProofEvidence, approvedBy?: string }',
    });
  }

  // Map L99 gate IDs to the APPROVAL_GATES IDs the proof-gate module knows
  const approvalGateMap: Partial<Record<L99GateId, string>> = {
    'l99-auth': 'auth-change',
    'l99-release-safety': 'deploy',
  };
  const canonicalGateId = approvalGateMap[gateId as L99GateId] ?? gateId;

  const result = runProofGate(canonicalGateId, evidence, approvedBy);

  // Persist result to proof_gate_results
  const { error: insertError } = await supabase.from('proof_gate_results').insert({
    id: randomUUID(),
    project_id: project.id,
    gate_id: gateId, // store the L99-namespaced ID for status queries
    status: result.status,
    all_failures: result.allFailures,
    evidence: evidence,
    approved_by: approvedBy ?? null,
    run_by: req.founder?.email ?? 'unknown',
    created_at: result.timestamp,
  });

  if (insertError) return res.status(500).json({ error: insertError.message });

  await auditEvent(
    project.id,
    'l99_gate_run',
    {
      gate_id: gateId,
      status: result.status,
      failures: result.allFailures,
      run_by: req.founder?.email,
    },
    result.status === 'fail' ? 'warning' : 'info',
  );

  return res.status(result.status === 'pass' ? 200 : 422).json(result);
});

// ─── POST /l99/seed ───────────────────────────────────────────────────────────
/**
 * Idempotent. Registers L99 in the Control Room project registry if not
 * already present. Safe to call multiple times.
 */
l99Router.post('/seed', requireFounder, async (req: FounderRequest, res) => {
  const { project: existing, error: lookupError } = await getL99Project();
  if (lookupError) return res.status(500).json({ error: lookupError.message });

  if (existing) {
    return res.json({
      seeded: false,
      message: 'L99 project already registered.',
      project: existing,
    });
  }

  const now = new Date().toISOString();
  const newProject = {
    id: randomUUID(),
    slug: L99_SLUG,
    name: 'L99',
    repo_provider: 'github',
    repo_identifier: 'jussray/l99-',
    stack: 'nextjs+supabase',
    status: 'active',
    risk_level: 'high',
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('projects')
    .insert(newProject)
    .select()
    .single();

  if (insertError) return res.status(500).json({ error: insertError.message });

  await auditEvent(inserted.id, 'l99_project_seeded', {
    seeded_by: req.founder?.email,
    route: 'POST /l99/seed',
  });

  return res.status(201).json({
    seeded: true,
    message: 'L99 registered in Control Room project registry.',
    project: inserted,
    nextStep: 'POST /l99/gate/l99-creator-journey with ProofEvidence to begin OODA loop.',
  });
});
