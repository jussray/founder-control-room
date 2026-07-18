import type { ExportedHandler } from '@cloudflare/workers-types';
import { createServer as createHttpServer, type Server } from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { runReconcilerCycle } from './reconciler.js';

interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  FOUNDER_ALLOWED_ORIGINS: string;
  FOUNDER_API_URL: string;
}

const INTERNAL_PORT = 8787;
let appReady = false;
let nodeServer: Server | null = null;
let serverPromise: Promise<Server> | null = null;

function injectEnv(env: WorkerEnv): void {
  if (appReady) return;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
  if (!publishableKey) {
    throw new Error('Worker is missing SUPABASE_PUBLISHABLE_KEY.');
  }

  Object.assign(process.env, {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    GITHUB_WEBHOOK_SECRET: env.GITHUB_WEBHOOK_SECRET,
    GITHUB_APP_ID: env.GITHUB_APP_ID,
    GITHUB_PRIVATE_KEY: env.GITHUB_PRIVATE_KEY,
    FOUNDER_ALLOWED_ORIGINS: env.FOUNDER_ALLOWED_ORIGINS,
    FOUNDER_API_URL: env.FOUNDER_API_URL,
  });
  appReady = true;
}

async function ensureNodeServer(env: WorkerEnv): Promise<Server> {
  injectEnv(env);
  if (nodeServer) return nodeServer;
  if (serverPromise) return serverPromise;

  serverPromise = (async () => {
    const { createServer } = await import('../http/server.js');
    const server = createHttpServer(createServer());
    server.listen(INTERNAL_PORT);
    nodeServer = server;
    return server;
  })();

  try {
    return await serverPromise;
  } finally {
    serverPromise = null;
  }
}

const handler: ExportedHandler<WorkerEnv> = {
  async fetch(request, env) {
    await ensureNodeServer(env);
    return handleAsNodeRequest(INTERNAL_PORT, request);
  },

  async scheduled(_controller, env, ctx) {
    injectEnv(env);
    ctx.waitUntil(runReconcilerCycle());
  },
};

export default handler;
