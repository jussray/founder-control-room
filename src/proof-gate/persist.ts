/**
 * Proof Gate — Supabase persistence.
 *
 * Writes ProofGateResult rows to `proof_gate_results` and provides a
 * helper to check whether a passing gate exists before an action is allowed.
 */

import { supabase } from '../lib/supabaseClient.js';
import type { ProofGateResult } from './types.js';

export interface PersistedProofGateResult {
  id: string;
  mission_id: string;
  gate_id: string;
  status: string;
  all_failures: string[];
  evidence: unknown;
  approved_by: string | null;
  created_at: string;
}

/**
 * Persist a gate result against a mission.
 * Returns the inserted row id.
 */
export async function persistProofResult(
  missionId: string,
  result: ProofGateResult,
): Promise<string> {
  const { data, error } = await supabase
    .from('proof_gate_results')
    .insert({
      mission_id: missionId,
      gate_id: result.gateId,
      status: result.status,
      all_failures: result.allFailures,
      evidence: result.evidence,
      approved_by: result.approvedBy ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`persistProofResult: ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Returns the most recent PASSING proof result for a given mission + gateId.
 * Returns null if no passing gate exists — which means the action is blocked.
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
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getLatestPassingGate: ${error.message}`);
  return data as PersistedProofGateResult | null;
}
