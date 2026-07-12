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

export abstract class BaseController {
  abstract readonly name: string;

  /** Subclasses implement this. Called only after lease is acquired. */
  protected abstract reconcile(
    req: ReconcileRequest,
  ): Promise<ReconcileResult>;

  async run(req: ReconcileRequest): Promise<ReconcileResult> {
    const leaseKey = this.leaseKey(req);
    const acquired = await this.acquireLease(leaseKey);

    if (!acquired) {
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
      await this.releaseLease(leaseKey);
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

  private async acquireLease(key: string): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000).toISOString(); // 60s TTL

    // Reap a stale lease first (safety net for crashed workers that never
    // reached releaseLease) so a dead worker doesn't block this resource
    // forever.
    await supabase
      .from('controller_leases')
      .delete()
      .eq('lease_key', key)
      .lt('expires_at', now.toISOString());

    // Plain insert, not upsert: with `ignoreDuplicates: true` Postgrest
    // returns no error on a conflicting row, so `!error` was always true —
    // the "lease" never actually excluded anyone. A unique-constraint
    // violation here is the only reliable signal the lease is held.
    const { error } = await supabase
      .from('controller_leases')
      .insert({ lease_key: key, claimed_at: now.toISOString(), expires_at: expiresAt });

    return !error;
  }

  private async releaseLease(key: string): Promise<void> {
    await supabase.from('controller_leases').delete().eq('lease_key', key);
  }

  protected log(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) {
    const entry = { ts: new Date().toISOString(), controller: this.name, level, msg, ...meta };
    if (level === 'error') console.error(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
  }
}
