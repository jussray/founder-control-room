/**
 * Cloudflare Workers entry point.
 *
 * Bridges Workers Request/Response ↔ existing Express app.
 * Uses nodejs_compat flag — no route changes needed.
 *
 * fetch handler  — serves HTTP requests
 * scheduled handler — wired to runReconcilerCycle() for Cron Triggers
 */

import type { ExportedHandler, ScheduledEvent, ExecutionContext } from '@cloudflare/workers-types';
import { makeSupabaseClient } from '../lib/supabaseClient.js';
import { runReconcilerCycle } from './reconciler.js';

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

let appReady = false;

function injectEnv(env: WorkerEnv): void {
  if (appReady) return;
  // Bridge Workers env bindings → process.env for existing Node middleware
  Object.assign(process.env, {
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    GITHUB_WEBHOOK_SECRET: env.GITHUB_WEBHOOK_SECRET,
    GITHUB_APP_ID: env.GITHUB_APP_ID,
    GITHUB_PRIVATE_KEY: env.GITHUB_PRIVATE_KEY,
    FOUNDER_ALLOWED_ORIGINS: env.FOUNDER_ALLOWED_ORIGINS,
    FOUNDER_API_URL: env.FOUNDER_API_URL,
  });
  appReady = true;
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    injectEnv(env);

    // Lazy import so the Express app initialises after env is injected
    const { createServer } = await import('../http/server.js');
    const app = createServer();

    return new Promise<Response>((resolve, reject) => {
      // Convert Workers Request → Node IncomingMessage-compatible object
      const url = new URL(request.url);
      const nodeReq = Object.assign(request, {
        url: url.pathname + url.search,
        method: request.method,
      });

      // Capture Express response via a mock ServerResponse
      const chunks: Uint8Array[] = [];
      const headers: Record<string, string> = {};
      let statusCode = 200;

      const nodeRes = {
        statusCode,
        setHeader: (k: string, v: string) => { headers[k] = v; },
        getHeader: (k: string) => headers[k],
        end: (body: string | Uint8Array) => {
          const bodyBytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
          if (bodyBytes) chunks.push(bodyBytes);
          const combined = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
          let offset = 0;
          for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
          resolve(new Response(combined, { status: nodeRes.statusCode, headers }));
        },
        write: (chunk: Uint8Array) => { chunks.push(chunk); },
      };

      try {
        // @ts-expect-error — duck-typed Node req/res
        app(nodeReq, nodeRes);
      } catch (err) {
        reject(err);
      }
    });
  },

  async scheduled(_event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    injectEnv(env);
    ctx.waitUntil(runReconcilerCycle());
  },
} satisfies ExportedHandler<WorkerEnv>;
