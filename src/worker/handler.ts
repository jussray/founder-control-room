import type { ExportedHandler } from '@cloudflare/workers-types';
import { V10_CAPABILITY_PLAN_CONTRACT } from '../founder-os-lab/capabilityKernel.js';
import { FOUNDER_CONVEYOR_CONTRACT } from '../lib/founderConveyorReceipt.js';
import {
  FCR_EMAIL_FROM,
  isProjectEmailBinding,
  type ProjectEmailBinding,
} from './projectEmail.js';

export interface ControlRoomWorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_PROJECT_REF: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  FOUNDER_SESSION_ENCRYPTION_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  /** Preferred production GitHub authentication. Must be configured as a pair. */
  GITHUB_APP_ID?: string;
  GITHUB_PRIVATE_KEY?: string;
  /** Local/development fallback when GitHub App credentials are unavailable. */
  GITHUB_TOKEN?: string;
  FOUNDER_ALLOWED_ORIGINS: string;
  FOUNDER_API_URL: string;
  FCR_EMAIL: ProjectEmailBinding;
  FCR_EMAIL_FROM: string;
  FCR_V10_CAPABILITY_PLAN_CONTRACT: string;
  FCR_V10_CONVEYOR_CONTRACT: string;
  FCR_V10_MAX_RUNTIME_AUTHORITY: string;
  FCR_V10_REGISTRY_RESOLUTION_REQUIRED: string;
  FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: string;
  /** HMAC secret for POST /ingest/repository-verification. Optional — that route 401s without it. */
  REPOSITORY_INGEST_SECRET?: string;
}

interface ReconcilerModule {
  runReconcilerCycle(): Promise<void>;
}

type ReconcilerLoader = () => Promise<ReconcilerModule>;

const REQUIRED_STRING_BINDINGS = [
  'SUPABASE_URL',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'FOUNDER_SESSION_ENCRYPTION_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'FOUNDER_ALLOWED_ORIGINS',
  'FOUNDER_API_URL',
  'FCR_EMAIL_FROM',
  'FCR_V10_CAPABILITY_PLAN_CONTRACT',
  'FCR_V10_CONVEYOR_CONTRACT',
  'FCR_V10_MAX_RUNTIME_AUTHORITY',
  'FCR_V10_REGISTRY_RESOLUTION_REQUIRED',
  'FCR_V10_RECEIPT_PERSISTENCE_REQUIRED',
] as const satisfies readonly (keyof ControlRoomWorkerEnv)[];

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Fail closed before importing environment-backed application modules. */
export function validateWorkerEnv(
  env: Partial<Record<keyof ControlRoomWorkerEnv, unknown>>,
): asserts env is ControlRoomWorkerEnv {
  const missing = REQUIRED_STRING_BINDINGS.filter((name) => !hasNonEmptyString(env[name]));

  if (missing.length) {
    throw new Error(`Missing required Worker bindings: ${missing.join(', ')}`);
  }

  if (!isProjectEmailBinding(env.FCR_EMAIL)) {
    throw new Error('Missing required Worker binding: FCR_EMAIL');
  }

  const hasGitHubToken = hasNonEmptyString(env.GITHUB_TOKEN);
  const hasGitHubAppId = hasNonEmptyString(env.GITHUB_APP_ID);
  const hasGitHubPrivateKey = hasNonEmptyString(env.GITHUB_PRIVATE_KEY);

  if (!hasGitHubToken && !hasGitHubAppId && !hasGitHubPrivateKey) {
    throw new Error(
      'GitHub authentication is not configured; set GITHUB_APP_ID and GITHUB_PRIVATE_KEY or GITHUB_TOKEN',
    );
  }

  if (hasGitHubAppId !== hasGitHubPrivateKey) {
    throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY must be configured together');
  }

  // The complete-key check above is runtime proof that every required value is
  // a non-empty string. TypeScript cannot derive that fact through the dynamic
  // key iteration, so narrow once at this boundary.
  const validated = env as ControlRoomWorkerEnv;

  const founderSessionKey = validated.FOUNDER_SESSION_ENCRYPTION_KEY.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(founderSessionKey)) {
    throw new Error(
      'FOUNDER_SESSION_ENCRYPTION_KEY must be 43-character unpadded base64url',
    );
  }
  if (Buffer.from(founderSessionKey, 'base64url').length !== 32) {
    throw new Error('FOUNDER_SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  if (validated.FCR_EMAIL_FROM !== FCR_EMAIL_FROM) {
    throw new Error('FCR_EMAIL_FROM must match the checked-in Founder Control Room sender identity');
  }

  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(validated.SUPABASE_URL);
    new URL(validated.FOUNDER_API_URL);
  } catch {
    throw new Error('SUPABASE_URL and FOUNDER_API_URL must be absolute URLs');
  }

  const projectRef = validated.SUPABASE_PROJECT_REF.trim();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('SUPABASE_PROJECT_REF must be a 20-character Supabase project ref');
  }
  if (supabaseUrl.protocol !== 'https:' || supabaseUrl.hostname !== `${projectRef}.supabase.co`) {
    throw new Error('SUPABASE_URL must match SUPABASE_PROJECT_REF on the Supabase HTTPS origin');
  }

  if (validated.FCR_V10_CAPABILITY_PLAN_CONTRACT !== V10_CAPABILITY_PLAN_CONTRACT) {
    throw new Error('Worker V10 capability-plan contract does not match checked-in runtime contract');
  }
  if (validated.FCR_V10_CONVEYOR_CONTRACT !== FOUNDER_CONVEYOR_CONTRACT) {
    throw new Error('Worker V10 conveyor contract does not match checked-in runtime contract');
  }
  if (validated.FCR_V10_MAX_RUNTIME_AUTHORITY !== 'draft') {
    throw new Error('Worker V10 runtime authority must remain capped at draft before trusted registry promotion');
  }
  if (validated.FCR_V10_REGISTRY_RESOLUTION_REQUIRED !== 'true') {
    throw new Error('Worker V10 runtime must require trusted registry resolution before L1+ promotion');
  }
  if (validated.FCR_V10_RECEIPT_PERSISTENCE_REQUIRED !== 'true') {
    throw new Error('Worker V10 runtime must persist accepted conveyor receipts to the Supabase audit ledger');
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

type WorkerResponse = Awaited<ReturnType<NonNullable<ExportedHandler<unknown>['fetch']>>>;

const SERVICE_IDENTITY_HEADER = 'X-Founder-Control-Room-Service';
const SERVICE_IDENTITY = 'founder-control-room';

function withServiceIdentity(response: WorkerResponse): WorkerResponse {
  const headers = new Headers(response.headers);
  headers.set(SERVICE_IDENTITY_HEADER, SERVICE_IDENTITY);

  return new Response(response.body as unknown as ConstructorParameters<typeof Response>[0], {
    status: response.status,
    statusText: response.statusText,
    headers,
  }) as unknown as WorkerResponse;
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
    async fetch(request, env, ctx) {
      const response = await httpFetch.call(httpHandler, request, env, ctx);
      return withServiceIdentity(response);
    },

    async scheduled(_controller, _env, ctx) {
      const { runReconcilerCycle } = await loadReconciler();
      ctx.waitUntil(runReconcilerCycle());
    },
  };
}
