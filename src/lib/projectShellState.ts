import { supabase } from './supabaseClient.js';

export async function readProjectShellState(projectId: string) {
  const [truth, continuity, outcome, resources, recovery] = await Promise.all([
    supabase.from('truth_snapshots').select('*').eq('project_id', projectId).order('observed_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('continuity_records').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('outcomes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('resource_budgets').select('*').eq('project_id', projectId).order('updated_at', { ascending: false }),
    supabase.from('recovery_plans').select('*').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const errors = [truth.error, continuity.error, outcome.error, resources.error, recovery.error].filter(Boolean);
  if (errors.length) {
    return {
      available: false as const,
      classification: 'unknown' as const,
      reason: 'canonical_shell_state_unavailable',
      truth: null,
      continuity: null,
      outcome: null,
      resources: [],
      recovery: null,
    };
  }

  return {
    available: true as const,
    classification: truth.data?.classification ?? 'unknown',
    reason: truth.data ? null : 'no_truth_snapshot',
    truth: truth.data ?? null,
    continuity: continuity.data ?? null,
    outcome: outcome.data ?? null,
    resources: resources.data ?? [],
    recovery: recovery.data ?? null,
  };
}
