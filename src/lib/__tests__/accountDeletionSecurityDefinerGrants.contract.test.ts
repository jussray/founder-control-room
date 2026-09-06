import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260906002000_harden_account_deletion_security_definer_execute.sql',
);
const accountDeletePath = path.resolve(process.cwd(), 'src/api/account/delete.ts');
const deletionWorkerPath = path.resolve(process.cwd(), 'src/workers/deletion-queue-worker.ts');
const cronPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260719221000_pg_cron_purge_devices.sql',
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const accountDelete = fs.readFileSync(accountDeletePath, 'utf8');
const deletionWorker = fs.readFileSync(deletionWorkerPath, 'utf8');
const cronSql = fs.readFileSync(cronPath, 'utf8');

describe('account deletion SECURITY DEFINER execute boundary', () => {
  it('revokes direct RPC execution from browser-facing roles', () => {
    expect(sql).toContain('revoke all on function public.anonymize_user_audit_logs(uuid)');
    expect(sql).toContain('revoke all on function public.purge_stale_devices()');

    const revokeTargets = sql.match(/from public, anon, authenticated;/g) ?? [];
    expect(revokeTargets).toHaveLength(2);

    expect(sql).not.toMatch(/grant\s+execute[^;]*\b(?:anon|authenticated)\b[^;]*;/i);
  });

  it('retains explicit service-role execution for server-owned maintenance', () => {
    expect(sql).toContain('grant execute on function public.anonymize_user_audit_logs(uuid)');
    expect(sql).toContain('grant execute on function public.purge_stale_devices()');

    const serviceRoleGrants = sql.match(/to service_role;/g) ?? [];
    expect(serviceRoleGrants).toHaveLength(2);

    expect(accountDelete).toContain("supabaseAdmin.rpc('anonymize_user_audit_logs'");
    expect(deletionWorker).toContain("'anonymize_user_audit_logs'");
  });

  it('preserves the cron maintenance path without granting browser authority', () => {
    expect(cronSql).toContain('SELECT public.purge_stale_devices();');
    expect(sql).not.toMatch(/to\s+(?:public|anon|authenticated)\s*;/i);
  });

  it('states that the repository implant does not claim a production apply', () => {
    expect(sql).toContain('This migration is source-only until an explicitly authorized production apply.');
    expect(sql).toContain('Committing it performs no provider or production database mutation.');
  });
});
