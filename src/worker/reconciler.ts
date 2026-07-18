/**
 * Reconciler
 *
 * Polls the controller_outbox, claims work atomically, dispatches to the
 * correct controller, and atomically finalizes work with its source event.
 * Writes a reconciliation_runs audit row for every execution.
 *
 * Both event-triggered and periodic-resync paths call the same controllers.
 * No separate code path exists for webhooks vs schedules.
 */

import {
  abandonWork,
  claimWork,
  completeWork,
  failWork,
  type ClaimedWork,
} from '../events/outbox.js';
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
    // Audit log failure must not crash or duplicate controller execution.
  }
}

function terminalResult(message: string): ReconcileResult {
  return {
    status: 'blocked',
    observedChanges: [],
    proposedActions: [],
    evidenceIds: [],
    requiresApproval: false,
    message,
  };
}

function retryLimitReached(item: ClaimedWork): boolean {
  return item.attemptCount + 1 >= MAX_ATTEMPTS;
}

async function abandonTerminally(
  item: ClaimedWork,
  message: string,
  startedAt: Date,
): Promise<void> {
  const finalMessage = `Terminal reconciliation failure after ${item.attemptCount + 1} attempt(s): ${message}`;
  await writeReconciliationRun(item, terminalResult(finalMessage), startedAt);
  await abandonWork(item.id, item.sourceEventId, finalMessage);
}

export async function runReconcilerCycle(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const items = await claimWork();
    if (!items.length) return;

    await Promise.all(
      items.map(async (item) => {
        const startedAt = new Date();
        const controller = CONTROLLERS.get(item.controller);

        if (!controller) {
          await abandonTerminally(item, `Unknown controller: ${item.controller}`, startedAt);
          return;
        }

        try {
          const result = await controller.run({
            projectId: item.projectId,
            controller: item.controller,
            resourceId: item.resourceId ?? undefined,
            reason: item.reason as ReconcileReason,
            sourceEventId: item.sourceEventId ?? undefined,
          });

          if (result.status === 'retry') {
            const retryMessage = result.message ?? 'Controller requested retry';
            if (retryLimitReached(item)) {
              await abandonTerminally(item, retryMessage, startedAt);
            } else {
              await writeReconciliationRun(item, result, startedAt);
              await failWork(item.id, retryMessage);
            }
            return;
          }

          await writeReconciliationRun(item, result, startedAt);
          await completeWork(item.id, item.sourceEventId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);

          if (retryLimitReached(item)) {
            await abandonTerminally(item, message, startedAt);
          } else {
            await writeReconciliationRun(
              item,
              {
                status: 'retry',
                observedChanges: [],
                proposedActions: [],
                evidenceIds: [],
                requiresApproval: false,
                message,
              },
              startedAt,
            );
            await failWork(item.id, message);
          }
        }
      }),
    );
  } finally {
    running = false;
  }
}
