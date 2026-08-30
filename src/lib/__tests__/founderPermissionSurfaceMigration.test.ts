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
});
