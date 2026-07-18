/**
 * Founder dashboard — read model + manual-analysis trigger.
 *
 * This is the founder-gated equivalent of a "task board" and "activity
 * feed": it reads the existing `missions` and `project_events` tables
 * rather than introducing a parallel schema. Every route sits behind
 * `requireFounder` (session + allowlist), matching every other route in
 * this server. There is no unauthenticated execution path here — manual
 * analysis reuses the existing `ProjectController` reconcile loop, the
 * same one event-triggered webhooks and the scheduler already use.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { ProjectController } from '../../controllers/ProjectController.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireFounder);

const TASKS_LIMIT = 200;
const ACTIVITY_LIMIT = 100;

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
    screen: 'control-room-dashboard',
    metadata,
  });
}

/** Attach {slug, name} from `projects` to rows that carry a project_id, without relying on PostgREST embedding. */
async function withProjectLabels<T extends { project_id: string }>(
  rows: T[],
): Promise<Array<T & { project: { slug: string; name: string } | null }>> {
  const projectIds = [...new Set(rows.map((row) => row.project_id))];
  if (projectIds.length === 0) return rows.map((row) => ({ ...row, project: null }));

  const { data: projects } = await supabase
    .from('projects')
    .select('id, slug, name')
    .in('id', projectIds);

  const bySlug = new Map((projects ?? []).map((project) => [project.id, { slug: project.slug, name: project.name }]));
  return rows.map((row) => ({ ...row, project: bySlug.get(row.project_id) ?? null }));
}

// ─── GET /dashboard/tasks ────────────────────────────────────────────────────
/** Founder task board — reads `missions`, the existing issues/PR-equivalent table. */
dashboardRouter.get('/tasks', async (req: FounderRequest, res) => {
  const { data: missions, error } = await supabase
    .from('missions')
    .select('id, project_id, title, description, status, risk_level, builder_agent, reviewer_agent, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(TASKS_LIMIT);

  if (error) return res.status(500).json({ error: error.message });

  const tasks = await withProjectLabels(missions ?? []);

  return res.json({ tasks });
});

// ─── GET /dashboard/activity ─────────────────────────────────────────────────
/** Founder activity feed — reads `project_events`, the existing curated/sanitized event log. */
dashboardRouter.get('/activity', async (req: FounderRequest, res) => {
  const { data: events, error } = await supabase
    .from('project_events')
    .select('id, project_id, event_type, severity, screen, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) return res.status(500).json({ error: error.message });

  const activity = await withProjectLabels(events ?? []);

  return res.json({ activity });
});

const COSTS_LIMIT = 1000;

// ─── GET /dashboard/costs ─────────────────────────────────────────────────────
/**
 * Analytics — reads `agent_costs`, rolling it up by project and by agent.
 * This is a read/aggregation surface only; nothing in the Control Room
 * writes agent_costs through the founder-facing API — those rows come from
 * the provider adapters that actually spend tokens, same as agent_runs.
 */
dashboardRouter.get('/costs', async (req: FounderRequest, res) => {
  const { data: rows, error } = await supabase
    .from('agent_costs')
    .select('id, project_id, mission_id, agent_name, provider, model, input_tokens, output_tokens, cost_usd, created_at')
    .order('created_at', { ascending: false })
    .limit(COSTS_LIMIT);

  if (error) return res.status(500).json({ error: error.message });

  const costs = await withProjectLabels(rows ?? []);

  const totalUsd = costs.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);

  const byAgent = new Map<string, { agentName: string; provider: string | null; costUsd: number; inputTokens: number; outputTokens: number }>();
  for (const row of costs) {
    const key = row.agent_name;
    const bucket = byAgent.get(key) ?? { agentName: row.agent_name, provider: row.provider, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    bucket.costUsd += Number(row.cost_usd ?? 0);
    bucket.inputTokens += Number(row.input_tokens ?? 0);
    bucket.outputTokens += Number(row.output_tokens ?? 0);
    byAgent.set(key, bucket);
  }

  return res.json({
    totalUsd,
    byAgent: [...byAgent.values()].sort((a, b) => b.costUsd - a.costUsd),
    costs,
  });
});

// ─── POST /dashboard/manual-analysis ─────────────────────────────────────────
/**
 * Founder-triggered on-demand resync of one project's observed state.
 * Reuses ProjectController — the same reconcile loop periodic resync and
 * GitHub webhooks already drive — rather than a second execution path.
 * Runs synchronously so the founder gets an immediate result, same as
 * POST /l99/gate/:gateId and POST /approvals/:missionId/run-proof-gate.
 */
dashboardRouter.post('/manual-analysis', async (req: FounderRequest, res) => {
  const projectSlug = typeof req.body?.projectSlug === 'string' ? req.body.projectSlug.trim() : '';
  if (!projectSlug) {
    return res.status(400).json({ error: 'projectSlug is required' });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, slug, name')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${projectSlug}"` });

  const controller = new ProjectController();
  const result = await controller.run({
    projectId: project.id,
    controller: 'ProjectController',
    reason: 'founder_triggered',
  });

  await auditEvent(
    project.id,
    'manual_analysis_triggered',
    {
      route: 'POST /dashboard/manual-analysis',
      triggered_by: req.founder?.email,
      status: result.status,
    },
    result.status === 'blocked' ? 'warning' : 'info',
  );

  const status = result.status === 'converged' ? 200 : result.status === 'retry' ? 202 : 422;
  return res.status(status).json({ project: { slug: project.slug, name: project.name }, result });
});
