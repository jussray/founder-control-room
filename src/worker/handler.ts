import type { ExportedHandler } from '@cloudflare/workers-types';

export interface ControlRoomWorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN: string;
  FOUNDER_ALLOWED_ORIGINS: string;
  FOUNDER_API_URL: string;
  /** HMAC secret for POST /ingest/repository-verification. Optional — that route 401s without it. */
  REPOSITORY_INGEST_SECRET?: string;
}

interface ReconcilerModule {
  runReconcilerCycle(): Promise<void>;
}

type ReconcilerLoader = () => Promise<ReconcilerModule>;

const REQUIRED_BINDINGS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_TOKEN',
  'FOUNDER_ALLOWED_ORIGINS',
  'FOUNDER_API_URL',
] as const satisfies readonly (keyof ControlRoomWorkerEnv)[];

/** Fail closed before importing environment-backed application modules. */
export function validateWorkerEnv(
  env: Partial<Record<keyof ControlRoomWorkerEnv, unknown>>,
): asserts env is ControlRoomWorkerEnv {
  const missing = REQUIRED_BINDINGS.filter((name) => {
    const value = env[name];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length) {
    throw new Error(`Missing required Worker bindings: ${missing.join(', ')}`);
  }

  // The complete-key check above is runtime proof that every required value is
  // a non-empty string. TypeScript cannot derive that fact through the dynamic
  // key iteration, so narrow once at this boundary.
  const validated = env as ControlRoomWorkerEnv;

  try {
    new URL(validated.SUPABASE_URL);
    new URL(validated.FOUNDER_API_URL);
  } catch {
    throw new Error('SUPABASE_URL and FOUNDER_API_URL must be absolute URLs');
  }

  const origins = validated.FOUNDER_ALLOWED_ORIGINS
    .split(',')
    .map((value: string) => value.trim());
  if (!origins.length || origins.some((origin: string) => {
    try {
      return new URL(origin).origin !== origin.replace(/\/$/, '');
    } catch {
      return true;
    }
  })) {
    throw new Error('FOUNDER_ALLOWED_ORIGINS must contain comma-separated absolute origins');
  }
}

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
