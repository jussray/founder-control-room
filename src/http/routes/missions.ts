/**
 * Mission-scoped read routes: Agent Council, Bench, and per-mission Analytics.
 *
 * These three tables (`council_conversations`, `agent_runs`, `agent_costs`)
 * already exist in 0001_init.sql with founder-gated RLS from
 * 0002_enable_rls_and_founder_policy.sql — they were never wrong, just
 * never exposed over HTTP. This file only reads; nothing here writes,
 * because nothing in this repo populates these tables from a founder
 * action yet (council rounds and runner checks come from agent tooling,
 * costs come from provider usage) — reads are honest, a write route here
 * would just be a second, disconnected way to fabricate rows.
 */

import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const missionsRouter = Router();
missionsRouter.use(requireFounder);

async function missionExists(missionId: string): Promise<boolean> {
  const { data } = await supabase.from('missions').select('id').eq('id', missionId).maybeSingle();
  return Boolean(data);
}

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
