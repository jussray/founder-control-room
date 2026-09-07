import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const originalMigration = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20260907152000_founder_content_lifecycle_ledger.sql', import.meta.url)),
  'utf8',
);

const retentionMigration = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20260907164500_preserve_founder_content_audit_events.sql', import.meta.url)),
  'utf8',
);

describe('founder-content lifecycle audit retention', () => {
  it('repairs the historical cascade with a restrictive post-event foreign key', () => {
    expect(originalMigration).toContain(
      'references public.founder_content_posts(post_id) on delete cascade',
    );
    expect(retentionMigration).toContain(
      'drop constraint if exists founder_content_post_events_post_id_fkey',
    );
    expect(retentionMigration).toContain('foreign key (post_id)');
    expect(retentionMigration).toContain('references public.founder_content_posts(post_id)');
    expect(retentionMigration).toContain('on delete restrict');
    expect(retentionMigration).not.toContain('on delete cascade');
  });
});
