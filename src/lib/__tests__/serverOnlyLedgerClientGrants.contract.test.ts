import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260919223000_revoke_server_only_ledger_client_grants.sql',
    import.meta.url,
  ),
  'utf8',
);

const serverOnlyTables = [
  'founder_signal_review_email_receipts',
  'founder_signal_review_contexts',
  'founder_signal_review_command_dispatches',
  'hair_commerce_receipts',
] as const;

describe('server-only ledger client-grant hardening', () => {
  it('revokes every client-facing table privilege from all four server-only ledgers', () => {
    for (const table of serverOnlyTables) {
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon;`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM authenticated;`);
    }
  });

  it('keeps only the bounded service-role CRUD contract explicit', () => {
    for (const table of serverOnlyTables) {
      expect(migration).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role;`,
      );
    }

    expect(migration).not.toMatch(/GRANT\s+ALL/i);
    expect(migration).not.toMatch(/TO\s+(?:anon|authenticated|PUBLIC)\b/i);
  });

  it('does not create client RLS policies or weaken RLS', () => {
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).not.toMatch(/ALTER\s+TABLE[\s\S]*NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it('documents the intended server-only authority boundary without granting provider authority', () => {
    expect(migration).toContain('Server/service-role-only sanitized review-email receipts');
    expect(migration).toContain('Server/service-role only');
    expect(migration).toContain('server-side service-role path');
    expect(migration).toContain('Provider 2xx proves hook acceptance, never downstream execution.');
  });
});
