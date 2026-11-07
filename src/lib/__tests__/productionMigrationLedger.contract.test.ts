import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const verifier = resolve(repositoryRoot, 'scripts/verify-production-migration-ledger.mjs');
const verifierSource = readFileSync(verifier, 'utf8');
const deployWorkflow = readFileSync(resolve(repositoryRoot, '.github/workflows/deploy.yml'), 'utf8');
const requiredVersions = '20260723000000,20260803011000';
const PROOF_OF_SHIP_PRODUCTION_MIGRATION = '20260809000109';
const V10_MIGRATION = '20260809072500';
const temporaryDirectories: string[] = [];

const PRODUCTION_RECORDED_MIGRATIONS = Object.freeze([
  ['20260711030127', 'init_control_room_schema'],
  ['20260711030936', 'enable_rls_and_founder_policy'],
  ['20260711031021', 'harden_functions'],
  ['20260711211416', 'reconciliation'],
  ['20260711211452', 'reconciliation_fix_execute_grants'],
  ['20260711214937', 'proof_gate_results'],
  ['20260713034026', 'harden_founder_helper_server_only'],
  ['20260713034038', 'scope_control_room_policy_roles'],
  ['20260713034048', 'remove_control_room_client_table_grants'],
  ['20260713052443', 'l99_oidc_status_idempotency'],
  ['20260713052528', 'proof_gate_results_add_failures'],
  ['20260713052627', 'narrow_l99_evidence_idempotency'],
  ['20260715102916', 'federated_repository_verification'],
  ['20260715103349', 'fix_repository_verification_packet_dedupe'],
  ['20260715104718', 'schedule_portfolio_repository_verification'],
  ['20260715104852', 'harden_reconciliation_queue_and_leases'],
  ['20260715215127', 'repository_usage_assertions'],
  ['20260715224510', 'atomic_preview_evidence_import'],
  ['20260715225049', 'harden_capability_evidence_subsets'],
  ['20260715225222', 'enforce_free_first_repair_missions'],
  ['20260715225459', 'enforce_preview_evidence_provenance'],
  ['20260715230035', 'scope_repair_mission_policy_trigger'],
  ['20260718032552', 'guarded_terminal_and_schema_reconciliation'],
  ['20260718033031', 'harden_guarded_terminal_advisors'],
  ['20260718041243', 'onboarding_state_mirror'],
  ['20260718042028', 'steady_state_cron'],
  ['20260719033529', '002_lanes_missions_events'],
  ['20260719185651', 'make_controller_outbox_append_only'],
  ['20260719185700', 'atomic_outbox_lifecycle'],
  ['20260719185709', 'mcp_connector_hub_authority_levels'],
  ['20260719185720', 'enable_rls_on_prototype_only_tables'],
  ['20260721064741', 'refresh_storefront_mission_expected_heads'],
  ['20260804054127', 'storyengine_repository_identity'],
  ['20260805235708', 'harden_outbox_claim_ownership'],
  ['20260809000109', 'proof_of_ship_receipts'],
  ['20260811004830', 'founder_signal_review_email_receipts'],
  ['20260811004844', 'harden_founder_signal_review_email_receipts'],
  ['20260816061150', 'pin_security_function_search_paths_20260816'],
  ['20260816100115', 'connection_vault_v1'],
  ['20260816100219', 'harden_connection_vault_audit_function_execute'],
  ['20260816104500', 'stripe_sync_witness_v1_20260816'],
  ['20260816105127', 'harden_stripe_sync_witness_replay_v1_20260816'],
  ['20260817160605', 'founder_content_hourly_cadence'],
  ['20260824210706', 'harden_proof_of_ship_receipt_role_grants'],
  ['20260825011652', 'linkedin_experiment_log'],
] as const);

const FORWARD_PENDING_MIGRATIONS = Object.freeze([
  '20260715073531_mcp_hub_phase1.sql',
  '20260719181150_create_prototype_evidence.sql',
  '20260827004300_proof_gate_results_rls_fix.sql',
]);

