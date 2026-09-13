/**
 * Cloudflare Workers entry point.
 *
 * Express runs behind Cloudflare's supported Node HTTP server adapter. The
 * scheduled handler shares the same Worker entry point and lazily loads the
 * reconciliation loop only when a cron event arrives.
 */
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createServer as createNodeHttpServer } from 'node:http';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { composeWorkerHandler, validateWorkerEnv, type ControlRoomWorkerEnv } from './handler.js';
import { handleFederatedRelayV31Worker } from './federatedRelayV31.js';

export { ReleaseProofWorkflowV0 } from '../workflows/releaseProofWorkflow.js';

validateWorkerEnv(env);
const { createServer: createExpressApp } = await import('../http/server.js');
const app = createExpressApp();
const nodeServer = createNodeHttpServer(app);
const httpHandler = httpServerHandler(nodeServer) as ExportedHandler<ControlRoomWorkerEnv>;
const baseHandler = composeWorkerHandler(
  httpHandler,
  async () => {
    const [{ runReconcilerCycle }, { enqueueDuePortfolioVerification }, { runExternalUseHourlyCycle }] = await Promise.all([
      import('./reconciler.js'),
      import('../services/portfolioVerificationScheduler.js'),
      import('../external-use/service.js'),
    ]);
    return {
      runReconcilerCycle: async () => {
        await enqueueDuePortfolioVerification();
        const [reconcilerResult] = await Promise.allSettled([runReconcilerCycle(), runExternalUseHourlyCycle()]);
        if (reconcilerResult.status === 'rejected') throw reconcilerResult.reason;
      },
    };
  },
);

const baseFetch = baseHandler.fetch;
const baseScheduled = baseHandler.scheduled;
if (!baseFetch) throw new Error('Cloudflare HTTP handler is missing fetch');

export default {
  async fetch(request, workerEnv, ctx) {
    if (new URL(request.url).pathname === '/api/federated-relay') {
      return handleFederatedRelayV31Worker(request, workerEnv);
    }
    return baseFetch.call(baseHandler, request, workerEnv, ctx);
  },
  async scheduled(controller, workerEnv, ctx) {
    if (!baseScheduled) return;
    return baseScheduled.call(baseHandler, controller, workerEnv, ctx);
  },
} satisfies ExportedHandler<ControlRoomWorkerEnv>;
