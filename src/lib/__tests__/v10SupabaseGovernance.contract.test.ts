import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260809072500_v10_capability_governance.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

const ultrathinkSkillPath = path.resolve(process.cwd(), 'skills/ultrathink-devil/SKILL.md');
const ultrathinkAiMirrorPath = path.resolve(process.cwd(), '.ai/skills/ultrathink-devil/SKILL.md');
const attackContractPath = path.resolve(process.cwd(), '.control-room/ultrathink-attack.contract.json');
const ultrathinkSkill = fs.readFileSync(ultrathinkSkillPath, 'utf8');
const ultrathinkAiMirror = fs.readFileSync(ultrathinkAiMirrorPath, 'utf8');
const attackContract = JSON.parse(fs.readFileSync(attackContractPath, 'utf8')) as {
  schema: string;
  authorityRepository: string;
  truth: Record<string, boolean>;
  workflow: string[];
  attackN: {
    numericLabelIsReasoningPressureBudget: boolean;
    externalTestCountClaimed: boolean;
    deduplicateFailureClasses: boolean;
    largerBudgetNeverWidensAuthority: boolean;
    largerBudgetNeverRequiresLargerPatch: boolean;
  };
  supabase: {
    projectIdentityUsesImmutableProjectRef: boolean;
    emailIsTimestampedHistoricalProviderEvidence: boolean;
    liveProviderReadbackRequiredForCurrentLifecycleClaimWhenAvailable: boolean;
    resolvePausedDegradedOrInaccessibleBeforeDependentCodeDebugging: boolean;
    organizationMembershipIsNotRuntimeAuthority: boolean;
    oauthApprovalIsNotDatabaseMutationAuthority: boolean;
    userAuthenticationIsNotServiceRoleAuthority: boolean;
    migrationGrantContract: {
      enforceForMigrationTimestampAtOrAfter: string;
      roles: string[];
      newPublicTableRequiresExplicitDataApiDecision: boolean;
      rlsIsSeparateControl: boolean;
    };
    ddlProof: {
      focusedSchemaReadback: boolean;
      securityAdvisor: boolean;
      performanceAdvisor: boolean;
    };
    traceContinuity: {
      captureW3CTraceIdWhenAvailable: boolean;
      traceIdCreatesAuthority: boolean;
      traceIdProvesBusinessOutcome: boolean;
    };
    realtimeEfficiency: {
      preferServerSideFilters: boolean;
      selectOnlyNeededColumns: boolean;
    };
    credentialScope: {
      leastPrivilege: boolean;
      scopeByOrganizationProjectPermissionWhenSupported: boolean;
      portfolioWideGodCredentialByDefault: boolean;
    };
    projectSeparation: {
      fcrIsPortfolioControlEvidencePlane: boolean;
      productDataRemainsProductOwned: boolean;
      crossProjectSharedServiceRoleByDefault: boolean;
    };
  };
};

function normalizeSql(value: string) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function createdPublicTables(value: string) {
  const normalized = normalizeSql(value);
  const tables = new Set<string>();
  const pattern = /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?"?([a-z_][a-z0-9_$]*)"?/g;
  for (const match of normalized.matchAll(pattern)) tables.add(match[1]);
  return [...tables];
}

function hasRoleAccessDecision(value: string, table: string, role: string) {
  const normalized = normalizeSql(value);
  return normalized.split(';').some(statement => {
    if (!/\b(grant|revoke)\b/.test(statement)) return false;
    const target = `public.${table}`;
    const targetsTable = statement.includes(`on table ${target}`) || statement.includes(`on ${target}`);
    return targetsTable && new RegExp(`\\b${role}\\b`).test(statement);
  });
}

function enablesRls(value: string, table: string) {
  const normalized = normalizeSql(value);
  return normalized.includes(`alter table public.${table} enable row level security`)
    || normalized.includes(`alter table if exists public.${table} enable row level security`);
}

