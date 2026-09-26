import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260926070000_agent_durable_execution_kernel_v11_5.sql', import.meta.url),
  'utf8',
);

describe('durable execution kernel v11.5 SQL contract', () => {
  it('makes revocation and admission contend on the same authority row', () => {
    expect(migration).toMatch(/transition_agent_task_authority_v11_5[\s\S]*for update/);
    expect(migration).toMatch(/admit_agent_execution_v11_5[\s\S]*from public\.agent_task_authority_state[\s\S]*for update/);
    expect(migration).toMatch(/current_epoch <> p_authority_epoch/);
    expect(migration).toMatch(/current_status <> 'ACTIVE'/);
  });

  it('atomically consumes one permit, allocates a fencing token, writes start receipt, and enqueues outbox work', () => {
    expect(migration).toMatch(/permit_id text not null unique/);
    expect(migration).toMatch(/on conflict \(permit_id\) do nothing/);
    expect(migration).toMatch(/next_fence := current_fence \+ 1/);
    expect(migration).toMatch(/'EXECUTION_STARTED'/);
    expect(migration).toMatch(/insert into public\.agent_execution_outbox/);
  });

  it('binds the outbox to the immutable envelope digest and stable logical idempotency key', () => {
    expect(migration).toMatch(/canonical_envelope_digest text not null check/);
    expect(migration).toMatch(/idempotency_key text not null/);
    expect(migration).toMatch(/downstream_idempotency_key text not null/);
    expect(migration).toMatch(/p_downstream_idempotency_key/);
  });

  it('uses skip-locked leases and increments lease generation on every claim', () => {
    expect(migration).toMatch(/for update skip locked/);
    expect(migration).toMatch(/lease_generation = outbox\.lease_generation \+ 1/);
    expect(migration).toMatch(/lease_expires_at = clock_timestamp\(\) \+ make_interval/);
  });

  it('does not auto-redeliver expired non-idempotent or reconciliation-only leases', () => {
    expect(migration).toMatch(/when idempotency_mode = 'reconcile' then 'RECONCILING'/);
    expect(migration).toMatch(/when idempotency_mode = 'none' then 'REQUIRES_REVIEW'/);
    expect(migration).toMatch(/idempotency_mode in \('native', 'client-token'\)/);
    expect(migration).toMatch(/UNSAFE_DESTINATION_RETRY_CONTRACT/);
  });

  it('fences zombie worker outcome writes by owner, generation, and live lease', () => {
    expect(migration).toMatch(/lease_owner = p_worker_id/);
    expect(migration).toMatch(/lease_generation = p_lease_generation/);
    expect(migration).toMatch(/lease_expires_at > clock_timestamp\(\)/);
  });

  it('fails closed against generic service_role authority fabrication', () => {
    expect(migration).toMatch(/revoke execute on function public\.initialize_agent_task_authority_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(migration).toMatch(/revoke execute on function public\.transition_agent_task_authority_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(migration).toMatch(/revoke execute on function public\.admit_agent_execution_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(migration).toMatch(/revoke execute on function public\.lease_agent_execution_outbox_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(migration).toMatch(/revoke execute on function public\.record_agent_execution_outcome_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(migration).not.toMatch(/grant execute on function public\.[a-z_]+_v11_5\([^)]+\) to service_role/);
  });

  it('keeps direct table access closed to browser and generic service roles', () => {
    expect(migration).toMatch(/enable row level security/);
    expect(migration).toMatch(/revoke all on table public\.agent_execution_outbox from public, anon, authenticated, service_role/);
  });
});
