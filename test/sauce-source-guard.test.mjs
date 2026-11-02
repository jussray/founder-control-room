import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRepositorySources,
  readRepositorySources,
  validatePublicDraft,
} from '../scripts/verify-sauce-source-guard.mjs';

const sources = readRepositorySources();

test('current repository evidence satisfies the bounded source contract', () => {
  assert.deepEqual(evaluateRepositorySources(sources), []);
});

test('missing README documentation links fail closed', () => {
  const changed = { ...sources, 'README.md': sources['README.md'].replace('(docs/SOURCE_GUARD.md)', '(docs/missing.md)') };
  assert.ok(evaluateRepositorySources(changed).some((error) => error.includes('docs/SOURCE_GUARD.md')));
});

test('silent deletion policy drift fails closed without changing files', () => {
  const name = 'config/conversion-tracking.contract.json';
  const contract = JSON.parse(sources[name]);
  contract.retention.automaticDeletionEnabled = true;
  assert.ok(evaluateRepositorySources({ ...sources, [name]: JSON.stringify(contract) }).some((error) => error.includes('deletion')));
});

test('identity data cannot silently become an allowed conversion field', () => {
  const name = 'config/conversion-tracking.contract.json';
  const contract = JSON.parse(sources[name]);
  contract.allowedPayloadFields.push('user_id');
  assert.ok(evaluateRepositorySources({ ...sources, [name]: JSON.stringify(contract) }).some((error) => error.includes('identity field')));
});

test('read-only public draft review accepts evidenced claims but does not publish', () => {
  assert.deepEqual(validatePublicDraft({ claims: [
    { status: 'CURRENT', text: 'A source contract was added.', evidenceRef: 'commit:95247a53', observedOn: '2026-10-24' },
    { status: 'HISTORICAL', text: 'A test was previously recorded.', asOf: '2026-10-23' },
  ] }), []);
});

test('unsupported, undated and potentially secret-bearing draft claims fail', () => {
  const errors = validatePublicDraft({ claims: [
    { status: 'UNKNOWN', text: 'Revenue is growing' },
    { status: 'CURRENT', text: 'Launched to customers' },
    { status: 'HISTORICAL', text: 'Previously live' },
    { status: 'CURRENT', text: 'password=verysecretpassword', evidenceRef: 'commit:abc12345', observedOn: '2026-10-24' },
  ] });
  assert.ok(errors.some((error) => error.includes('only CURRENT')));
  assert.ok(errors.some((error) => error.includes('evidence reference')));
  assert.ok(errors.some((error) => error.includes('asOf')));
  assert.ok(errors.some((error) => error.includes('credential marker')));
});


test('Supabase guard receipts have source-declared read/append-only permissions', async () => {
  const { readFileSync } = await import('node:fs');
  const migration = readFileSync(
    new URL('../supabase/migrations/20261024231659_sauce_source_guard_minimal_evidence_boundary.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /create table public[.]guard_source_verification_receipts/i);
  assert.match(migration, /alter table public[.]guard_source_verification_receipts enable row level security/i);
  assert.match(migration, /revoke all on table public[.]guard_source_verification_receipts\s+from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select, insert on table public[.]guard_source_verification_receipts\s+to service_role/i);
  assert.doesNotMatch(migration, /grant\s+(?:[^;]*\b(?:update|delete|truncate)\b[^;]*)\s+on table public[.]guard_source_verification_receipts/i);
  assert.match(migration, /observed_result <> 'passed' or evidence_url is not null/);
  const unsafeMigration = migration.replace('grant select, insert on table', 'grant select, insert, delete on table');
  assert.doesNotMatch(
    unsafeMigration,
    /grant select, insert on table public[.]guard_source_verification_receipts\s+to service_role/i,
    'a deletion-permitting edit must break the source contract',
  );
});
