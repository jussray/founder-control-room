/**
 * Mission-scoped routes: multitool assignment, Agent Council, Bench, and
 * per-mission Analytics.
 *
 * `council_conversations`, `agent_runs`, and `agent_costs` already exist in
 * 0001_init.sql with founder-gated RLS from
 * 0002_enable_rls_and_founder_policy.sql — they were never wrong, just
 * never exposed over HTTP.
 *
 * Bench (`agent_runs`) stays READ-ONLY here: those rows are meant to be
 * objective CI/test evidence produced by the guarded terminal + proof-gate
 * path, not something fabricated through this API — a write route here
 * would let a founder action masquerade as machine evidence.
 *
 * Council rounds and cost entries are legitimately founder/agent-logged
 * bookkeeping (what was discussed, what was spent) — those get real write
 * routes, because multitool orchestration (assigning which tool builds and
 * reviews a mission, logging council rounds between tools, attributing
 * spend) is exactly what `builder_agent`/`reviewer_agent`/
 * `council_conversations.participants`/`agent_costs.agent_name` already
 * modeled. This does not call any AI provider — it records what already
 * happened outside this process.
 */

import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const missionsRouter = Router();
missionsRouter.use(requireFounder);

interface MissionRow {
  id: string;
  project_id: string;
}

async function findMission(missionId: string): Promise<MissionRow | null> {
  const { data } = await supabase.from('missions').select('id, project_id').eq('id', missionId).maybeSingle();
  return data ?? null;
}

async function missionExists(missionId: string): Promise<boolean> {
  return (await findMission(missionId)) !== null;
}

/**
 * PATCH /missions/:missionId
 * Body: { builderAgent?, reviewerAgent?, riskLevel? }
 *
 * Assigns which tool builds and which reviews a mission. Free-text, not
 * restricted to GET /agents' registry — the schema's own example list
 * ("codex", "claude-code", "cursor") already includes tools outside that
 * registry, and this is a label, not a credentialed integration.
 */
missionsRouter.patch('/:missionId', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  const body = req.body as Record<string, unknown>;

  const update: Record<string, unknown> = {};
  if (typeof body['builderAgent'] === 'string') update['builder_agent'] = body['builderAgent'];
  if (typeof body['reviewerAgent'] === 'string') update['reviewer_agent'] = body['reviewerAgent'];
  if (typeof body['riskLevel'] === 'string') update['risk_level'] = body['riskLevel'];

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No recognized fields to update were provided.' });
  }

  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  update['updated_at'] = new Date().toISOString();
  const { data: mission, error } = await supabase
    .from('missions')
    .update(update)
    .eq('id', missionId)
    .select('id, title, status, builder_agent, reviewer_agent, risk_level, updated_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ mission });
});

/** GET /missions/:missionId/council — Agent Council conversation rounds for this mission. */
missionsRouter.get('/:missionId/council', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  const { data, error } = await supabase
    .from('council_conversations')
    .select('id, round, participants, transcript, outcome, created_at')
    .eq('mission_id', missionId)
    .order('round', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ conversations: data ?? [] });
});

/**
 * POST /missions/:missionId/council
 * Body: { participants, outcome?, transcript?, round? }
 *
 * Logs one Agent Council round — which tools participated and what they
 * concluded. `round` defaults to one past the highest existing round for
 * this mission, so callers don't need to track round numbers themselves.
 */
missionsRouter.post('/:missionId/council', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  const body = req.body as Record<string, unknown>;

  const participants = body['participants'];
  if (!Array.isArray(participants) || participants.length === 0 || !participants.every((p) => typeof p === 'string')) {
    return res.status(400).json({ error: 'participants must be a non-empty array of strings' });
  }

  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  let round = typeof body['round'] === 'number' ? body['round'] : null;
  if (round === null) {
    const { data: latest } = await supabase
      .from('council_conversations')
      .select('round')
      .eq('mission_id', missionId)
      .order('round', { ascending: false })
      .limit(1)
      .maybeSingle();
    round = (latest?.round ?? 0) + 1;
  }

  const { data: conversation, error } = await supabase
    .from('council_conversations')
    .insert({
      mission_id: missionId,
      round,
      participants,
      transcript: body['transcript'] ?? null,
      outcome: typeof body['outcome'] === 'string' ? body['outcome'] : null,
    })
    .select('id, round, participants, transcript, outcome, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ conversation });
});

/** GET /missions/:missionId/runs — Bench: runner/CI check results for this mission. */
missionsRouter.get('/:missionId/runs', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  const { data, error } = await supabase
    .from('agent_runs')
    .select('id, change_proposal_id, runner_profile, checks, status, artifact_ids, started_at, finished_at')
    .eq('mission_id', missionId)
    .order('started_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ runs: data ?? [] });
});

/** GET /missions/:missionId/costs — per-mission agent cost ledger. */
missionsRouter.get('/:missionId/costs', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  if (!(await missionExists(missionId))) return res.status(404).json({ error: 'Mission not found' });

  const { data, error } = await supabase
    .from('agent_costs')
    .select('id, agent_name, provider, model, input_tokens, output_tokens, cost_usd, created_at')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  const totalUsd = (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  return res.json({ costs: data ?? [], totalUsd });
});

/**
 * POST /missions/:missionId/costs
 * Body: { agentName, provider?, model?, inputTokens?, outputTokens?, costUsd? }
 *
 * Attributes spend to whichever tool did the work — the Analytics rollup
 * (GET /dashboard/costs) reads exactly this table.
 */
missionsRouter.post('/:missionId/costs', async (req: FounderRequest, res) => {
  const { missionId } = req.params;
  const body = req.body as Record<string, unknown>;

  const agentName = typeof body['agentName'] === 'string' ? body['agentName'].trim() : '';
  if (!agentName) return res.status(400).json({ error: 'agentName is required' });

  const mission = await findMission(missionId);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });

  const { data: cost, error } = await supabase
    .from('agent_costs')
    .insert({
      project_id: mission.project_id,
      mission_id: missionId,
      agent_name: agentName,
      provider: typeof body['provider'] === 'string' ? body['provider'] : null,
      model: typeof body['model'] === 'string' ? body['model'] : null,
      input_tokens: typeof body['inputTokens'] === 'number' ? body['inputTokens'] : 0,
      output_tokens: typeof body['outputTokens'] === 'number' ? body['outputTokens'] : 0,
      cost_usd: typeof body['costUsd'] === 'number' ? body['costUsd'] : 0,
    })
    .select('id, agent_name, provider, model, input_tokens, output_tokens, cost_usd, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ cost });
});
