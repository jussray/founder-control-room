/**
 * Deletion Queue Worker
 * Deployed as Cloudflare Cron Trigger (every 6h)
 * Backs the account-deletion retention contract - 72h residual cleanup.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DeletionQueueEnv = Readonly<Record<string, string | undefined>>;

interface DeletionQueueEntry {
  id: string;
  user_id: string;
}

function requireBinding(env: DeletionQueueEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error('Missing deletion worker binding: ' + name);
  }
  return value;
}

export function createSupabaseAdmin(env: DeletionQueueEnv): SupabaseClient {
  return createClient(
    requireBinding(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    requireBinding(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function purgeCloudflareKV(
  userId: string,
  env: DeletionQueueEnv,
): Promise<void> {
  const namespaceIds = [
    env.CF_SESSIONS_KV_NAMESPACE_ID,
    env.CF_FEATURE_FLAGS_KV_NAMESPACE_ID,
  ].filter((namespaceId): namespaceId is string => Boolean(namespaceId?.trim()));

  if (namespaceIds.length === 0) return;

  const accountId = requireBinding(env, 'CF_ACCOUNT_ID');
  const apiToken = requireBinding(env, 'CF_API_TOKEN');
  const base =
    'https://api.cloudflare.com/client/v4/accounts/' +
    encodeURIComponent(accountId) +
    '/storage/kv/namespaces';
  const headers = { Authorization: 'Bearer ' + apiToken };
  const encodedUserId = encodeURIComponent(userId);

  const responses = await Promise.all(
    namespaceIds.map((namespaceId) =>
      fetch(
        base +
          '/' +
          encodeURIComponent(namespaceId) +
          '/values/' +
          encodedUserId,
        { method: 'DELETE', headers },
      ),
    ),
  );

  const failedResponse = responses.find((response) => !response.ok);
  if (failedResponse) {
    throw new Error(
      'Cloudflare KV purge failed with status ' + failedResponse.status,
    );
  }
}

async function processEntry(
  row: DeletionQueueEntry,
  supabaseAdmin: SupabaseClient,
  env: DeletionQueueEnv,
): Promise<void> {
  try {
    const { error: processingError } = await supabaseAdmin
      .from('deletion_queue')
      .update({ status: 'processing' })
      .eq('id', row.id);
    if (processingError) throw processingError;

    await purgeCloudflareKV(row.user_id, env);

    const { error: anonymizeError } = await supabaseAdmin.rpc(
      'anonymize_user_audit_logs',
      { p_user_id: row.user_id },
    );
    if (anonymizeError) throw anonymizeError;

    const { error: completedError } = await supabaseAdmin
      .from('deletion_queue')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', row.id);
    if (completedError) throw completedError;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown';
    await supabaseAdmin
      .from('deletion_queue')
      .update({ status: 'failed', error: message })
      .eq('id', row.id);
  }
}

export async function runDeletionWorker(
  env: DeletionQueueEnv,
): Promise<void> {
  const supabaseAdmin = createSupabaseAdmin(env);
  const { data, error } = await supabaseAdmin
    .from('deletion_queue')
    .select('id,user_id')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(50);

  if (error) throw error;

  const pending = (data ?? []) as DeletionQueueEntry[];
  if (pending.length === 0) return;

  await Promise.allSettled(
    pending.map((row) => processEntry(row, supabaseAdmin, env)),
  );
}

export default {
  async scheduled(_event: unknown, env: DeletionQueueEnv, _ctx: unknown) {
    await runDeletionWorker(env);
  },
};
