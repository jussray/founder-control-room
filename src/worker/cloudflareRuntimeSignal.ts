import { persistProviderEvent, type InboxResult, type RawProviderEvent } from '../events/inbox.js';
import { enqueueReconcile } from '../events/outbox.js';
import { supabase } from '../lib/supabaseClient.js';
import type { ReconcileRequest } from '../reconciliation/types.js';

export const CLOUDFLARE_RUNTIME_SIGNAL_CONTRACT =
  'founder-control-room/cloudflare-runtime-observed@v1' as const;

const FCR_PROJECT_SLUG = 'founder-control-room';
const FCR_WORKER_RESOURCE_ID = 'founder-control-room';
const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/;

export interface CloudflareRuntimeSignalInput {
  gitSha?: string;
  environment?: string;
}

export type CloudflareRuntimeSignalResult =
  | { status: 'stored' | 'duplicate'; eventId: string; gitSha: string }
  | { status: 'skipped'; reason: 'runtime_sha_unavailable' | 'project_unavailable' };

interface CloudflareRuntimeSignalDependencies {
  resolveProjectId(): Promise<string | null>;
  persistEvent(event: RawProviderEvent): Promise<InboxResult>;
  enqueue(entry: ReconcileRequest): Promise<string>;
}

async function resolveFounderControlRoomProjectId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', FCR_PROJECT_SLUG)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new Error(`cloudflare_runtime_signal_project_lookup_failed:${error.message}`);
  }

  return typeof data?.id === 'string' && data.id.length > 0 ? data.id : null;
}

const DEFAULT_DEPENDENCIES: CloudflareRuntimeSignalDependencies = {
  resolveProjectId: resolveFounderControlRoomProjectId,
  persistEvent: persistProviderEvent,
  enqueue: enqueueReconcile,
};

/**
 * Publish one durable runtime observation for the exact FCR Worker commit.
 *
 * The Cloudflare scheduled runtime is the execution witness. The payload is
 * intentionally bounded to runtime identity only: no request data, provider
 * credentials, or mutable Cloudflare account metadata enters the signal bus.
 * Provider-event dedupe makes the observation one receipt per exact SHA.
 */
export async function publishCloudflareRuntimeSignal(
  input: CloudflareRuntimeSignalInput = {},
  dependencies: CloudflareRuntimeSignalDependencies = DEFAULT_DEPENDENCIES,
): Promise<CloudflareRuntimeSignalResult> {
  const gitSha = (input.gitSha ?? process.env.GIT_SHA ?? '').trim().toLowerCase();
  if (!EXACT_COMMIT_SHA.test(gitSha)) {
    return { status: 'skipped', reason: 'runtime_sha_unavailable' };
  }

  const projectId = await dependencies.resolveProjectId();
  if (!projectId) {
    return { status: 'skipped', reason: 'project_unavailable' };
  }

  const environment = (input.environment ?? process.env.ENVIRONMENT ?? 'unknown').trim() || 'unknown';
  const inboxResult = await dependencies.persistEvent({
    provider: 'cloudflare',
    projectId,
    providerEventId: `worker-runtime:${FCR_WORKER_RESOURCE_ID}:${gitSha}`,
    eventType: 'runtime_observed',
    resourceType: 'worker-deployment',
    resourceId: FCR_WORKER_RESOURCE_ID,
    payload: {
      contract: CLOUDFLARE_RUNTIME_SIGNAL_CONTRACT,
      service: FCR_PROJECT_SLUG,
      runtime: 'cloudflare-worker',
      environment,
      gitSha,
    },
  });

  if (!inboxResult.isDuplicate) {
    await dependencies.enqueue({
      projectId,
      controller: 'ProjectController',
      resourceId: FCR_PROJECT_SLUG,
      reason: 'provider_event',
      sourceEventId: inboxResult.id,
    });
  }

  return {
    status: inboxResult.isDuplicate ? 'duplicate' : 'stored',
    eventId: inboxResult.id,
    gitSha,
  };
}