describe('Supabase V10 capability governance migration', () => {
  it('persists exact privileged execution identity without making historical rows invalid', () => {
    for (const column of [
      'project_slug',
      'expected_head_sha',
      'capability_plan_hash',
      'registry_hash',
      'plan_contract',
      'requested_authority',
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    expect(sql).toContain("check (expected_head_sha is null or expected_head_sha ~ '^[0-9a-f]{40}$')");
    expect(sql).toContain("check (capability_plan_hash is null or capability_plan_hash ~ '^[0-9a-f]{64}$')");
  });

  it('keeps trusted registry snapshots service-role-only and separate from receipt identity', () => {
    expect(sql).toContain('create table if not exists public.capability_registry_snapshots');
    expect(sql).toContain("status in ('candidate', 'approved', 'retired')");
    expect(sql).toContain('to service_role');
    expect(sql).toContain('revoke all on table public.capability_registry_snapshots from anon, authenticated');
    expect(sql).toContain('create or replace function public.is_v10_registry_approved');
    expect(sql).toContain('set search_path = pg_catalog, public');
    expect(sql).not.toContain('security definer');
  });

  it('blocks legacy merge/create_branch reservations unless the V10 envelope and registry are valid', () => {
    expect(sql).toContain('create or replace function private.enforce_v10_approval_execution_binding()');
    expect(sql).toContain("if new.action_type not in ('merge', 'create_branch') then");
    expect(sql).toContain("raise exception 'V10_BINDING_REQUIRED");
    expect(sql).toContain("raise exception 'V10_PROJECT_BINDING_MISMATCH'");
    expect(sql).toContain("raise exception 'V10_REGISTRY_NOT_APPROVED'");
    expect(sql).toContain('before insert on public.approval_executions');
  });

  it('stores sanitized conveyor receipts without equating observation with registry approval', () => {
    expect(sql).toContain('create table if not exists public.capability_execution_receipts');
    expect(sql).toContain("receipt_id ~ '^fcr-conveyor-receipt-v3:[0-9a-f]{64}$'");
    expect(sql).toContain('evidence_digest text');
    expect(sql).toContain('Registry approval is checked separately');
    expect(sql).not.toMatch(/capability_execution_receipts[\s\S]{0,600}references public\.capability_registry_snapshots/);
    expect(sql).toContain('revoke all on table public.capability_execution_receipts from anon, authenticated');
  });

  it('hardens only the public onboarding trigger search path, not managed Stripe functions', () => {
    expect(sql).toContain('alter function public.update_onboarding_updated_at() set search_path = pg_catalog, public');
    expect(sql).not.toMatch(/alter function stripe\./i);
  });
});

describe('ULTRATHINK / ATTACK workflow governance', () => {
  it('keeps the canonical agent mirror exact and binds ATTACK N to reasoning pressure, not authority', () => {
    expect(ultrathinkAiMirror).toBe(ultrathinkSkill);
    expect(ultrathinkSkill).toContain('version: 1.1.0');
    expect(ultrathinkSkill).toContain('## ATTACK N law');
    expect(ultrathinkSkill).toContain('reasoning-pressure budget');
    expect(ultrathinkSkill).toContain('never permission');
    expect(attackContract.schema).toBe('juss/ultrathink-attack-workflow@v2');
    expect(attackContract.authorityRepository).toBe('jussray/founder-control-room');
    expect(attackContract.attackN.numericLabelIsReasoningPressureBudget).toBe(true);
    expect(attackContract.attackN.externalTestCountClaimed).toBe(false);
    expect(attackContract.attackN.deduplicateFailureClasses).toBe(true);
    expect(attackContract.attackN.largerBudgetNeverWidensAuthority).toBe(true);
    expect(attackContract.attackN.largerBudgetNeverRequiresLargerPatch).toBe(true);
  });

  it('enforces TRUE-first, bad-state repair, proof, and continuity ordering', () => {
    expect(attackContract.truth.trueFirst).toBe(true);
    expect(attackContract.truth.fingerprintBeforeMaterialMutation).toBe(true);
    expect(attackContract.truth.continuityMarkersAuthorizeNothing).toBe(true);
    expect(attackContract.truth.knownBadStateBlocksForwardBuild).toBe(true);
    expect(attackContract.truth.repairOrRevertBeforeQueuedWork).toBe(true);
    expect(attackContract.truth.successorFingerprintRequiredAfterRepair).toBe(true);
    expect(attackContract.workflow).toEqual([
      'true-first-baseline',
      'ultrathink',
      'attack-n',
      'lindy',
      'red-team-i',
      'l99-decide',
      'goalfix',
      'red-team-ii',
      'proofmode',
      'truthmode-confess',
      'playwright-when-browser-observable',
      'continuity',
      'ooda-next-gate',
    ]);
  });

  it('separates Supabase identity, lifecycle evidence, authority, observability, and product data planes', () => {
    expect(attackContract.supabase.projectIdentityUsesImmutableProjectRef).toBe(true);
    expect(attackContract.supabase.emailIsTimestampedHistoricalProviderEvidence).toBe(true);
    expect(attackContract.supabase.liveProviderReadbackRequiredForCurrentLifecycleClaimWhenAvailable).toBe(true);
    expect(attackContract.supabase.resolvePausedDegradedOrInaccessibleBeforeDependentCodeDebugging).toBe(true);
    expect(attackContract.supabase.organizationMembershipIsNotRuntimeAuthority).toBe(true);
    expect(attackContract.supabase.oauthApprovalIsNotDatabaseMutationAuthority).toBe(true);
    expect(attackContract.supabase.userAuthenticationIsNotServiceRoleAuthority).toBe(true);
    expect(attackContract.supabase.ddlProof).toEqual({
      focusedSchemaReadback: true,
      securityAdvisor: true,
      performanceAdvisor: true,
    });
    expect(attackContract.supabase.traceContinuity.captureW3CTraceIdWhenAvailable).toBe(true);
    expect(attackContract.supabase.traceContinuity.traceIdCreatesAuthority).toBe(false);
    expect(attackContract.supabase.traceContinuity.traceIdProvesBusinessOutcome).toBe(false);
    expect(attackContract.supabase.realtimeEfficiency.preferServerSideFilters).toBe(true);
    expect(attackContract.supabase.realtimeEfficiency.selectOnlyNeededColumns).toBe(true);
    expect(attackContract.supabase.credentialScope.leastPrivilege).toBe(true);
    expect(attackContract.supabase.credentialScope.scopeByOrganizationProjectPermissionWhenSupported).toBe(true);
    expect(attackContract.supabase.credentialScope.portfolioWideGodCredentialByDefault).toBe(false);
    expect(attackContract.supabase.projectSeparation.fcrIsPortfolioControlEvidencePlane).toBe(true);
    expect(attackContract.supabase.projectSeparation.productDataRemainsProductOwned).toBe(true);
    expect(attackContract.supabase.projectSeparation.crossProjectSharedServiceRoleByDefault).toBe(false);
  });

  it('fails future new-public-table migrations closed unless RLS and Data API role decisions are explicit', () => {
    const contract = attackContract.supabase.migrationGrantContract;
    expect(contract.newPublicTableRequiresExplicitDataApiDecision).toBe(true);
    expect(contract.rlsIsSeparateControl).toBe(true);
    expect(contract.roles).toEqual(['anon', 'authenticated', 'service_role']);
    expect(contract.enforceForMigrationTimestampAtOrAfter).toMatch(/^\d{14}$/);

    const migrationsDirectory = path.resolve(process.cwd(), 'supabase/migrations');
    const migrationFiles = fs.readdirSync(migrationsDirectory)
      .filter(file => /^\d{14}_.+\.sql$/.test(file))
      .filter(file => file.slice(0, 14) >= contract.enforceForMigrationTimestampAtOrAfter)
      .sort();

    for (const file of migrationFiles) {
      const migrationSql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
      for (const table of createdPublicTables(migrationSql)) {
        expect(enablesRls(migrationSql, table), `${file}: ${table} must enable RLS`).toBe(true);
        for (const role of contract.roles) {
          expect(
            hasRoleAccessDecision(migrationSql, table, role),
            `${file}: ${table} needs explicit GRANT/REVOKE for ${role}`,
          ).toBe(true);
        }
      }
    }
  });
});
