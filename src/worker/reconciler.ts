/**
 * Outbox worker.
 *
 * Polls the controller_outbox, claims work atomically, dispatches to the
 * correct controller, marks complete or failed.
 *
 * Both event-triggered and periodic-resync paths call the same controllers.
 * No separate code path exists for webhooks vs schedules.
 */

import { claimWork, completeWork, failWork } from '../events/outbox.js';
import { BaseController } from '../controllers/base.js';
import { CheckRunController } from '../controllers/CheckRunController.js';
import { MissionController } from '../controllers/MissionController.js';
import { ProjectController } from '../controllers/ProjectController.js';
import type { ReconcileReason } from '../reconciliation/types.js';

const CONTROLLERS = new Map<string, BaseController>([
  ['CheckRunController', new CheckRunController()],
  ['MissionController', new MissionController()],
  ['ProjectController', new ProjectController()],
  // ChangeProposalController, ReleaseController etc. added in subsequent milestones
]);

const MAX_ATTEMPTS = 5;
let running = false;

export async function runReconcilerCycle(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const items = await claimWork(20);
    if (items.length === 0) return;

    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      worker: 'reconciler',
      claimed: items.length,
    }));

    await Promise.allSettled(
      items.map(async (item) => {
        if (item.attemptCount >= MAX_ATTEMPTS) {
          await failWork(item.id, 'max attempts exceeded');
          return;
        }

        const controller = CONTROLLERS.get(item.controller);
        if (!controller) {
          await failWork(item.id, `Unknown controller: ${item.controller}`);
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

          if (result.status === 'retry' && result.retryAfter) {
            // Re-enqueue with delay rather than marking failed
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
            await completeWork(item.id);
          } else {
            await completeWork(item.id);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await failWork(item.id, msg);
        }
      }),
    );
  } finally {
    running = false;
  }
}
