import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim();
const destructiveOnboardingMutation = /(?:create\s+table|drop\s+table|truncate(?:\s+table)?|delete\s+from|update|alter\s+table)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?user_onboarding_state\b/i;
const authenticatedLinkedInGrant = /grant\s+[\s\S]*?\s+on\s+(?:table|view)\s+public\.(?:linkedin_experiments|linkedin_winning_patterns)\s+to\s+authenticated\b/i;

const founderHelper = read('supabase/migrations/20260713034026_harden_founder_helper_server_only.sql');
const mcpHubPhase1 = read('supabase/migrations/20260715073531_mcp_hub_phase1.sql');
const onboardingReplay = read('supabase/migrations/20260718041243_onboarding_state_mirror.sql');
const steadyStateReplay = read('supabase/migrations/20260718042028_steady_state_cron.sql');
const linkedinHardening = read('supabase/migrations/20260827180000_harden_linkedin_experiment_access.sql');
const liveReconciliation = read('supabase/migrations/20260827180100_reconcile_retired_onboarding_and_linkedin_access.sql');
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

  it('preserves the production onboarding migration identity without recreating or mutating the cross-project mirror', () => {
    expect(onboardingReplay).toContain('production historically applied');
    expect(onboardingReplay).toContain('MUST NOT be recreated');
    expect(onboardingReplay).toContain('separately authorized');
    expect(onboardingReplay).not.toMatch(destructiveOnboardingMutation);
    expect(onboardingReplay).not.toContain('parent_link_code');
    expect(onboardingReplay).not.toContain('age_bucket');
  });

  it('preserves the production steady-state migration identity without targeting the retired onboarding mirror', () => {
    expect(steadyStateReplay).toContain('Production-recorded migration identity: 20260718042028_steady_state_cron');
    expect(steadyStateReplay).toContain('MUST NOT');
    expect(steadyStateReplay).toContain('recreate, alter, or schedule work against that retired table.');
    expect(steadyStateReplay).toContain('select 1;');
    expect(steadyStateReplay).not.toContain('cron.schedule');
    expect(steadyStateReplay).not.toMatch(destructiveOnboardingMutation);
  });

  it('keeps LinkedIn experiments behind the existing server-owned founder boundary', () => {
    expect(founderHelper).toContain('revoke all on function public.is_founder() from public, anon, authenticated');
    expect(founderHelper).toContain('grant execute on function public.is_founder() to service_role');
    expect(linkedinHardening).toContain('drop policy if exists founder_full_access');
    expect(linkedinHardening).not.toContain('using (public.is_founder())');
    expect(linkedinHardening).not.toContain('with check (public.is_founder())');
    expect(linkedinHardening).toContain('revoke all privileges on table public.linkedin_experiments from anon, authenticated');
    expect(linkedinHardening).toContain('grant all privileges on table public.linkedin_experiments to service_role');
    expect(linkedinHardening).toContain('alter view public.linkedin_winning_patterns set (security_invoker = true)');
    expect(linkedinHardening).toContain('revoke all privileges on table public.linkedin_winning_patterns from anon, authenticated');
    expect(linkedinHardening).toContain('grant select on table public.linkedin_winning_patterns to service_role');
    expect(linkedinHardening).not.toMatch(authenticatedLinkedInGrant);
  });

  it('reconciles already-recorded production state forward without deleting onboarding data or broadening cron cleanup', () => {
    const normalized = normalizeSql(liveReconciliation);
    expect(liveReconciliation).toContain("'advance-to-steady-state'");
    expect(liveReconciliation).toContain("'flag-stuck-users'");
    expect(liveReconciliation).toContain("command ilike '%public.user_onboarding_state%'");
    expect(liveReconciliation).toContain('perform cron.unschedule(retired_job.jobid);');
    expect(liveReconciliation).not.toMatch(destructiveOnboardingMutation);
    expect(normalized).toMatch(/where jobname in \('advance-to-steady-state', 'flag-stuck-users'\) and command ilike '%public\.user_onboarding_state%'/i);
    expect(normalized).not.toMatch(/where jobname in \('advance-to-steady-state', 'flag-stuck-users'\) or command ilike/i);
    expect(normalized).not.toMatch(/perform\s+cron\.unschedule\s*\([^)]*(?:jobname|command)[^)]*\)/i);
    expect(liveReconciliation).toContain('drop policy if exists founder_full_access');
    expect(liveReconciliation).toContain('revoke all privileges on table public.linkedin_experiments from anon, authenticated');
    expect(liveReconciliation).toContain('grant all privileges on table public.linkedin_experiments to service_role');
    expect(liveReconciliation).toContain('alter view public.linkedin_winning_patterns set (security_invoker = true)');
    expect(liveReconciliation).toContain('revoke all privileges on table public.linkedin_winning_patterns from anon, authenticated');
    expect(liveReconciliation).toContain('grant select on table public.linkedin_winning_patterns to service_role');
    expect(liveReconciliation).not.toMatch(authenticatedLinkedInGrant);
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
