import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20260913203000_federated_relay_v31.sql', 'utf8');

describe('federated relay v3.1 migration contract', () => {
  it('keeps v3.1 additive and service-role mutation behind narrow RPCs', () => {
    expect(sql).toContain('v3.1 is additive');
    expect(sql).toContain('revoke all on public.federated_relay_v31_messages from public, anon, authenticated, service_role');
    expect(sql).toContain('grant select on public.federated_relay_v31_public_keys, public.federated_relay_v31_outbox, public.federated_relay_v31_messages to service_role');
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)[^;]*federated_relay_v31_messages/iu);
  });

  it('locks source cursor before chain cursor in acceptance', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.federated_relay_accept_v31'));
    const sourceLock = fn.indexOf('from public.federated_relay_v31_source_cursors');
    const chainLock = fn.indexOf('from public.federated_relay_v31_chain_cursors');
    const parentInboundLock = fn.indexOf('from public.federated_relay_v31_messages where message_id=p_parent_message_id for update');
    expect(sourceLock).toBeGreaterThan(0);
    expect(chainLock).toBeGreaterThan(sourceLock);
    expect(parentInboundLock).toBeGreaterThan(chainLock);
  });

  it('rechecks expiry after cursor locks using clock_timestamp', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.federated_relay_accept_v31'));
    const chainLock = fn.indexOf('from public.federated_relay_v31_chain_cursors');
    const postLockClock = fn.indexOf('v_now := clock_timestamp()');
    const expiry = fn.indexOf("if p_expires_at <= p_issued_at or p_expires_at < v_now");
    expect(postLockClock).toBeGreaterThan(chainLock);
    expect(expiry).toBeGreaterThan(postLockClock);
  });

  it('scopes strict source ordering to source key plus receiver', () => {
    expect(sql).toContain('primary key (source_member, source_key_id, target_member)');
    expect(sql).toContain('unique (source_member, source_key_id, target_member, source_sequence)');
    expect(sql).toContain('p_source_sequence <> v_source.last_sequence + 1');
  });

  it('allows authenticated outbound parent tips without pretending they are inbound rows', () => {
    expect(sql).toContain("last_origin text");
    expect(sql).toContain("v_chain.last_origin='outbound'");
    expect(sql).toContain("from public.federated_relay_v31_outbox where message_id=p_parent_message_id for update");
    expect(sql).toContain("delivery_status not in ('signed','sent','accepted','duplicate')");
  });

  it('stores one immutable receipt and exposes mutable live state separately', () => {
    expect(sql).toContain('receipt_id uuid not null unique');
    expect(sql).toContain('federated_relay_v31_message_immutability');
    expect(sql).toContain("to_jsonb(new) - array['status','superseded_by_message_id']");
    expect(sql).toContain('returns table(delivery text, stored_receipt jsonb, current_state text, superseded_by_message_id uuid)');
  });

  it('freezes key identity and public material while allowing only monotonic lifecycle movement', () => {
    expect(sql).toContain('federated_relay_v31_key_immutability');
    expect(sql).toContain('new.public_key_jwk <> old.public_key_jwk');
    expect(sql).toContain("old.state = 'retiring' and new.state = 'active'");
    expect(sql).toContain("old.state = 'revoked'");
  });

  it('durably reserves outbound sequence before signed delivery and serializes unresolved sends', () => {
    expect(sql).toContain('pending_sequence bigint');
    expect(sql).toContain('pending_message_id uuid');
    expect(sql).toContain("if v_source.pending_message_id is not null then raise exception 'relay_outbound_pending'");
    expect(sql).toContain('federated_relay_v31_finalize_outbound');
    expect(sql).toContain('federated_relay_v31_resolve_outbound');
  });
});
