import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

const mcpHubPhase1 = read('supabase/migrations/20260715073531_mcp_hub_phase1.sql');
const onboardingReplay = read('supabase/migrations/20260718041243_onboarding_state_mirror.sql');
const linkedinHardening = read('supabase/migrations/20260827180000_harden_linkedin_experiment_access.sql');
const candidateProof = read('.github/workflows/supabase-migration-dry-run-proof.yml');

describe('migration reconciliation security boundaries', () => {
  it('preserves canonical portfolio identities when the delayed MCP Hub migration first applies', () => {
    expect(mcpHubPhase1).toContain("('l99', 'L99 StoryEngine', 'github', 'jussray/StoryEngine'");
    expect(mcpHubPhase1).not.toContain("'jussray/l99-StoryEngine'");
    expect(mcpHubPhase1).toContain("('juss-beautiful-hair-private', 'Juss Beautiful Hair Private Operations', 'github', 'jussray/jbh-private'");
    expect(mcpHubPhase1).not.toContain("('jbh-private',");
    expect((mcpHubPhase1.match(/'juss-beautiful-hair-private'/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(mcpHubPhase1).toContain('on conflict (slug) do nothing;');
  });

  it('preserves the production onboarding migration identity without recreating the cross-project mirror', () => {
    expect(onboardingReplay).toContain('production historically applied');
    expect(onboardingReplay).toContain('MUST NOT be recreated');
    expect(onboardingReplay).toContain('separately authorized');
    expect(onboardingReplay).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?user_onboarding_state/i);
    expect(onboardingReplay).not.toContain('parent_link_code');
    expect(onboardingReplay).not.toContain('age_bucket');
  });

  it('hardens LinkedIn experiments through the existing founder allowlist and caller-RLS view semantics', () => {
    expect(linkedinHardening).toContain('drop policy if exists founder_full_access');
    expect(linkedinHardening).toContain('to authenticated');
    expect(linkedinHardening).toContain('using (public.is_founder())');
    expect(linkedinHardening).toContain('with check (public.is_founder())');
    expect(linkedinHardening).toContain('revoke all privileges on table public.linkedin_experiments from anon, authenticated');
    expect(linkedinHardening).toContain('grant select, insert, update, delete on table public.linkedin_experiments to authenticated');
    expect(linkedinHardening).toContain('alter view public.linkedin_winning_patterns set (security_invoker = true)');
    expect(linkedinHardening).toContain('revoke all privileges on table public.linkedin_winning_patterns from anon, authenticated');
    expect(linkedinHardening).toContain('grant select on table public.linkedin_winning_patterns to authenticated');
  });

  it('keeps branch-controlled Supabase candidate proof secretless and non-mutating', () => {
    expect(candidateProof).not.toContain('environment: production');
    expect(candidateProof).not.toContain('secrets.SUPABASE_DB_URL');
    expect(candidateProof).not.toContain('SUPABASE_DB_URL:');
    expect(candidateProof).not.toContain('supabase db push');
    expect(candidateProof).not.toContain('supabase migration list');
    expect(candidateProof).toContain('credentialed_database_query=false');
    expect(candidateProof).toContain('production_secret_access=false');
    expect(candidateProof).toContain('trusted default-branch/deployment authority step');
  });
});
