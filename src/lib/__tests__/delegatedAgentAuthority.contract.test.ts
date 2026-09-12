import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync(new URL('../../../config/delegated-agent-authority.json', import.meta.url), 'utf8'),
) as {
  schema: string;
  status: string;
  principals: Array<{
    id: string;
    displayName: string;
    merge_authority: boolean;
    deploy_authority: boolean;
  }>;
  separatelyGatedAuthority: Record<string, boolean>;
  mergeRequirements: string[];
  deployRequirements: string[];
  redTeamI: string[];
  redTeamII: string[];
};

const authorityDoc = readFileSync(
  new URL('../../../docs/DELEGATED_AGENT_AUTHORITY.md', import.meta.url),
  'utf8',
);

const agents = readFileSync(new URL('../../../AGENTS.md', import.meta.url), 'utf8');

function principal(id: string) {
  const value = manifest.principals.find((candidate) => candidate.id === id);
  expect(value, `missing delegated principal ${id}`).toBeDefined();
  return value!;
}

describe('delegated agent authority contract', () => {
  it('grants merge and deploy authority to exactly Codex Chat and Claude', () => {
    expect(manifest.schema).toBe('fcr/delegated-agent-authority@v1');
    expect(manifest.status).toBe('active');
    expect(manifest.principals.map(({ id }) => id).sort()).toEqual(['claude', 'codex-chat']);

    expect(principal('codex-chat')).toMatchObject({
      displayName: 'Codex Chat',
      merge_authority: true,
      deploy_authority: true,
    });
    expect(principal('claude')).toMatchObject({
      displayName: 'Claude',
      merge_authority: true,
      deploy_authority: true,
    });
  });

  it('does not silently delegate adjacent consequential authorities', () => {
    expect(manifest.separatelyGatedAuthority).toEqual({
      database_migration_authority: false,
      destructive_data_authority: false,
      secret_or_credential_authority: false,
      auth_or_rls_authority: false,
      billing_or_spend_authority: false,
      publication_or_external_communication_authority: false,
      provider_policy_or_ruleset_authority: false,
      dns_or_domain_authority: false,
    });
  });

  it('requires exact identity, exact-head evidence, rollback, and post-deploy truth', () => {
    expect(manifest.mergeRequirements).toContain('provider_authenticated_principal_matches_grant');
    expect(manifest.mergeRequirements).toContain('exact_base_and_head_sha_current');
    expect(manifest.mergeRequirements).toContain('required_machine_checks_green_on_exact_head');
    expect(manifest.mergeRequirements).toContain('rollback_or_safe_forward_fix_known');
    expect(manifest.mergeRequirements).toContain('last_moment_base_head_and_provider_freshness_readback');

    expect(manifest.deployRequirements).toContain('provider_authenticated_principal_matches_grant');
    expect(manifest.deployRequirements).toContain('exact_current_main_sha_verified');
    expect(manifest.deployRequirements).toContain('deployment_path_does_not_execute_any_separately_gated_authority');
    expect(manifest.deployRequirements).toContain('migration_ledger_already_aligned_without_mutation');
    expect(manifest.deployRequirements).toContain('post_deploy_runtime_identity_and_health_reobserved');
  });

  it('red-teams self-certification, replay, bundled privilege expansion, and false outcome claims', () => {
    expect(manifest.redTeamI).toContain('agent_cannot_supply_its_own_independent_review_evidence');
    expect(manifest.redTeamI).toContain(
      'deploy_authority_does_not_imply_migration_secret_auth_billing_publication_or_destructive_authority',
    );
    expect(manifest.redTeamII).toContain(
      'authority_receipts_cannot_be_replayed_across_prs_repositories_heads_or_deployments',
    );
    expect(manifest.redTeamII).toContain('merge_or_provider_acceptance_is_not_outcome_verification');
    expect(manifest.redTeamII).toContain('self_certification_and circular evidence remain forbidden');
  });

  it('documents that this later founder directive supersedes founder-final only for the named principals', () => {
    expect(authorityDoc).toContain('merge_authority=true');
    expect(authorityDoc).toContain('deploy_authority=true');
    expect(authorityDoc).toContain('supersedes any older rule that requires a separate founder-final confirmation');
    expect(authorityDoc).toContain('The grant is standing authority, not standing proof.');
  });

  it('is discoverable from the root agent instructions before merge execution', () => {
    expect(agents).toContain('DELEGATED_AGENT_AUTHORITY.md');
  });
});
