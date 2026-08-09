import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

async function fixture(localVersions: string[], remoteRows: Array<[string, string]>): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'fcr-migration-ledger-'));
  temporaryDirectories.push(directory);
  await mkdir(resolve(directory, 'supabase/migrations'), { recursive: true });

  for (const version of localVersions) {
    await writeFile(
      resolve(directory, `supabase/migrations/${version}_fixture.sql`),
      '-- fixture\n',
      'utf8',
    );
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
    return typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : 1;
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
    expect(existsSync(resolve(
      repositoryRoot,
      `supabase/migrations/${V10_MIGRATION}_v10_capability_governance.sql`,
    ))).toBe(true);
  });

  it('keeps pending local migrations visible during preflight without mistaking the local column for remote proof', async () => {
    const directory = await fixture(
      [
        '20260723000000',
        '20260803011000',
        '20260804054127',
        '20260805235708',
        PROOF_OF_SHIP_PRODUCTION_MIGRATION,
        V10_MIGRATION,
      ],
      [
        ['20260723000000', ''],
        ['20260803011000', ''],
        ['20260804054127', '20260804054127'],
        ['20260805235708', '20260805235708'],
        [PROOF_OF_SHIP_PRODUCTION_MIGRATION, PROOF_OF_SHIP_PRODUCTION_MIGRATION],
        [V10_MIGRATION, ''],
      ],
    );

    expect(runVerifier(directory, 'preflight')).toBe(0);
    const receipt = JSON.parse(await readFile(resolve(directory, 'test-results/ledger.json'), 'utf8'));
    expect(receipt.localOnly).toEqual(['20260723000000', '20260803011000', V10_MIGRATION]);
    expect(receipt.remoteOnly).toEqual([]);
    expect(receipt.requiredVersions).toEqual(['20260723000000', '20260803011000', V10_MIGRATION]);
    expect(receipt.missingRequiredRemote).toEqual(['20260723000000', '20260803011000', V10_MIGRATION]);
  });

  it('fails post-push proof when any checked-in migration remains absent remotely', async () => {
    const directory = await fixture(
      ['20260723000000', '20260803011000', V10_MIGRATION],
      [
        ['20260723000000', '20260723000000'],
        ['20260803011000', ''],
        [V10_MIGRATION, V10_MIGRATION],
      ],
    );

    expect(runVerifier(directory, 'post-push')).not.toBe(0);
  });

  it('fails post-push proof when the V10 constitutional migration is missing remotely', async () => {
    const directory = await fixture(
      ['20260723000000', '20260803011000', V10_MIGRATION],
      [
        ['20260723000000', '20260723000000'],
        ['20260803011000', '20260803011000'],
        [V10_MIGRATION, ''],
      ],
    );

    expect(runVerifier(directory, 'post-push')).not.toBe(0);
  });

  it('fails when production contains a migration version that is absent from the repository', async () => {
    const directory = await fixture(
      ['20260723000000', '20260803011000', V10_MIGRATION],
      [
        ['20260723000000', '20260723000000'],
        ['20260803011000', '20260803011000'],
        [V10_MIGRATION, V10_MIGRATION],
        ['', '20260805235708'],
      ],
    );

    expect(runVerifier(directory, 'preflight')).not.toBe(0);
  });

  it('uses the exact production migration identities and rejects the forked filenames', () => {
    expect(existsSync(resolve(repositoryRoot, 'supabase/migrations/20260804054127_storyengine_repository_identity.sql'))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, 'supabase/migrations/20260805235708_harden_outbox_claim_ownership.sql'))).toBe(true);
    expect(existsSync(resolve(
      repositoryRoot,
      `supabase/migrations/${PROOF_OF_SHIP_PRODUCTION_MIGRATION}_proof_of_ship_receipts.sql`,
    ))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, `supabase/migrations/${V10_MIGRATION}_v10_capability_governance.sql`))).toBe(true);
    expect(existsSync(resolve(repositoryRoot, 'supabase/migrations/20260804_storyengine_repository_identity.sql'))).toBe(false);
    expect(existsSync(resolve(repositoryRoot, 'supabase/migrations/20260721105000_harden_outbox_claim_ownership.sql'))).toBe(false);
    expect(existsSync(resolve(repositoryRoot, 'supabase/migrations/20260808061500_proof_of_ship_receipts.sql'))).toBe(false);
  });

  it('wires exact preflight and post-push ledger receipts into the manual Deploy workflow', () => {
    for (const phrase of [
      'Capture pre-deploy migration ledger',
      'Verify post-push migration ledger',
      'node scripts/verify-production-migration-ledger.mjs',
      'REQUIRED_MIGRATION_VERSIONS: 20260723000000,20260803011000',
      'Upload migration ledger receipts',
      'supabase-migration-ledger-${{ github.run_id }}-${{ github.run_attempt }}',
      'test-results/migration-ledger-before.json',
      'test-results/migration-ledger-after.json',
    ]) {
      expect(deployWorkflow).toContain(phrase);
    }
  });
});
