/**
 * Cloudflare Workers entry point.
 *
 * Express runs behind Cloudflare's supported Node HTTP server adapter. The
 * scheduled handler shares the same Worker entry point and lazily loads the
 * reconciliation loop only when a cron event arrives. Each cron tick publishes
 * the exact Cloudflare runtime identity into the durable provider inbox,
 * enqueues due repository verification, runs reconciliation, lets the
 * idempotent external-use scheduler claim at most one hourly search-and-email
 * digest, and runs the bounded Juss & Co public-coverage watch when its cadence
 * is due. HTTP routes include signed provider webhooks and repository
 * verification pings. The Bip proof ingress stays at the Worker edge because
 * it needs the private Chief service binding as well as GitHub OIDC verification.
 */

import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import express from 'express';
import { createServer as createNodeHttpServer } from 'node:http';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { mountFcrCommerceIngress } from '../http/fcrCommerceIngress.js';
import {
  BIP_PROOF_INGRESS_PATH,
  handleBipControlRoomProofIngress,
} from './bipChiefEvidenceIngress.js';
import {
  composeWorkerHandler,
  validateWorkerEnv,
  type ControlRoomWorkerEnv,
} from './handler.js';
import { assertScheduledTaskResults } from './scheduledTaskResults.js';

export { ReleaseProofWorkflowV0 } from '../workflows/releaseProofWorkflow.js';

validateWorkerEnv(env);

const { createServer: createExpressApp } = await import('../http/server.js');
const app = express();
mountFcrCommerceIngress(app);
app.use(createExpressApp({ chiefAiBinding: env.CHIEF_AI }));
const nodeServer = createNodeHttpServer(app);
const httpHandler = httpServerHandler(nodeServer) as ExportedHandler<ControlRoomWorkerEnv>;

const composed = composeWorkerHandler(
  httpHandler,
  async () => {
    const [
      { runReconcilerCycle },
      { enqueueDuePortfolioVerification },
      { runExternalUseHourlyCycle },
      { runPublicCoverageWatchCycle },
      { publishCloudflareRuntimeSignal },
      { reconcileGmailProjectFilingFilters },
    ] = await Promise.all([
      import('./reconciler.js'),
      import('../services/portfolioVerificationScheduler.js'),
      import('../external-use/service.js'),
      import('../external-use/publicCoverageService.js'),
      import('./cloudflareRuntimeSignal.js'),
      import('../lib/growthInboxReply.js'),
    ]);

    return {
      runReconcilerCycle: async () => {
        await enqueueDuePortfolioVerification();
        const [
          reconcilerResult,
          externalUseResult,
          publicCoverageResult,
          cloudflareRuntimeSignalResult,
          gmailProjectFilingResult,
        ] = await Promise.allSettled([
          runReconcilerCycle(),
          runExternalUseHourlyCycle(),
          runPublicCoverageWatchCycle(),
          publishCloudflareRuntimeSignal(),
          reconcileGmailProjectFilingFilters(),
        ]);
        assertScheduledTaskResults([
          { name: 'reconciler', result: reconcilerResult },
          { name: 'external-use', result: externalUseResult },
          { name: 'public-coverage', result: publicCoverageResult },
          { name: 'cloudflare-runtime-signal', result: cloudflareRuntimeSignalResult },
          { name: 'gmail-project-filing', result: gmailProjectFilingResult },
        ]);
      },
    };
  },
);

const composedFetch = composed.fetch;
if (!composedFetch) throw new Error('Cloudflare HTTP handler is missing fetch');

const worker: ExportedHandler<ControlRoomWorkerEnv> = {
  async fetch(request, workerEnv, ctx) {
    const url = new URL(request.url);
    if (url.pathname === BIP_PROOF_INGRESS_PATH) {
      return handleBipControlRoomProofIngress(request, workerEnv);
    }
    return composedFetch.call(composed, request, workerEnv, ctx);
  },
  scheduled: composed.scheduled,
};

export default worker;