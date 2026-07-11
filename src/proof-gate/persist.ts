/**
 * Proof Gate — Supabase persistence.
 *
 * Column alignment with the LIVE deployed schema (20260711_proof_gate_results.sql
 * + 20260711_proof_gate_results_reconcile.sql):
 *
 *   id, mission_id, project_id, gate_id, status, all_failures,
 *   evidence, approved_by, ran_at, created_at
 *
 * project_id and ran_at are retained in the insert because they exist in the
 * deployed table and have NOT NULL / default constraints respectively.
 * Pass project_id explicitly; ran_at defaults to now().
 */

import { supabase } from '../lib/supabaseClient.js';
import type { ProofGateResult } from './types.js';

export interface PersistedProofGateResult {
  id: string;
  mission_id: string;
  project_id: string;
  gate_id: string;
  status: string;
  all_failures: string[];
  evidence: unknown;
  approved_by: string | null;
  ran_at: string;
  created_at: string;
}

/**
 * Persist a gate result against a mission.
 * Returns the inserted row id.
 *
 * @param projectId — required because the deployed table has project_id NOT NULL.
 */
export async function persistProofResult(
  missionId: string,
  projectId: string,
  result: ProofGateResult,
): Promise<string> {
  const { data, error } = await supabase
    .from('proof_gate_results')
    .insert({
      mission_id: missionId,
      project_id: projectId,
      gate_id: result.gateId,
      status: result.status,
      all_failures: result.allFailures,
      evidence: result.evidence,
      approved_by: result.approvedBy ?? null,
      // ran_at and created_at both default to now() in the DB
    })
    .select('id')
    .single();

  if (error) throw new Error(`persistProofResult: ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Returns the most recent PASSING proof result for a given mission + gateId.
 * Returns null if no passing gate exists — caller should treat this as blocked.
 */
export async function getLatestPassingGate(
  missionId: string,
  gateId: string,
): Promise<PersistedProofGateResult | null> {
  const { data, error } = await supabase
    .from('proof_gate_results')
    .select('*')
    .eq('mission_id', missionId)
    .eq('gate_id', gateId)
    .eq('status', 'pass')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestPassingGate: ${error.message}`);
  return data as PersistedProofGateResult | null;
}
