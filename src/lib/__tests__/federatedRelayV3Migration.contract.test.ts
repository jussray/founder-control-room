import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const liveBaselineMigration = readFileSync(
  new URL('../../../supabase/migrations/20260913180000_federated_relay_v3.sql', import.meta.url),
  'utf8',
).toLowerCase();
const reconcileMigration = readFileSync(
  new URL('../../../supabase/migrations/20260913183000_reconcile_federated_relay_v3_graph.sql', import.meta.url),
  'utf8',
).toLowerCase();
const referenceBase = readFileSync(
  new URL('../../../contracts/federated-relay-v3/reference/20260913161000_federated_relay_v3.sql', import.meta.url),
  'utf8',
).toLowerCase();
const referenceSequence = readFileSync(
  new URL('../../../contracts/federated-relay-v3/reference/20260913161100_federated_relay_v3_sequence_reservation.sql', import.meta.url),
  'utf8',
).toLowerCase();
const referenceReply = readFileSync(
  new URL('../../../contracts/federated-relay-v3/reference/20260913161200_federated_relay_v3_reply_reservation.sql', import.meta.url),
  'utf8',
).toLowerCase();

function expectServerOnlyTable(sql: string, table: string) {
  expect(sql).toContain(`alter table public.${table} enable row level security`);
  expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
}

function expectServerOnlyFunction(sql: string, signature: string) {
  const revokeIndex = sql.indexOf(`revoke all on function public.${signature}`);
  expect(revokeIndex).toBeGreaterThanOrEqual(0);
  const window = sql.slice(revokeIndex, revokeIndex + 1_500);
  expect(window).toContain('from public, anon, authenticated');
  expect(window).toContain(`grant execute on function public.${signature}`);
  expect(window).toContain('to service_role');
}

describe('federated relay v3 database contract', () => {
  it('keeps the superseded 16:10 design as non-executable reference fixtures', () => {
    for (const filename of [
      '20260913161000_federated_relay_v3.sql',
      '20260913161100_federated_relay_v3_sequence_reservation.sql',
      '20260913161200_federated_relay_v3_reply_reservation.sql',
    ]) {
      expect(existsSync(new URL(`../../../supabase/migrations/${filename}`, import.meta.url))).toBe(false);
      expect(existsSync(new URL(`../../../contracts/federated-relay-v3/reference/${filename}`, import.meta.url))).toBe(true);
    }
    expect(referenceBase).toContain('create table if not exists public.federated_relay_supersessions');
    expect(referenceSequence).toContain('public.federated_relay_source_sequences');
    expect(referenceReply).toContain('public.federated_relay_reply_reservations');
  });

  it('starts from the live 18:00 ledger and adds the explicit graph truth plane', () => {
    expect(liveBaselineMigration).toContain('create table if not exists public.federated_relay_messages');
    expect(liveBaselineMigration).toContain('supersedes_message_ids uuid[]');
    expect(reconcileMigration).toContain('create table if not exists public.federated_relay_supersessions');
    expect(reconcileMigration).toContain('create table if not exists public.federated_relay_source_sequences');
    expect(reconcileMigration).toContain('unique (predecessor_message_id)');
    expect(reconcileMigration).toContain('federated_relay_reply_parent_unique');
  });

  it('keeps every durable relay surface behind RLS and browser-role revocation', () => {
    expectServerOnlyTable(reconcileMigration, 'federated_relay_supersessions');
    expectServerOnlyTable(reconcileMigration, 'federated_relay_source_sequences');
    expect(reconcileMigration).toContain(
      'revoke all on table public.federated_relay_messages from public, anon, authenticated',
    );
    expect(reconcileMigration).toContain(
      'revoke all on table public.federated_relay_public_keys from public, anon, authenticated',
    );
    expect(reconcileMigration).toContain(
      'revoke all on table public.federated_relay_reply_reservations from public, anon, authenticated',
    );
  });

  it('pins signing-key nonce identity, sender ordering, chain ordering, and supersession anti-fork', () => {
    expect(liveBaselineMigration).toContain('unique (source_member, source_key_id, source_sequence)');
    expect(liveBaselineMigration).toContain('unique (chain_id, chain_position)');
    expect(reconcileMigration).toContain('unique (source_key_id, nonce)');
    expect(reconcileMigration).toContain('unique (predecessor_message_id)');
    expect(reconcileMigration).toContain("raise exception 'relay_reply_identity_not_inverted'");
    expect(reconcileMigration).toContain("raise exception 'relay_reply_cookie_mismatch'");
    expect(reconcileMigration).toContain("raise exception 'relay_cross_operation_supersession'");
    expect(reconcileMigration).toContain("raise exception 'relay_supersession_fork'");
  });

  it('serializes duplicate, sender, chain, and reply races before mutation', () => {
    expect(reconcileMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:source:'");
    expect(reconcileMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:chain:'");
    expect(reconcileMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:message:'");
    expect(reconcileMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:reply:'");
    expect(reconcileMigration).toContain("select 'duplicate'::text, existing_record.receipt");
  });

  it('prevents service_role from bypassing the atomic mutation functions', () => {
    for (const table of [
      'federated_relay_messages',
      'federated_relay_supersessions',
      'federated_relay_reply_reservations',
      'federated_relay_source_sequences',
    ]) {
      expect(reconcileMigration).toContain(
        `revoke insert, update, delete, truncate, references, trigger\n  on table public.${table} from service_role`,
      );
    }
  });

  it('revokes browser execution from all v3 mutation RPCs', () => {
    expectServerOnlyFunction(reconcileMigration, 'federated_relay_accept_v3(');
    expectServerOnlyFunction(reconcileMigration, 'federated_relay_reserve_sequence_v3(text, text)');
    expectServerOnlyFunction(reconcileMigration, 'federated_relay_reserve_reply_v3(uuid, text, text)');
  });

  it('keeps receipts permanently non-authorizing at the database boundary', () => {
    expect(reconcileMigration).toContain('"executionauthorized":false');
    expect(reconcileMigration).toContain('"authoritytransferred":false');
    expect(reconcileMigration).toContain('"approvalcarriedforward":false');
  });
});
