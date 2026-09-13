/**
 * Cloudflare Workers entry point.
 *
 * Express runs behind Cloudflare's supported Node HTTP server adapter. The
 * scheduled handler shares the same Worker entry point and lazily loads the
 * reconciliation loop only when a cron event arrives. Each cron tick enqueues
 * due repository verification, runs reconciliation, and lets the idempotent
 * external-use scheduler claim at most one hourly search-and-email digest.
 * HTTP routes include signed provider webhooks and repository verification
 * pings.
 */

import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import { createServer as createNodeHttpServer } from 'node:http';
import type { ExportedHandler } from '@cloudflare/workers-types';
import {
  composeWorkerHandler,
  validateWorkerEnv,
  type ControlRoomWorkerEnv,
} from './handler.js';
import { handleFederatedRelayV3WorkerRequest } from './federatedRelayV3.js';

export { ReleaseProofWorkflowV0 } from '../workflows/releaseProofWorkflow.js';

validateWorkerEnv(env);

const { createServer: createExpressApp } = await import('../http/server.js');
const app = createExpressApp();
const nodeServer = createNodeHttpServer(app);
const httpHandler = httpServerHandler(nodeServer) as ExportedHandler<ControlRoomWorkerEnv>;
const httpFetch = httpHandler.fetch;
if (!httpFetch) throw new Error('Cloudflare HTTP handler is missing fetch');

const relayAwareHttpHandler: ExportedHandler<ControlRoomWorkerEnv> = {
  async fetch(request, workerEnv, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/federated-relay/v3') {
      return handleFederatedRelayV3WorkerRequest(
        request,
        workerEnv as ControlRoomWorkerEnv & { GIT_SHA?: string },
      );
    }
    return httpFetch.call(httpHandler, request, workerEnv, ctx);
  },
};

export default composeWorkerHandler(
  relayAwareHttpHandler,
  async () => {
    const [
      { runReconcilerCycle },
      { enqueueDuePortfolioVerification },
      { runExternalUseHourlyCycle },
    ] = await Promise.all([
      import('./reconciler.js'),
      import('../services/portfolioVerificationScheduler.js'),
      import('../external-use/service.js'),
    ]);

    return {
      runReconcilerCycle: async () => {
        await enqueueDuePortfolioVerification();
        const [reconcilerResult] = await Promise.allSettled([
          runReconcilerCycle(),
          runExternalUseHourlyCycle(),
        ]);
        if (reconcilerResult.status === 'rejected') throw reconcilerResult.reason;
      },
    };
  },
);
