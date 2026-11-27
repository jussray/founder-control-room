/**
 * Cloudflare Workers entry point.
 *
 * Express runs behind Cloudflare's supported Node HTTP server adapter. The
 * scheduled handler shares the same Worker entry point and lazily loads the
 * reconciliation loop only when a cron event arrives. Each cron tick publishes
 * the exact Cloudflare runtime identity into the durable provider inbox,
 * enqueues due repository verification, runs reconciliation, lets the
 * idempotent external-use scheduler claim at most one hourly search-and-email
 * digest, runs the bounded Juss & Co public-coverage watch when its cadence
 * is due, runs the hourly AI-provider change watch and opt-in GitHub inbox watch, and sends one founder
 * portfolio orientation on the eligible Monday cron tick. HTTP routes include
 * signed provider webhooks and repository
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
      { runMondayPortfolioOrientationCycle },
      { publishCloudflareRuntimeSignal },
      { runAiProviderChangeWatchCycle },
      { runConfiguredGithubInboxWatch },
      { runFirecrawlMonitorCycle },
      { firecrawlEventStore },
      { supabase },
    ] = await Promise.all([
      import('./reconciler.js'),
      import('../services/portfolioVerificationScheduler.js'),
      import('../external-use/service.js'),
      import('../external-use/publicCoverageService.js'),
      import('../services/mondayPortfolioOrientation.js'),
      import('./cloudflareRuntimeSignal.js'),
      import('../external-use/aiProviderChangeWatchService.js'),
      import('../lib/githubInboxWatch.js'),
      import('../capabilities/firecrawlObservationRun.js'),
      import('../capabilities/firecrawlEventStore.js'),
      import('../lib/supabaseClient.js'),
    ]);

    return {
      runReconcilerCycle: async () => {
        await enqueueDuePortfolioVerification();
        const [
          reconcilerResult,
          externalUseResult,
          publicCoverageResult,
          mondayOrientationResult,
          cloudflareRuntimeSignalResult,
          aiProviderChangeWatchResult,
          firecrawlMonitorResult,
          githubInboxWatchResult,
        ] = await Promise.allSettled([
          runReconcilerCycle(),
          runExternalUseHourlyCycle(new Date(), (env as unknown as ControlRoomWorkerEnv).FCR_EMAIL),
          runPublicCoverageWatchCycle(),
          runMondayPortfolioOrientationCycle(env as unknown as ControlRoomWorkerEnv),
          publishCloudflareRuntimeSignal(),
          runAiProviderChangeWatchCycle(env as ControlRoomWorkerEnv),
          runFirecrawlMonitorCycle({ env: process.env, store: firecrawlEventStore(supabase) }).then(result => {
            if (result.status === 'attempted') console.log(JSON.stringify({ task: 'firecrawl-monitor', ...result }));
            return result;
          }),
          runConfiguredGithubInboxWatch().then((result) => {
            if (result.status !== 'skipped') console.log(JSON.stringify({ task: 'github-inbox-watch', ...result }));
            if (result.status === 'blocked') throw new Error('github_inbox_watch_blocked:' + result.reason);
            return result;
          }),
        ]);
        assertScheduledTaskResults([
          { name: 'reconciler', result: reconcilerResult },
          { name: 'external-use', result: externalUseResult },
          { name: 'public-coverage', result: publicCoverageResult },
          { name: 'monday-portfolio-orientation', result: mondayOrientationResult },
          { name: 'cloudflare-runtime-signal', result: cloudflareRuntimeSignalResult },
          { name: 'ai-provider-change-watch', result: aiProviderChangeWatchResult },
          { name: 'github-inbox-watch', result: githubInboxWatchResult },
          { name: 'firecrawl-monitor', result: firecrawlMonitorResult },
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
