import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync('supabase/migrations/20261108075000_qualify_fcr_sql_lint_functions.sql', 'utf8');
test('forward-only migration replaces exactly three original function bodies', () => {
  assert.equal((sql.match(/create or replace function public\./gi) || []).length, 3);
  assert.equal((sql.match(/security definer/gi) || []).length, 2);
  assert.equal((sql.match(/security invoker/gi) || []).length, 1);
  assert.match(sql, /set search_path = pg_catalog/);
  assert.match(sql, /set search_path = public, pg_temp/);
  assert.match(sql, /begin;[\s\S]*commit;/i);
});
test('truth-console fingerprints use extensions-qualified digest in all three calls', () => {
  assert.equal((sql.match(/extensions\.digest\(convert_to\(/g) || []).length, 3);
  const withoutComments = sql.replace(/^--.*$/gm, '');
  assert.doesNotMatch(withoutComments, /(?<!extensions\.)\bdigest\(convert_to\(/);
});
test('send claim does not shadow RETURNS TABLE columns', () => {
  assert.match(sql, /count_leases\.run_id = btrim\(p_run_id\)/);
  assert.match(sql, /recipient_leases\.recipient_fingerprint = lower\(btrim\(p_recipient_fingerprint\)\)/);
  assert.match(sql, /slot_leases\.run_id = btrim\(p_run_id\)/);
  assert.match(sql, /slot_leases\.slot = p_slot/);
  assert.doesNotMatch(sql, /\bwhere\s+(?:run_id|recipient_fingerprint|slot)\s*=/i);
});
test('send finalize targets the claimed lease with explicit alias', () => {
  assert.match(sql, /update public\.revenue_strike_customer_send_leases as target_lease/);
  assert.match(sql, /target_lease\.claim_id = lease_row\.claim_id/);
  assert.match(sql, /target_lease\.provider_outcome = 'claimed'/);
  assert.match(sql, /target_lease\.finalized_at is null/);
});
test('source correction does not broaden database authority', () => {
  assert.doesNotMatch(sql, /^\s*(?:grant|revoke|alter\s+policy|drop\s+policy|alter\s+table|delete\s+from|truncate)\b/im);
  assert.doesNotMatch(sql, /\bsecurity definer\b[\s\S]*\bset search_path\s*=\s*public,/i);
});
