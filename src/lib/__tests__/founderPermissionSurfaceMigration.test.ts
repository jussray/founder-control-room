import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('founder permission surface migration', () => {
  it('keeps durable request and decision constraints aligned with Manus support', () => {
    const sql = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/20260830045500_founder_permission_manus_surface.sql',
    ), 'utf8');

    expect(sql).toContain('drop constraint if exists founder_permission_request_surface');
    expect(sql).toContain("requested_by_surface in ('fcr','chatgpt','claude','perplexity','manus')");
    expect(sql).toContain('drop constraint if exists founder_permission_decision_surface');
    expect(sql).toContain("decision_surface is null or decision_surface in ('fcr','chatgpt','claude','perplexity','manus')");
  });

  it('caps persisted founder decision expiry at the documented 20-minute window', () => {
    const sql = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/20260830213000_bound_founder_permission_decision_expiry.sql',
    ), 'utf8');

    expect(sql).toContain('drop constraint if exists founder_permission_expiry_after_decision');
    expect(sql).toContain('decided_at is not null');
    expect(sql).toContain('expires_at > decided_at');
    expect(sql).toContain("expires_at <= decided_at + interval '20 minutes'");
  });

  it('locks canonical founder permission identity after the explicit decision', () => {
    const sql = readFileSync(resolve(
      process.cwd(),
      'supabase/migrations/20260830224500_lock_founder_permission_identity.sql',
    ), 'utf8');

    expect(sql).toContain('create or replace function public.enforce_founder_permission_identity_immutability()');
    expect(sql).toContain('before update on public.founder_permission_requests');
    expect(sql).toContain("old.status <> 'pending'");
    expect(sql).toContain("using errcode = '23514'");

    for (const field of [
      'id',
      'request_id',
      'request_contract',
      'requested_by_surface',
      'request_hash',
      'proposal',
      'action_target',
      'note',
      'requested_at',
    ]) {
      expect(sql).toContain(`new.${field} is distinct from old.${field}`);
    }

    for (const field of [
      'status',
      'decision',
      'decision_hash',
      'decision_surface',
      'founder_user_id',
      'founder_email',
      'decided_at',
      'expires_at',
    ]) {
      expect(sql).toContain(`new.${field} is distinct from old.${field}`);
    }

    // One-shot consumption and founder revocation are lifecycle transitions,
    // not authority-identity rewrites, so the trigger must keep them mutable.
    expect(sql).not.toContain('new.consumed_at is distinct from old.consumed_at');
    expect(sql).not.toContain('new.revoked_at is distinct from old.revoked_at');
  });
});