const FORKED_MIGRATION_FILES = Object.freeze([
  '0001_init.sql',
  '0002_enable_rls_and_founder_policy.sql',
  '0003_harden_functions.sql',
  '002_lanes_missions_events.sql',
  '20260711_proof_gate_results_rls_fix.sql',
  '20260713_proof_gate_results_add_failures.sql',
  '20260715_mcp_hub_phase1.sql',
  '20260715070000_federated_repository_verification.sql',
  '20260715071000_fix_repository_verification_packet_dedupe.sql',
  '20260715072000_schedule_portfolio_repository_verification.sql',
  '20260715073000_harden_reconciliation_queue_and_leases.sql',
  '20260715074000_repository_usage_assertions.sql',
  '20260715120000_atomic_preview_evidence_import.sql',
  '20260715121000_harden_capability_evidence_subsets.sql',
  '20260715122000_enforce_free_first_repair_missions.sql',
  '20260715123000_enforce_preview_evidence_provenance.sql',
  '20260715124000_scope_repair_mission_policy_trigger.sql',
  '20260717195000_guarded_terminal_and_schema_reconciliation.sql',
  '20260718024500_make_controller_outbox_append_only.sql',
  '20260718025500_atomic_outbox_lifecycle.sql',
  '20260718034000_harden_guarded_terminal_advisors.sql',
  '20260719050000_mcp_connector_hub_authority_levels.sql',
  '20260721061000_refresh_storefront_mission_expected_heads.sql',
  '20260802224500_founder_signal_review_email_receipts.sql',
  '20260803030000_harden_founder_signal_review_email_receipts.sql',
  '20260804_storyengine_repository_identity.sql',
  '20260721105000_harden_outbox_claim_ownership.sql',
  '20260808061500_proof_of_ship_receipts.sql',
  '20260816090000_connection_vault_v1.sql',
  '20260817155500_founder_content_hourly_cadence.sql',
  '20260824152200_harden_proof_of_ship_receipt_role_grants.sql',
  '20260827004400_mcp_hub_phase1.sql',
]);

async function fixture(localVersions: string[], remoteRows: Array<[string, string]>): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'fcr-migration-ledger-'));
  temporaryDirectories.push(directory);
  await mkdir(resolve(directory, 'supabase/migrations'), { recursive: true });
  for (const version of localVersions) {
    await writeFile(resolve(directory, `supabase/migrations/${version}_fixture.sql`), '-- fixture\n', 'utf8');
  }
  const lines = [
    '        LOCAL      │     REMOTE     │     TIME (UTC)',
    '  ─────────────────┼────────────────┼──────────────────────',
    ...remoteRows.map(([local, remote]) => `  ${local.padEnd(14)} │ ${remote.padEnd(14)} │ 2026-08-05 00:00:00`),
  ];
  await writeFile(resolve(directory, 'remote-migrations.txt'), `${lines.join('\n')}\n`, 'utf8');
  return directory;
}

