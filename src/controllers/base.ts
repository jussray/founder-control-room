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
    const expiresAt = new Date(Date.now() + 60_000).toISOString(); // 60s TTL
    const { error } = await supabase
      .from('controller_leases')
      .upsert(
        { lease_key: key, claimed_at: new Date().toISOString(), expires_at: expiresAt },
        { onConflict: 'lease_key', ignoreDuplicates: true },
      );
    // If upsert was ignored, the row already exists → lease held
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
