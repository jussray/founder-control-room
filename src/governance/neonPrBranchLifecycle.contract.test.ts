import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/neon-pr-branches.yml', 'utf8');

describe('Neon pull-request branch lifecycle contract', () => {
  it('uses a stable PR-scoped branch identity and pinned Neon actions', () => {
    expect(workflow).toContain('types: [opened, reopened, synchronize, closed]');
    expect(workflow).toContain('group: neon-pr-${{ github.event.pull_request.number }}');
    expect(workflow).toContain('branch_name: preview/pr-${{ github.event.number }}');
    expect(workflow).toContain('branch: preview/pr-${{ github.event.number }}');
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
  });

  it('allocates Neon only for live-base Supabase changes while preserving the required job identity', () => {
    expect(workflow).toContain('name: Create Neon Branch');
    expect(workflow).toContain('pull-requests: read');
    expect(workflow.match(/- name: Classify Neon preview scope/g)).toHaveLength(2);
    expect(workflow).toContain('supabase/*)');
    expect(workflow.match(/if: steps\.neon_scope\.outputs\.needs_neon == 'true'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(workflow.match(/if: steps\.neon_scope\.outputs\.needs_neon == 'false'/g)).toHaveLength(2);
    expect(workflow).toContain('Neon preview skipped because this PR does not change supabase/ against live base.');
    expect(workflow).toContain('Neon cleanup skipped because this PR does not change supabase/.');
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
});
