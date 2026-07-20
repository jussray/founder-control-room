/**
 * Deletion Queue Worker
 * Deployed as Cloudflare Cron Trigger (every 6h)
 * Backs docs/compliance/ACCOUNT_DELETION.md - 72h residual cleanup
 */
import { createClient } from '@supabase/supabase-js';

interface Env {
  [key: string]: string | undefined;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function purgeCloudflareKV(userId: string): Promise<void> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/storage/kv/namespaces`;
  const headers = { Authorization: `Bearer ${process.env.CF_API_TOKEN}` };
  for (const nsId of [
    process.env.CF_SESSIONS_KV_NAMESPACE_ID,
    process.env.CF_FEATURE_FLAGS_KV_NAMESPACE_ID,
  ]) {
    if (!nsId) continue;
    await fetch(`${base}/${nsId}/values/${userId}`, { method: 'DELETE', headers });
  }
}

async function processEntry(row: { id: string; user_id: string }): Promise<void> {
  await supabaseAdmin.from('deletion_queue').update({ status: 'processing' }).eq('id', row.id);
  try {
    await purgeCloudflareKV(row.user_id);
    await supabaseAdmin.rpc('anonymize_user_audit_logs', { p_user_id: row.user_id });
    await supabaseAdmin.from('deletion_queue')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', row.id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await supabaseAdmin.from('deletion_queue').update({ status: 'failed', error: msg }).eq('id', row.id);
  }
}

export async function runDeletionWorker(): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from('deletion_queue').select('id,user_id').eq('status', 'pending')
    .order('requested_at', { ascending: true }).limit(50);
  if (!pending?.length) return;
  await Promise.allSettled(pending.map(processEntry));
}

export default {
  async scheduled(_event: unknown, _env: Env, _ctx: unknown) {
    await runDeletionWorker();
  },
};
