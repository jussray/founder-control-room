import type { ExportedHandler } from '@cloudflare/workers-types';

interface ReconcilerModule {
  runReconcilerCycle(): Promise<void>;
}

type ReconcilerLoader = () => Promise<ReconcilerModule>;

/**
 * Combine Cloudflare's supported Node HTTP adapter with the scheduled
 * reconciliation callback. The reconciler remains lazy so HTTP-only isolates
 * do not initialize the control loop until a cron event actually arrives.
 */
export function composeWorkerHandler<Env>(
  httpHandler: ExportedHandler<Env>,
  loadReconciler: ReconcilerLoader,
): ExportedHandler<Env> {
  const httpFetch = httpHandler.fetch;
  if (!httpFetch) throw new Error('Cloudflare HTTP handler is missing fetch');

  return {
    fetch(request, env, ctx) {
      return httpFetch.call(httpHandler, request, env, ctx);
    },

    async scheduled(_controller, _env, ctx) {
      const { runReconcilerCycle } = await loadReconciler();
      ctx.waitUntil(runReconcilerCycle());
    },
  };
}
