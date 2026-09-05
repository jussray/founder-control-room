import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../../../supabase/migrations/20260905025500_founder_content_cadence_execution_binding.sql',
  import.meta.url,
));
const migration = fs.readFileSync(migrationPath, 'utf8');

describe('founder-content cadence execution binding membrane', () => {
  it('makes new cadence rows provisional until FCR execution truth exists', () => {
    expect(migration).toContain('execution_binding_expires_at');
    expect(migration).toContain("binding_expires_at timestamptz := binding_now + interval '2 minutes'");
    expect(migration).toContain("e.action_type = 'schedule_founder_content'");
    expect(migration).toContain("e.request->>'contentId' = existing.content_id::text");
  });

  it('fails closed for different content behind an unbound provisional row instead of donating a permanent deferred slot', () => {
    expect(migration).toContain('r.content_id <> p_content_id');
    expect(migration).toContain('r.execution_binding_expires_at > binding_now');
    expect(migration).toContain('not exists (');
    expect(migration).toContain("raise exception 'FOUNDER_CONTENT_CADENCE_EXECUTION_BINDING_PENDING'");
  });

  it('allows only execution-backed rows to anchor later cadence', () => {
    const durableAnchor = migration.slice(
      migration.indexOf('-- Only execution-backed cadence rows can become durable lane authority.'),
      migration.indexOf('next_reserved_at := greatest('),
    );

    expect(durableAnchor).toContain('select max(r.reserved_schedule_at)');
    expect(durableAnchor).toContain("e.status in ('pending', 'succeeded')");
    expect(durableAnchor).toContain("e.result->>'provider_write_attempted' = 'true'");
    expect(durableAnchor).not.toContain("e.status = 'failed'");
  });

  it('can re-arm an expired unbound same-content row without creating duplicate history', () => {
    expect(migration).toContain('if existing.id is not null then');
    expect(migration).toContain('update public.founder_content_cadence_reservations');
    expect(migration).toContain('execution_binding_expires_at = binding_expires_at');
    expect(migration).toContain('where id = existing.id');
  });

  it('forces service-role cadence writes through the serialized RPC boundary', () => {
    expect(migration).toContain(
      'revoke insert, update, delete on table public.founder_content_cadence_reservations from service_role;',
    );
    expect(migration).toContain(
      'grant execute on function public.reserve_founder_content_cadence(text, text, uuid, timestamptz, timestamptz) to service_role;',
    );
  });
});
