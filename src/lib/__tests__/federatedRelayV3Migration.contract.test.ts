import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const baseMigration = readFileSync(
  new URL('../../../supabase/migrations/20260913161000_federated_relay_v3.sql', import.meta.url),
  'utf8',
).toLowerCase();
const sequenceMigration = readFileSync(
  new URL('../../../supabase/migrations/20260913161100_federated_relay_v3_sequence_reservation.sql', import.meta.url),
  'utf8',
).toLowerCase();
const replyMigration = readFileSync(
  new URL('../../../supabase/migrations/20260913161200_federated_relay_v3_reply_reservation.sql', import.meta.url),
  'utf8',
).toLowerCase();

function expectServerOnlyTable(sql: string, table: string) {
  expect(sql).toContain(`alter table public.${table} enable row level security`);
  expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
}

function expectServerOnlyFunction(sql: string, signature: string) {
  const revokeIndex = sql.indexOf(`revoke all on function public.${signature}`);
  expect(revokeIndex).toBeGreaterThanOrEqual(0);
  const window = sql.slice(revokeIndex, revokeIndex + 1_000);
  expect(window).toContain('from public, anon, authenticated');
  expect(window).toContain(`grant execute on function public.${signature}`);
  expect(window).toContain('to service_role');
}

describe('federated relay v3 database contract', () => {
  it('keeps every durable relay table behind RLS and browser-role revocation', () => {
    expectServerOnlyTable(baseMigration, 'federated_relay_messages');
    expectServerOnlyTable(baseMigration, 'federated_relay_supersessions');
    expectServerOnlyTable(baseMigration, 'federated_relay_public_keys');
    expectServerOnlyTable(sequenceMigration, 'federated_relay_source_sequences');
    expectServerOnlyTable(replyMigration, 'federated_relay_reply_reservations');
  });

  it('pins nonce, sender-sequence, chain-position and supersession anti-fork constraints', () => {
    expect(baseMigration).toContain('unique (source_member, source_key_id, source_sequence)');
    expect(baseMigration).toContain('unique (source_key_id, nonce)');
    expect(baseMigration).toContain('unique (chain_id, chain_position)');
    expect(baseMigration).toContain('unique (predecessor_message_id)');
    expect(baseMigration).toContain("raise exception 'relay_reply_identity_not_inverted'");
    expect(baseMigration).toContain("raise exception 'relay_reply_cookie_mismatch'");
    expect(baseMigration).toContain("raise exception 'relay_cross_operation_supersession'");
  });

  it('serializes exact duplicates, chains, senders, and replies before mutation', () => {
    expect(baseMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:source:'");
    expect(baseMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:chain:'");
    expect(baseMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:message:'");
    expect(baseMigration).toContain("select 'duplicate'::text, existing_record.receipt");
    expect(replyMigration).toContain("pg_advisory_xact_lock(hashtextextended('relay:reply:'");
    expect(replyMigration).toContain('existing_reservation.created_at');
  });

  it('prevents service_role from bypassing atomic acceptance with direct message writes', () => {
    expect(baseMigration).toContain(
      'revoke insert, update, delete, truncate, references, trigger\n  on table public.federated_relay_messages from service_role',
    );
    expect(baseMigration).toContain(
      'revoke insert, update, delete, truncate, references, trigger\n  on table public.federated_relay_supersessions from service_role',
    );
    expect(sequenceMigration).toContain(
      'revoke insert, update, delete, truncate, references, trigger\n  on table public.federated_relay_source_sequences from service_role',
    );
    expect(replyMigration).toContain(
      'revoke insert, update, delete, truncate, references, trigger\n  on table public.federated_relay_reply_reservations from service_role',
    );
  });

  it('revokes browser execution from all v3 mutation RPCs', () => {
    expectServerOnlyFunction(baseMigration, 'federated_relay_accept_v3(');
    expectServerOnlyFunction(sequenceMigration, 'federated_relay_reserve_sequence_v3(text, text)');
    expectServerOnlyFunction(replyMigration, 'federated_relay_reserve_reply_v3(uuid, text, text)');
  });

  it('keeps receipts permanently non-authorizing at the database boundary', () => {
    expect(baseMigration).toContain('"executionauthorized":false');
    expect(baseMigration).toContain('"authoritytransferred":false');
    expect(baseMigration).toContain('"approvalcarriedforward":false');
  });
});
