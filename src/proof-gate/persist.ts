/**
 * Proof Gate persistence helpers.
 *
 * Expected proof_gate_results columns:
 *   id, mission_id, project_id, gate_id, status, all_failures,
 *   evidence, approved_by, ran_at, created_at
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
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`persistProofResult: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('persistProofResult: insert succeeded without returning an id');
  }

  return data.id as string;
}

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

  if (error) {
    throw new Error(`getLatestPassingGate: ${error.message}`);
  }

  return data as PersistedProofGateResult | null;
}
