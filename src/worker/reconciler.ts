/**
 * Reconciler
 *
 * Polls the controller_outbox, claims work atomically, dispatches to the
 * correct controller, marks complete or failed.
 * Writes a reconciliation_runs audit row for every execution.
 *
 * Both event-triggered and periodic-resync paths call the same controllers.
 * No separate code path exists for webhooks vs schedules.
 */

import { claimWork, completeWork, failWork } from '../events/outbox.js';
import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from '../controllers/base.js';
import { CheckRunController } from '../controllers/CheckRunController.js';
import { ChangeProposalController } from '../controllers/ChangeProposalController.js';
import { MissionController } from '../controllers/MissionController.js';
import { ProjectController } from '../controllers/ProjectController.js';
import { ReleaseController } from '../controllers/ReleaseController.js';
import { ProofGateController } from '../controllers/ProofGateController.js';
import type { ReconcileReason, ReconcileResult } from '../reconciliation/types.js';

const CONTROLLERS = new Map<string, BaseController>([
  ['CheckRunController',        new CheckRunController()],
  ['ChangeProposalController',  new ChangeProposalController()],
  ['MissionController',         new MissionController()],
  ['ProjectController',         new ProjectController()],
  ['ReleaseController',         new ReleaseController()],
  ['ProofGateController',       new ProofGateController()],
  // ManifestController added in Milestone C
]);

const MAX_ATTEMPTS = 5;
let running = false;

async function writeReconciliationRun(
  item: { projectId: string; controller: string; resourceId: string | null; reason: string },
  result: ReconcileResult,
  startedAt: Date,
): Promise<void> {
  try {
    await supabase.from('reconciliation_runs').insert({
      project_id: item.projectId,
      controller: item.controller,
      resource_id: item.resourceId,
      reason: item.reason,
      status: result.status,
      observed_changes: result.observedChanges,
      proposed_actions: result.proposedActions,
      evidence_ids: result.evidenceIds,
      requires_approval: result.requiresApproval,
      message: result.message ?? null,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch {
    // Audit log failure must not crash the worker
  }
}

export async function runReconcilerCycle(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const items = await claimWork();
    if (!items.length) return;

    await Promise.all(
      items.map(async (item) => {
        const controller = CONTROLLERS.get(item.controller);

        if (!controller) {
          await failWork(item.id, `Unknown controller: ${item.controller}`);
          return;
        }

        const startedAt = new Date();

        try {
          const result = await controller.run({
            projectId: item.projectId,
            resourceId: item.resourceId ?? undefined,
            reason: item.reason as ReconcileReason,
            attempt: item.attempt,
            sourceEventId: item.sourceEventId ?? undefined,
          });

          await writeReconciliationRun(item, result, startedAt);

          if (result.status === 'retry' && result.retryAfter) {
            const { enqueueReconcile } = await import('../events/outbox.js');
            await enqueueReconcile(
              {
                projectId: item.projectId,
                controller: item.controller,
                resourceId: item.resourceId ?? undefined,
                reason: item.reason as ReconcileReason,
                sourceEventId: item.sourceEventId ?? undefined,
              },
              { availableAt: result.retryAfter },
            );
          }

          await completeWork(item.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await writeReconciliationRun(
            item,
            {
              status: 'retry',
              observedChanges: [],
              proposedActions: [],
              evidenceIds: [],
              requiresApproval: false,
              message: msg,
            },
            startedAt,
          );
          await failWork(item.id, msg);
        }
      }),
    );
  } finally {
    running = false;
  }
}