function runVerifier(directory: string, phase: 'preflight' | 'post-push'): number {
  try {
    execFileSync(process.execPath, [verifier], {
      cwd: directory,
      env: {
        ...process.env,
        REMOTE_MIGRATION_LIST_PATH: 'remote-migrations.txt',
        MIGRATION_LEDGER_RECEIPT_PATH: 'test-results/ledger.json',
        MIGRATION_LEDGER_PHASE: phase,
        REQUIRED_MIGRATION_VERSIONS: requiredVersions,
      },
      stdio: 'pipe',
    });
    return 0;
  } catch (error) {
    return typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 1;
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('production migration ledger verifier', () => {
  it('makes the V10 capability-governance migration constitutional even if workflow configuration omits it', () => {
    expect(verifierSource).toContain(`'${V10_MIGRATION}'`);
    expect(verifierSource).toContain('CONSTITUTIONAL_REQUIRED_MIGRATIONS');
    expect(requiredVersions).not.toContain(V10_MIGRATION);
    expect(existsSync(resolve(repositoryRoot, `supabase/migrations/${V10_MIGRATION}_v10_capability_governance.sql`))).toBe(true);
  });

  it('keeps pending local migrations visible during preflight without mistaking the local column for remote proof', async () => {
    const directory = await fixture(
      ['20260723000000', '20260803011000', '20260804054127', '20260805235708', PROOF_OF_SHIP_PRODUCTION_MIGRATION, V10_MIGRATION],
      [['20260723000000', ''], ['20260803011000', ''], ['20260804054127', '20260804054127'], ['20260805235708', '20260805235708'], [PROOF_OF_SHIP_PRODUCTION_MIGRATION, PROOF_OF_SHIP_PRODUCTION_MIGRATION], [V10_MIGRATION, '']],
    );
    expect(runVerifier(directory, 'preflight')).toBe(0);
    const receipt = JSON.parse(await readFile(resolve(directory, 'test-results/ledger.json'), 'utf8'));
    expect(receipt.localOnly).toEqual(['20260723000000', '20260803011000', V10_MIGRATION]);
    expect(receipt.remoteOnly).toEqual([]);
  });

  it('fails post-push proof when any checked-in migration remains absent remotely', async () => {
    const directory = await fixture(['20260723000000', '20260803011000', V10_MIGRATION], [['20260723000000', '20260723000000'], ['20260803011000', ''], [V10_MIGRATION, V10_MIGRATION]]);
    expect(runVerifier(directory, 'post-push')).not.toBe(0);
  });

  it('fails when production contains a migration version that is absent from the repository', async () => {
    const directory = await fixture(['20260723000000', '20260803011000', V10_MIGRATION], [['20260723000000', '20260723000000'], ['20260803011000', '20260803011000'], [V10_MIGRATION, V10_MIGRATION], ['', '20260805235708']]);
    expect(runVerifier(directory, 'preflight')).not.toBe(0);
  });

  it('mirrors every currently production-recorded migration identity in Git', () => {
    for (const [version, name] of PRODUCTION_RECORDED_MIGRATIONS) {
      expect(existsSync(resolve(repositoryRoot, `supabase/migrations/${version}_${name}.sql`))).toBe(true);
    }
  });

  it('keeps unapplied legacy work in explicit forward migration identities', () => {
    for (const file of FORWARD_PENDING_MIGRATIONS) {
      expect(existsSync(resolve(repositoryRoot, `supabase/migrations/${file}`))).toBe(true);
    }
  });

  it('orders MCP Hub before external code-use consumers', () => {
    const mcpHub = '20260715073531_mcp_hub_phase1.sql';
    const externalCodeUse = '20260724043000_external_code_use_5w1h.sql';
    expect(mcpHub < externalCodeUse).toBe(true);

    const mcpSource = readFileSync(resolve(repositoryRoot, `supabase/migrations/${mcpHub}`), 'utf8');
    const externalSource = readFileSync(resolve(repositoryRoot, `supabase/migrations/${externalCodeUse}`), 'utf8');
    expect(mcpSource).toContain('create table if not exists mcp_servers');
    expect(externalSource).toContain('insert into mcp_servers');
    expect(externalSource).toContain('insert into mcp_project_policies');
  });

  it('rejects known forked migration identities once their production versions are recovered', () => {
    for (const legacyFile of FORKED_MIGRATION_FILES) {
      expect(existsSync(resolve(repositoryRoot, `supabase/migrations/${legacyFile}`))).toBe(false);
    }
  });

  it('requires every checked-in migration to use a 14-digit version identity', () => {
    const files = readdirSync(resolve(repositoryRoot, 'supabase/migrations')).filter((file) => file.endsWith('.sql'));
    expect(files.filter((file) => !/^\d{14}_.+\.sql$/.test(file))).toEqual([]);
  });

  it('preserves the July 19 production fossil and layers prototype replay hardening forward', () => {
    const reconciliationName = '20260711211416_reconciliation.sql';
    const historicalName = '20260719033529_002_lanes_missions_events.sql';
    const hardeningName = '20260719181150_create_prototype_evidence.sql';
    const lockdownName = '20260723000000_lockdown_legacy_prototype_tables.sql';
    expect(reconciliationName < historicalName).toBe(true);
    expect(historicalName < hardeningName).toBe(true);
    expect(hardeningName < lockdownName).toBe(true);
    const historicalSource = readFileSync(resolve(repositoryRoot, `supabase/migrations/${historicalName}`), 'utf8');
    const hardeningSource = readFileSync(resolve(repositoryRoot, `supabase/migrations/${hardeningName}`), 'utf8');
    expect(historicalSource).toContain('create table if not exists evidence (');
    expect(historicalSource).not.toContain('create table if not exists prototype_evidence (');
    expect(hardeningSource).toContain('create table if not exists prototype_evidence (');
  });

  it('wires exact preflight and post-push ledger receipts into the manual Deploy workflow', () => {
    for (const phrase of ['Capture pre-deploy migration ledger', 'Verify post-push migration ledger', 'node scripts/verify-production-migration-ledger.mjs', 'REQUIRED_MIGRATION_VERSIONS: 20260723000000,20260803011000', 'Upload migration ledger receipts', 'test-results/migration-ledger-before.json', 'test-results/migration-ledger-after.json']) {
      expect(deployWorkflow).toContain(phrase);
    }
  });
});
