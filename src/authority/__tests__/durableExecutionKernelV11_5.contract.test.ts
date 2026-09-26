import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bootstrapMigration = readFileSync(
  new URL('../../../supabase/migrations/20260926070000_agent_durable_execution_kernel_v11_5.sql', import.meta.url),
  'utf8',
);

const authorityHardeningMigration = readFileSync(
  new URL('../../../supabase/migrations/20260926071000_agent_durable_execution_kernel_v11_5_authority_role_split.sql', import.meta.url),
  'utf8',
);

describe('durable execution kernel v11.5 SQL contract', () => {
  it('makes revocation and admission contend on the same authority row', () => {
    expect(bootstrapMigration).toMatch(/transition_agent_task_authority_v11_5[\s\S]*for update/);
    expect(bootstrapMigration).toMatch(/admit_agent_execution_v11_5[\s\S]*from public\.agent_task_authority_state[\s\S]*for update/);
    expect(bootstrapMigration).toMatch(/current_epoch <> p_authority_epoch/);
    expect(bootstrapMigration).toMatch(/current_status <> 'ACTIVE'/);
  });

  it('atomically consumes one permit, allocates a fencing token, writes start receipt, and enqueues outbox work', () => {
    expect(bootstrapMigration).toMatch(/permit_id text not null unique/);
    expect(bootstrapMigration).toMatch(/on conflict \(permit_id\) do nothing/);
    expect(bootstrapMigration).toMatch(/next_fence := current_fence \+ 1/);
    expect(bootstrapMigration).toMatch(/'EXECUTION_STARTED'/);
    expect(bootstrapMigration).toMatch(/insert into public\.agent_execution_outbox/);
  });

  it('binds the outbox to the immutable envelope digest and stable logical idempotency key', () => {
    expect(bootstrapMigration).toMatch(/canonical_envelope_digest text not null check/);
    expect(bootstrapMigration).toMatch(/idempotency_key text not null/);
    expect(bootstrapMigration).toMatch(/downstream_idempotency_key text not null/);
    expect(bootstrapMigration).toMatch(/p_downstream_idempotency_key/);
  });

  it('uses skip-locked leases and increments lease generation on every claim', () => {
    expect(bootstrapMigration).toMatch(/for update skip locked/);
    expect(bootstrapMigration).toMatch(/lease_generation = outbox\.lease_generation \+ 1/);
    expect(bootstrapMigration).toMatch(/lease_expires_at = clock_timestamp\(\) \+ make_interval/);
  });

  it('does not auto-redeliver expired non-idempotent or reconciliation-only leases', () => {
    expect(bootstrapMigration).toMatch(/when idempotency_mode = 'reconcile' then 'RECONCILING'/);
    expect(bootstrapMigration).toMatch(/when idempotency_mode = 'none' then 'REQUIRES_REVIEW'/);
    expect(bootstrapMigration).toMatch(/idempotency_mode in \('native', 'client-token'\)/);
    expect(bootstrapMigration).toMatch(/UNSAFE_DESTINATION_RETRY_CONTRACT/);
  });

  it('fences zombie worker outcome writes by owner, generation, and live lease', () => {
    expect(bootstrapMigration).toMatch(/lease_owner = p_worker_id/);
    expect(bootstrapMigration).toMatch(/lease_generation = p_lease_generation/);
    expect(bootstrapMigration).toMatch(/lease_expires_at > clock_timestamp\(\)/);
  });

  it('preserves the preview-receipted bootstrap migration and hardens authority append-only', () => {
    expect(bootstrapMigration).toMatch(/grant execute on function public\.initialize_agent_task_authority_v11_5\([^)]+\) to service_role/);
    expect(authorityHardeningMigration).toMatch(/Append-only successor/);
    expect(authorityHardeningMigration).toMatch(/revoke execute on function public\.initialize_agent_task_authority_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(authorityHardeningMigration).toMatch(/revoke execute on function public\.transition_agent_task_authority_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(authorityHardeningMigration).toMatch(/revoke execute on function public\.admit_agent_execution_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(authorityHardeningMigration).toMatch(/revoke execute on function public\.lease_agent_execution_outbox_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(authorityHardeningMigration).toMatch(/revoke execute on function public\.record_agent_execution_outcome_v11_5\([^)]+\) from public, anon, authenticated, service_role/);
    expect(authorityHardeningMigration).not.toMatch(/grant execute on function public\.[a-z_]+_v11_5\([^)]+\) to service_role/);
  });

  it('keeps direct table access closed after hardening', () => {
    expect(authorityHardeningMigration).toMatch(/revoke all on table public\.agent_execution_outbox from public, anon, authenticated, service_role/);
  });
});
