/**
 * Account deletion handler — backs docs/compliance/ACCOUNT_DELETION.md
 *
 * Flow:
 *  1. Soft-delete flag  -> prevents new logins immediately
 *  2. Global sign-out   -> revokes all active sessions
 *  3. Anonymize logs    -> actor_id -> NULL in audit_logs
 *  4. Queue hard-delete -> processed within 72h by worker
 *  5. Hard-delete auth  -> cascades FK-linked tables
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface DeleteAccountResult {
  success: boolean;
  deletedAt: string;
  error?: string;
}

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const deletedAt = new Date().toISOString();

  const { error: softErr } = await supabaseAdmin
    .from('profiles')
    .update({ deleted_at: deletedAt })
    .eq('id', userId);
  if (softErr) throw new Error(`soft-delete failed: ${softErr.message}`);

  const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(userId, 'global');
  if (signOutErr) throw new Error(`sign-out failed: ${signOutErr.message}`);

  await supabaseAdmin.rpc('anonymize_user_audit_logs', { p_user_id: userId });

  const { error: queueErr } = await supabaseAdmin
    .from('deletion_queue')
    .insert({ user_id: userId, status: 'pending' });
  if (queueErr) throw new Error(`queue insert failed: ${queueErr.message}`);

  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteErr) throw new Error(`auth delete failed: ${deleteErr.message}`);

  return { success: true, deletedAt };
}

export async function handleDeleteAccountRequest(
  request: Request,
  userId: string
): Promise<Response> {
  try {
    const result = await deleteAccount(userId);
    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
