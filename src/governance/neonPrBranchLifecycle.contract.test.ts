import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/neon-pr-branches.yml', 'utf8');

describe('Neon pull-request branch lifecycle contract', () => {
  it('uses a stable PR-scoped branch identity and pinned Neon actions', () => {
    expect(workflow).toContain('types: [opened, reopened, synchronize, closed]');
    expect(workflow).toContain('group: neon-pr-${{ github.event.pull_request.number }}');
    expect(workflow).toContain('branch_name: preview/pr-${{ github.event.number }}');
    expect(workflow).toContain('branch: ${{ steps.neon_branch.outputs.branch_id }}');
    expect(workflow).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(workflow).toContain('neondatabase/create-branch-action@fb620d43d4c565abaf088b848a4e28e5c4ea4d9c');
    expect(workflow).toContain('neondatabase/delete-branch-action@4468d825d5a88ef4012f1705a82f02ec3072f776');
  });

  it('resolves create/migration scope against the live target branch instead of the historical PR file snapshot', () => {
    expect(workflow).toContain('BASE_REF: ${{ github.event.pull_request.base.ref }}');
    expect(workflow).toContain('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(workflow).toContain('git ls-remote --heads origin "refs/heads/${BASE_REF}"');
    expect(workflow).toContain('git merge-base --is-ancestor "$live_base_sha" "$EXPECTED_HEAD_SHA"');
    expect(workflow).toContain('git diff --name-only "$live_base_sha" "$EXPECTED_HEAD_SHA"');
    expect(workflow).toContain(
      'git diff --name-status --no-renames "$LIVE_BASE_SHA" "$EXPECTED_HEAD_SHA" -- \'supabase/migrations/*.sql\'',
    );
    expect(workflow).toContain('live_base_sha=${live_base_sha}');
    expect(workflow).toContain('Stale PR ancestry');
    expect(workflow).toContain('PREVIEW_CONTRACT="supabase/preview-contracts/${migration##*/}"');
    expect(workflow).toContain('Running migration preview contract: $PREVIEW_CONTRACT');
    expect(workflow).toContain('Re-running migration preview contract on exact candidate: $PREVIEW_CONTRACT');
  });

  it('requires canonical Supabase proof and gates Neon only on explicit provider preview scope', () => {
    expect(workflow).toContain('name: Create Neon Branch');
    expect(workflow).toContain('pull-requests: read');
    expect(workflow.match(/- name: Classify Neon preview scope/g)).toHaveLength(1);
    expect(workflow).toContain('NEEDS_SUPABASE=false');
    expect(workflow).toContain('NEEDS_NEON=false');
    expect(workflow).toContain('supabase/*)');
    expect(workflow).toContain('supabase/preview-fixtures/*.sql');
    expect(workflow).toContain('supabase/preview-contracts/*.sql');
    expect(workflow).toContain('supabase/preview-assertions/*.sql');
    expect(workflow).toContain('if [ -f "supabase/preview-fixtures/$preview_file" ]');
    expect(workflow).toContain('needs_supabase=${NEEDS_SUPABASE}');
    expect(workflow).toContain('needs_neon=${NEEDS_NEON}');
    expect(workflow).toContain("if: steps.neon_scope.outputs.needs_supabase == 'true'");
    expect(workflow).toContain("if: steps.neon_scope.outputs.needs_supabase == 'false'");
    expect(workflow).toContain('uses: supabase/setup-cli@v1');
    expect(workflow).toContain('supabase start');
    expect(workflow).toContain('supabase db lint --local --fail-on error');
    expect(workflow).toContain('Neon provider preview NOT_APPLICABLE');
    expect(workflow.match(/if: steps\.neon_scope\.outputs\.needs_neon == 'true'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(workflow).not.toContain('Neon cleanup skipped because this PR does not change supabase/.');
  });

  it('executes the real Supabase migration with a Neon-only fixture and verifies schema isolation', () => {
    const fixture = readFileSync('supabase/preview-fixtures/20261103000000_member_browser_sessions.sql', 'utf8');
    const assertions = readFileSync('supabase/preview-assertions/20261103000000_member_browser_sessions.sql', 'utf8');
    const migration = readFileSync('supabase/migrations/20261103000000_member_browser_sessions.sql', 'utf8');
    expect(workflow).toContain('PREVIEW_FIXTURE="supabase/preview-fixtures/${migration##*/}"');
    expect(workflow).toContain('PREVIEW_ASSERT="supabase/preview-assertions/${migration##*/}"');
    expect(workflow).toContain('if [ -f "$PREVIEW_FIXTURE" ] && [ -f "$PREVIEW_CONTRACT" ]; then');
    expect(workflow).toContain('Run compatibility fixture and original migration atomically');
    expect(workflow).toContain('-f "$PREVIEW_FIXTURE" -f "$migration"');
    expect(workflow).toContain('-f "$PREVIEW_ASSERT"');
    expect(fixture).toContain('CREATE SCHEMA IF NOT EXISTS auth');
    expect(fixture).toContain('CREATE TABLE IF NOT EXISTS auth.users');
    expect(fixture).toContain('CREATE ROLE %I NOLOGIN');
    expect(assertions).toContain('relrowsecurity');
    expect(assertions).toContain('has_table_privilege');
    expect(assertions).toContain("contype = 'f'");
    expect(migration).toContain('references auth.users(id)');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain('to service_role');
    expect(fixture).not.toContain('SERVICE_ROLE_KEY');
    expect(assertions).not.toContain('CREATE TABLE');
  });

  it('reconciles close cleanup against the actual Neon preview branch instead of the final PR diff', () => {
    expect(workflow).toContain('target_name="preview/pr-${PR_NUMBER}"');
    expect(workflow).toContain('https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/branches');
    expect(workflow).toContain('--data-urlencode "search=${target_name}"');
    expect(workflow).toContain('[.branches[] | select(.name == $target_name)]');
    expect(workflow).toContain('branch_found=false');
    expect(workflow).toContain('branch_found=true');
    expect(workflow).toContain('Unsafe Neon cleanup target');
    expect(workflow).toContain('branch: ${{ steps.neon_branch.outputs.branch_id }}');
    expect(workflow).toContain('No matching Neon preview branch exists; cleanup completed as a safe no-op.');
    expect(workflow).not.toContain('pulls/${PR_NUMBER}/files?per_page=100');
  });

  it('keeps Neon credentials and the private preview URL behind the database-scope gate without exporting it', () => {
    expect(workflow).not.toContain('create_neon_branch_encode');
    expect(workflow).not.toContain('db_url_pooled');
    expect(workflow).not.toContain('db_url_with_pooler');
    expect(workflow).toContain("echo 'NEON_API_KEY is not configured' >&2");
    expect(workflow).toContain('NEON_DB_URL: ${{ steps.create_neon_branch.outputs.db_url }}');
    expect(workflow).toContain("echo 'Neon branch identity and private database URL output are present. URL value was not printed.'");
    expect(workflow).not.toMatch(/echo .*\$NEON_DB_URL/);
    expect(workflow).not.toMatch(/NEON_DB_URL=.*>>\s*["']?\$GITHUB_ENV/);
    expect(workflow).not.toMatch(/NEON_DB_URL=.*>>\s*["']?\$GITHUB_OUTPUT/);

    const firstClassifier = workflow.indexOf('- name: Classify Neon preview scope');
    const firstCredentialRead = workflow.indexOf('NEON_API_KEY: ${{ secrets.NEON_API_KEY }}');
    const firstDatabaseUrlRead = workflow.indexOf('NEON_DB_URL: ${{ steps.create_neon_branch.outputs.db_url }}');
    expect(firstClassifier).toBeGreaterThan(-1);
    expect(firstCredentialRead).toBeGreaterThan(firstClassifier);
    expect(firstDatabaseUrlRead).toBeGreaterThan(firstClassifier);
  });
  it('requires bounded provider readback after deletion and fails closed on unresolved state', () => {
    const deleteAction = workflow.indexOf('- name: Delete Neon Branch');
    const providerReadback = workflow.indexOf('- name: Verify Neon branch deletion with provider readback');
    expect(deleteAction).toBeGreaterThan(-1);
    expect(providerReadback).toBeGreaterThan(deleteAction);
    expect(workflow).toContain("if: steps.neon_branch.outputs.branch_found == 'true'");
    expect(workflow).toContain('for attempt in {1..12}; do');
    expect(workflow).toContain('curl --fail-with-body --silent --show-error --get');
    expect(workflow).toContain("jq -e '.branches | type == \"array\"'");
    expect(workflow).toContain('[.branches[] | select(.name == $target_name)] | length');
    expect(workflow).toContain('Provider readback confirmed exact preview branch is absent: ${target_name}.');
    expect(workflow).toContain('Neon deletion readback failed');
    expect(workflow).toContain('Invalid Neon readback response');
    expect(workflow).toContain('Ambiguous Neon deletion readback');
    expect(workflow).toContain('Neon branch still exists after deletion');
    expect(workflow).toContain('sleep 5');
  });

  it('fails closed on unbound changed Neon companions before provider allocation', () => {
    const start = workflow.indexOf('# Reject unbound changed Neon preview companions before provider allocation.');
    const end = workflow.indexOf('# End changed Neon preview companion guard.');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(end).toBeLessThan(workflow.indexOf('- name: Validate Neon configuration'));
    const guard = workflow.slice(start, end);
    const directory = mkdtempSync(join(tmpdir(), 'fcr-neon-scope-'));
    const filename = '20261124000000_demo.sql';
    const companion = 'supabase/preview-contracts/' + filename;
    const migration = 'supabase/migrations/' + filename;
    const malformed = 'supabase/preview-contracts/nested/' + filename;
    const setup = [
      'set -euo pipefail',
      'CHANGED_FILES=("$PREVIEW_PATH")',
      'live_base_sha=base',
      'EXPECTED_HEAD_SHA=head',
      'git(){ printf "%s\\n" "$ADDED_MIGRATIONS"; }',
    ].join('\n') + '\n';
    try {
      mkdirSync(join(directory, 'supabase/preview-contracts/nested'), {recursive:true});
      writeFileSync(join(directory, companion), 'SELECT 1;');
      writeFileSync(join(directory, malformed), 'SELECT 1;');
      const cases: Array<[string,string,string,string,number]> = [
        ['bound', companion, migration, 'true', 0],
        ['unbound', companion, '', 'true', 1],
        ['wrong binding', companion, 'supabase/migrations/20261124000001_other.sql', 'true', 1],
        ['deleted', 'supabase/preview-contracts/20261124000002_deleted.sql', 'supabase/migrations/20261124000002_deleted.sql', 'true', 1],
        ['non-Neon', companion, '', 'false', 0],
        ['malformed', malformed, migration, 'true', 1],
      ];
      for (const [label, previewPath, added, needsNeon, expected] of cases) {
        const result = spawnSync('bash', ['-c', setup + guard], {
          cwd: directory,
          env: {...process.env, PREVIEW_PATH:previewPath, ADDED_MIGRATIONS:added, NEEDS_NEON:needsNeon},
          encoding: 'utf8',
        });
        expect(result.status, label + ': ' + result.stdout + result.stderr).toBe(expected);
      }
    } finally {
      rmSync(directory, {recursive:true, force:true});
    }
  });

});
