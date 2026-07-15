/**
 * Cloudflare Workers entry point.
 *
 * Express runs behind Cloudflare's supported Node HTTP server adapter. The
 * scheduled handler shares the same Worker entry point and lazily loads the
 * reconciliation loop only when a cron event arrives, enqueueing due
 * portfolio repository verification first so the same cycle picks it up.
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

// Validate runtime bindings before importing application modules that create
// environment-backed Supabase and authentication clients.
validateWorkerEnv(env);

// Cloudflare populates text bindings and secrets into process.env when
// nodejs_compat is enabled with this compatibility date. Importing only after
// validation makes the dependency order explicit and fail-closed.
const { createServer: createExpressApp } = await import('../http/server.js');
const app = createExpressApp();
const nodeServer = createNodeHttpServer(app);
const httpHandler = httpServerHandler(nodeServer) as ExportedHandler<ControlRoomWorkerEnv>;

export default composeWorkerHandler(
  httpHandler,
  async () => {
    const [{ runReconcilerCycle }] = await Promise.all([
      import('./reconciler.js'),
      import('../services/portfolioVerificationScheduler.js').then((mod) =>
        mod.enqueueDuePortfolioVerification(),
      ),
    ]);
    return { runReconcilerCycle };
  },
);
