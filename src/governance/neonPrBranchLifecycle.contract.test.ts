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

  it('keeps database credentials job-local and never exports database URLs', () => {
    expect(workflow).not.toContain('create_neon_branch_encode');
    expect(workflow).not.toContain('db_url');
    expect(workflow).not.toContain('db_url_pooled');
    expect(workflow).not.toContain('db_url_with_pooler');
    expect(workflow).toContain("echo 'NEON_API_KEY is not configured' >&2");
  });
});
