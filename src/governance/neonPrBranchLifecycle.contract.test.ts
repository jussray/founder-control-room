import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/neon-pr-branches.yml', 'utf8');

describe('Neon pull-request branch lifecycle contract', () => {
  it('uses a stable PR-scoped branch identity and pinned actions', () => {
    expect(workflow).toContain('types: [opened, reopened, synchronize, closed]');
    expect(workflow).toContain('group: neon-pr-${{ github.event.pull_request.number }}');
    expect(workflow).toContain('branch_name: preview/pr-${{ github.event.number }}');
    expect(workflow).toContain('branch: preview/pr-${{ github.event.number }}');
    expect(workflow).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(workflow).toContain('actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
    expect(workflow).toContain('neondatabase/create-branch-action@fb620d43d4c565abaf088b848a4e28e5c4ea4d9c');
    expect(workflow).toContain('neondatabase/delete-branch-action@4468d825d5a88ef4012f1705a82f02ec3072f776');
  });

  it('allocates Neon only for effective Supabase changes against the current base branch', () => {
    expect(workflow).toContain('name: Create Neon Branch');
    expect(workflow).toContain('pull-requests: read');
    expect(workflow.match(/- name: Check out exact PR head for Neon scope classification/g)).toHaveLength(2);
    expect(workflow.match(/- name: Classify Neon preview scope/g)).toHaveLength(2);
    expect(workflow).toContain('BASE_REF: ${{ github.event.pull_request.base.ref }}');
    expect(workflow).toContain('HEAD_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(workflow).toContain('git fetch --no-tags --prune origin "refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}"');
    expect(workflow).toContain('git diff --name-only "origin/${BASE_REF}...${HEAD_SHA}"');
    expect(workflow).not.toContain('pulls/${PR_NUMBER}/files?per_page=100');
    expect(workflow).toContain('supabase/*)');
    expect(workflow.match(/if: steps\.neon_scope\.outputs\.needs_neon == 'true'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(workflow.match(/if: steps\.neon_scope\.outputs\.needs_neon == 'false'/g)).toHaveLength(2);
    expect(workflow).toContain('Neon preview skipped because this PR does not change supabase/.');
    expect(workflow).toContain('Neon cleanup skipped because this PR does not change supabase/.');
  });

  it('keeps Neon credentials behind the database-scope gate and never exports database URLs', () => {
    expect(workflow).not.toContain('create_neon_branch_encode');
    expect(workflow).not.toContain('db_url');
    expect(workflow).not.toContain('db_url_pooled');
    expect(workflow).not.toContain('db_url_with_pooler');
    expect(workflow).toContain("echo 'NEON_API_KEY is not configured' >&2");

    const firstClassifier = workflow.indexOf('- name: Classify Neon preview scope');
    const firstCredentialRead = workflow.indexOf('NEON_API_KEY: ${{ secrets.NEON_API_KEY }}');
    expect(firstClassifier).toBeGreaterThan(-1);
    expect(firstCredentialRead).toBeGreaterThan(firstClassifier);
  });
});
