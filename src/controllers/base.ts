/**
 * BaseController
 *
 * Provides:
 * - per-resource lease acquisition (prevents concurrent mutation)
 * - idempotency key construction
 * - circuit-breaker state check (stub – extend per provider)
 * - structured logging
 */

import { supabase } from '../lib/supabaseClient.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';

const LEASE_TTL_SECONDS = 60;

export abstract class BaseController {
  abstract readonly name: string;

  /** Subclasses implement this. Called only after lease is acquired. */
  protected abstract reconcile(
    req: ReconcileRequest,
  ): Promise<ReconcileResult>;

  async run(req: ReconcileRequest): Promise<ReconcileResult> {
    const leaseKey = this.leaseKey(req);
    const leaseClaimedAt = await this.acquireLease(leaseKey);

    if (!leaseClaimedAt) {
      return {
        status: 'retry',
        observedChanges: [],
        proposedActions: [],
        evidenceIds: [],
        requiresApproval: false,
        retryAfter: new Date(Date.now() + 5_000).toISOString(),
        message: `Lease held for ${leaseKey} – will retry`,
      };
    }

    try {
      return await this.reconcile(req);
    } finally {
      await this.releaseLease(leaseKey, leaseClaimedAt);
    }
  }

  protected leaseKey(req: ReconcileRequest): string {
    return [
      req.projectId,
      this.name,
      req.resourceId ?? 'global',
    ].join(':');
  }

  /**
   * Build an idempotency key for an external action.
   * Format: projectId:missionId:actionType:revision
   */
  protected idempotencyKey(
    projectId: string,
    missionId: string,
    actionType: string,
    revision: string,
  ): string {
    return [projectId, missionId, actionType, revision].join(':');
  }

  /**
   * Acquire through the database-side compare-and-replace function. The
   * returned claimed_at value is an ownership token used during release, so a
   * slow worker cannot delete a newer worker's replacement lease.
   */
  private async acquireLease(key: string): Promise<string | null> {
    const { data: acquired, error: acquireError } = await supabase.rpc(
      'try_acquire_controller_lease',
      {
        p_lease_key: key,
        p_ttl_seconds: LEASE_TTL_SECONDS,
      },
    );

    if (acquireError) {
      this.log('error', 'Controller lease acquisition failed', {
        leaseKey: key,
        error: acquireError.message,
      });
      return null;
    }

    if (acquired !== true) return null;

    const { data: lease, error: leaseReadError } = await supabase
      .from('controller_leases')
      .select('claimed_at')
      .eq('lease_key', key)
      .single();

    if (leaseReadError || !lease?.claimed_at) {
      this.log('error', 'Controller lease token could not be read', {
        leaseKey: key,
        error: leaseReadError?.message ?? 'missing claimed_at',
      });
      return null;
    }

    return String(lease.claimed_at);
  }

  private async releaseLease(key: string, claimedAt: string): Promise<void> {
    const { error } = await supabase
      .from('controller_leases')
      .delete()
      .eq('lease_key', key)
      .eq('claimed_at', claimedAt);

    if (error) {
      this.log('error', 'Controller lease release failed', {
        leaseKey: key,
        claimedAt,
        error: error.message,
      });
    }
  }

  protected log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
    const entry = { ts: new Date().toISOString(), controller: this.name, level, msg, ...meta };
    if (level === 'error') console.error(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
  }
}
