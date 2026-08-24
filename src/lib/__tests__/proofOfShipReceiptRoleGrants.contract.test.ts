import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const migration = readFileSync(
  resolve(
    repositoryRoot,
    'supabase/migrations/20260824152200_harden_proof_of_ship_receipt_role_grants.sql',
  ),
  'utf8',
);
const receiptRoute = readFileSync(
  resolve(repositoryRoot, 'src/http/routes/proofOfShipReceipts.ts'),
  'utf8',
);
const supabaseClient = readFileSync(resolve(repositoryRoot, 'src/lib/supabase.ts'), 'utf8');

describe('proof-of-ship receipt role grants', () => {
  it('revokes public-role table privileges from proof_of_ship_receipts', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES');
    expect(migration).toContain('ON TABLE public.proof_of_ship_receipts');
    expect(migration).toContain('FROM anon, authenticated');
  });

  it('keeps receipt reads and writes on the service-role client', () => {
    expect(receiptRoute).toContain("const { supabaseAdmin } = await import('../../lib/supabase.js')");
    expect(receiptRoute).toContain('const admin = supabaseAdmin()');
    expect(supabaseClient).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
