import { supabase } from '../lib/supabaseClient.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';
import { BaseController } from './base.js';

type StripeSyncWitness = {
  available: boolean;
  proof_scope: 'latest_full_sync_run';
  reason?: string;
  run_present?: boolean;
  started_at?: string;
  closed_at?: string;
  triggered_by?: string;
  total_processed?: number;
  total_objects?: number;
  complete_count?: number;
  error_count?: number;
  running_count?: number;
  pending_count?: number;
  status?: string;
  error_present?: boolean;
  reconciliation_proven?: boolean;
};

export class StripeSyncWitnessController extends BaseController {
  readonly name = 'StripeSyncWitnessController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { data, error } = await supabase.rpc('stripe_sync_witness_v1');
    if (error) return this.retry(`Stripe Sync witness failed: ${error.message}`);

    const witness = data as StripeSyncWitness | null;
    if (!witness) return this.retry('Stripe Sync witness returned no state');

    const observedAt = new Date().toISOString();
    const { error: observationError } = await supabase
      .from('provider_observations')
      .upsert({
        project_id: req.projectId,
        provider: 'stripe',
        resource_type: 'stripe_sync',
        resource_id: 'latest_full_sync_run',
        observed_state: witness,
        observed_at: observedAt,
        source_event_id: req.sourceEventId ?? null,
      }, { onConflict: 'project_id,provider,resource_type,resource_id' });

    if (observationError) {
      return this.retry(`Stripe Sync observation persistence failed: ${observationError.message}`);
    }

    if (!witness.available) {
      return this.done('blocked', witness.reason ?? 'Stripe Sync provider ledger is unavailable');
    }

    if (!witness.run_present) {
      return this.done('drifted', 'Stripe Sync provider ledger has no full-sync run to prove');
    }

    if (witness.reconciliation_proven !== true) {
      return this.done('drifted', `Latest Stripe full-sync run is not proven complete (${witness.status ?? 'unknown'})`);
    }

    return {
      status: 'converged',
      observedChanges: [{
        resourceType: 'stripe_sync',
        resourceId: 'latest_full_sync_run',
        field: 'reconciliationProven',
        previousValue: null,
        newValue: true,
      }],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      message: `Latest Stripe full-sync run is proven complete (${witness.complete_count ?? 0}/${witness.total_objects ?? 0}, errors=${witness.error_count ?? 0})`,
    };
  }

  private retry(message: string): ReconcileResult {
    return {
      status: 'retry',
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      retryAfter: new Date(Date.now() + 5 * 60_000).toISOString(),
      message,
    };
  }

  private done(status: ReconcileResult['status'], message: string): ReconcileResult {
    return {
      status,
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      message,
    };
  }
}
