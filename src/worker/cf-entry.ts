/**
 * cf-entry.ts — Cloudflare Workers entry point
 *
 * Wraps the existing Express app using nodejs_compat so no routes need
 * to change. Secrets arrive via Workers env bindings instead of process.env.
 *
 * To deploy:  npm run deploy
 * To dev:     npm run cf:dev
 */

import { createServer } from "../http/server.js";
import { runReconciler } from "./reconciler.js";

// ---------------------------------------------------------------------------
// Workers env bindings (set via `wrangler secret put`)
// ---------------------------------------------------------------------------
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_PRIVATE_KEY: string;
  FOUNDER_ALLOWED_ORIGINS: string;
  FOUNDER_API_URL: string;
  NODE_ENV: string;
}

// ---------------------------------------------------------------------------
// Fetch handler — forward all HTTP traffic to the Express app
// ---------------------------------------------------------------------------

// Cache the app across requests in the same isolate
let _app: ReturnType<typeof createServer> | null = null;

function getApp(env: Env) {
  if (!_app) {
    // Inject bindings into process.env so existing Express middleware
    // (supabaseClient, security.ts, etc.) can read them unchanged.
    // This is the bridge: Workers env → process.env → existing code.
    // Once all callers are migrated to accept `env` directly, remove this.
    process.env.SUPABASE_URL = env.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
    process.env.GITHUB_WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET;
    process.env.GITHUB_APP_ID = env.GITHUB_APP_ID;
    process.env.GITHUB_PRIVATE_KEY = env.GITHUB_PRIVATE_KEY;
    process.env.FOUNDER_ALLOWED_ORIGINS = env.FOUNDER_ALLOWED_ORIGINS;
    process.env.FOUNDER_API_URL = env.FOUNDER_API_URL;
    process.env.NODE_ENV = env.NODE_ENV ?? "production";
    _app = createServer();
  }
  return _app;
}

export default {
  // ----- HTTP handler --------------------------------------------------------
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = getApp(env);

    // Convert Workers Request → Node IncomingMessage + ServerResponse
    // nodejs_compat provides a `fetch`-compatible adapter automatically;
    // Express handles the rest via its own internal request parsing.
    return new Promise((resolve) => {
      const url = new URL(request.url);

      // Build a minimal Node-like req/res pair for Express
      // (nodejs_compat makes this work without a full Node HTTP server)
      const nodeReq = Object.assign(request, {
        url: url.pathname + url.search,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
      });

      const chunks: Uint8Array[] = [];
      const nodeRes = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
        },
        getHeader(name: string) {
          return this.headers[name.toLowerCase()];
        },
        removeHeader(name: string) {
          delete this.headers[name.toLowerCase()];
        },
        write(chunk: Uint8Array | string) {
          chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
        },
        end(chunk?: Uint8Array | string) {
          if (chunk) this.write(chunk);
          const body = chunks.length
            ? new Blob(chunks).stream()
            : null;
          resolve(
            new Response(body, {
              status: this.statusCode,
              headers: this.headers,
            })
          );
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app(nodeReq as any, nodeRes as any);
    });
  },

  // ----- Scheduled handler (Cron Triggers) -----------------------------------
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    getApp(env); // ensure env is injected before reconciler runs
    await runReconciler();
  },
} satisfies ExportedHandler<Env>;
