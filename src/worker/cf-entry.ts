/**
 * Cloudflare Workers entry point.
 *
 * Express runs behind Cloudflare's supported Node HTTP server adapter. The
 * scheduled handler shares the same Worker entry point and lazily loads the
 * reconciliation loop only when a cron event arrives.
 */

import { httpServerHandler } from 'cloudflare:node';
import { createServer as createNodeHttpServer } from 'node:http';
import type { ExportedHandler } from '@cloudflare/workers-types';
import { createServer as createExpressApp } from '../http/server.js';
import { composeWorkerHandler } from './handler.js';

interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  FOUNDER_ALLOWED_ORIGINS: string;
  FOUNDER_API_URL: string;
}

// With nodejs_compat and a compatibility date after 2025-04-01, Cloudflare
// populates text bindings and secrets into process.env before application code
// first reads them. This allows existing server-owned clients to initialize
// without copying per-request bindings into isolate-global mutable state.
const app = createExpressApp();
const nodeServer = createNodeHttpServer(app);
const httpHandler = httpServerHandler(nodeServer) as ExportedHandler<WorkerEnv>;

export default composeWorkerHandler(
  httpHandler,
  () => import('./reconciler.js'),
);
