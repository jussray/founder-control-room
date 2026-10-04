import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GitHubChangeGenealogyReader } from '../GitHubChangeGenealogyReader.js';

const MAIN = 'a'.repeat(40);
const PR_HEAD = 'b'.repeat(40);
const PR_COMMIT = 'c'.repeat(40);
const DIRECT = 'd'.repeat(40);
const APP_ID = '12345';
const NOW = new Date('2026-09-23T04:40:00.000Z');

function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function pullFixture(overrides: Record<string, unknown> = {}) {
  return {
    number: 900,
    title: 'genealogy',
    state: 'open',
    draft: false,
    merged_at: null,
    merge_commit_sha: null,
    created_at: '2026-09-22T00:00:00.000Z',
    updated_at: '2026-09-23T00:00:00.000Z',
    user: { login: 'jussray' },
    base: { sha: MAIN },
    head: { sha: PR_HEAD },
    ...overrides,
  };
}

function fixtureFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith('/repos/jussray/founder-control-room/installation')) {
      return response({ id: 6789, app_id: Number(APP_ID) });
    }
    if (url.endsWith('/app/installations/6789/access_tokens')) {
      return response({
        token: 'read-only-genealogy-token',
        permissions: {
          administration: 'read',
          checks: 'read',
          contents: 'read',
          pull_requests: 'read',
          statuses: 'read',
        },
      });
    }
    if (url.endsWith('/repos/jussray/founder-control-room')) {
      return response({ default_branch: 'main' });
    }
    if (url.endsWith('/branches/main')) return response({ commit: { sha: MAIN } });
    if (url.includes('/pulls?state=all&sort=updated&direction=desc&per_page=10')) {
      return response([pullFixture()]);
    }
    if (url.endsWith('/repos/jussray/founder-control-room/pulls/900')) {
      return response(pullFixture());
    }
    if (url.includes('/pulls/900/commits?')) {
      return response([{
        sha: PR_COMMIT,
        parents: [{ sha: MAIN }],
        author: { login: 'jussray' },
        commit: {
          message: 'implement genealogy',
          author: { date: '2026-09-22T01:00:00.000Z' },
          committer: { date: '2026-09-22T01:00:00.000Z' },
        },
      }]);
    }
    if (url.includes('/issues/900/comments?')) {
      return response([{
        id: 1,
        user: { login: 'reviewer' },
        created_at: '2026-09-22T02:00:00.000Z',
        updated_at: '2026-09-22T02:00:00.000Z',
        body: 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789 must not leak',
      }]);
    }
    if (url.includes('/pulls/900/comments?')) return response([]);
    if (url.includes('/pulls/900/reviews?')) return response([]);
    if (url.includes('/pulls/900/files?')) {
      return response([{
        filename: 'src/example.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        changes: 4,
        patch: 'RAW PATCH MUST NOT LEAVE PROVIDER BOUNDARY',
      }]);
    }
    if (url.includes('/commits?sha=main&per_page=50')) {
      return response([{
        sha: DIRECT,
        parents: [{ sha: MAIN }],
        author: { login: 'jussray' },
        commit: {
          message: 'branch commit',
          author: { date: '2026-09-23T01:00:00.000Z' },
          committer: { date: '2026-09-23T01:00:00.000Z' },
        },
      }]);
    }
    if (url.includes(`/commits/${DIRECT}/pulls?`)) return response([]);

    throw new Error(`Unexpected test URL: ${url}`);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

describe('GitHubChangeGenealogyReader', () => {
  it('rejects alternate API hosts on the production credential path', () => {
    expect(() => new GitHubChangeGenealogyReader(
      'jussray/founder-control-room',
      { GITHUB_API_BASE_URL: 'https://api.github.test' },
    )).toThrow('GITHUB_API_BASE_URL overrides require an injected fetch transport');
  });

  it('collects the ten-PR genealogy shape with read-only auth and no raw patches', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const { fetchFn, calls } = fixtureFetch();
    const reader = new GitHubChangeGenealogyReader(
      'jussray/founder-control-room',
      { GITHUB_APP_ID: APP_ID, GITHUB_PRIVATE_KEY: pem },
      { fetchFn, now: () => NOW, apiBaseUrl: 'https://api.github.test' },
    );

    const evidence = await reader.readGenealogyEvidence();

    const tokenCall = calls.find((call) => call.url.endsWith('/app/installations/6789/access_tokens'));
    expect(tokenCall).toBeDefined();
    const tokenBody = JSON.parse(String(tokenCall?.init?.body)) as {
      repositories: string[];
      permissions: Record<string, string>;
    };
    expect(tokenBody.repositories).toEqual(['founder-control-room']);
    expect(Object.values(tokenBody.permissions)).not.toContain('write');

    expect(evidence.limit).toBe(10);
    expect(evidence.includeComments).toBe(true);
    expect(evidence.includeDiff).toBe(true);
    expect(evidence.pullRequests[0]?.commits[0]?.sha).toBe(PR_COMMIT);
    expect(evidence.pullRequests[0]?.files).toEqual([{
      path: 'src/example.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      changes: 4,
    }]);
    expect(evidence.pullRequests[0]?.comments[0]?.bodyExcerpt).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(JSON.stringify(evidence)).not.toContain('RAW PATCH MUST NOT LEAVE PROVIDER BOUNDARY');
    expect(evidence.defaultBranchCommits[0]).toMatchObject({
      sha: DIRECT,
      attribution: 'direct_candidate',
      associatedPullRequests: [],
    });
    expect(evidence.defaultBranch).toBe('main');
    expect(evidence.finalDefaultBranch).toBe('main');
    expect(evidence.initialDefaultBranchSha).toBe(MAIN);
    expect(evidence.finalDefaultBranchSha).toBe(MAIN);
    expect(evidence.findings).not.toContainEqual(expect.objectContaining({
      code: 'pull_request_changed_during_collection',
    }));
  });

  it('redacts a multiline private key before truncating the bounded comment excerpt', async () => {
    const base = fixtureFetch();
    const privateKeyBody = [
      'before',
      '-----BEGIN PRIVATE KEY-----',
      'A'.repeat(1600),
      '-----END PRIVATE KEY-----',
      'after',
    ].join('\n');
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/issues/900/comments?')) {
        return response([{
          id: 2,
          user: { login: 'reviewer' },
          created_at: '2026-09-22T02:00:00.000Z',
          updated_at: '2026-09-22T02:00:00.000Z',
          body: privateKeyBody,
        }]);
      }
      return base.fetchFn(input, init);
    }) as unknown as typeof fetch;
    const reader = new GitHubChangeGenealogyReader(
      'jussray/founder-control-room',
      {},
      {
        fetchFn,
        now: () => NOW,
        apiBaseUrl: 'https://api.github.test',
        tokenFactory: async () => 'read-only-genealogy-token',
      },
    );

    const evidence = await reader.readGenealogyEvidence();
    const excerpt = evidence.pullRequests[0]?.comments[0]?.bodyExcerpt ?? '';
    expect(excerpt).toContain('[REDACTED_PRIVATE_KEY]');
    expect(excerpt).not.toContain('BEGIN PRIVATE KEY');
    expect(excerpt).not.toContain('A'.repeat(100));
    expect(excerpt.length).toBeLessThanOrEqual(1200);
  });

  it('marks a pull request conflicted when its load-bearing identity changes during collection', async () => {
    const base = fixtureFetch();
    const movedHead = 'e'.repeat(40);
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/repos/jussray/founder-control-room/pulls/900')) {
        return response(pullFixture({
          updated_at: '2026-09-23T04:39:59.000Z',
          head: { sha: movedHead },
        }));
      }
      return base.fetchFn(input, init);
    }) as unknown as typeof fetch;
    const reader = new GitHubChangeGenealogyReader(
      'jussray/founder-control-room',
      {},
      {
        fetchFn,
        now: () => NOW,
        apiBaseUrl: 'https://api.github.test',
        tokenFactory: async () => 'read-only-genealogy-token',
      },
    );

    const evidence = await reader.readGenealogyEvidence();
    expect(evidence.findings).toContainEqual({
      code: 'pull_request_changed_during_collection',
      scope: 'pr:900',
    });
  });

  it('re-reads the repository default branch identity and marks a branch-name switch', async () => {
    const base = fixtureFetch();
    const releaseSha = 'f'.repeat(40);
    let repositoryReads = 0;
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/repos/jussray/founder-control-room')) {
        repositoryReads += 1;
        return response({ default_branch: repositoryReads === 1 ? 'main' : 'release' });
      }
      if (url.endsWith('/branches/release')) return response({ commit: { sha: releaseSha } });
      return base.fetchFn(input, init);
    }) as unknown as typeof fetch;
    const reader = new GitHubChangeGenealogyReader(
      'jussray/founder-control-room',
      {},
      {
        fetchFn,
        now: () => NOW,
        apiBaseUrl: 'https://api.github.test',
        tokenFactory: async () => 'read-only-genealogy-token',
      },
    );

    const evidence = await reader.readGenealogyEvidence();
    expect(evidence.defaultBranch).toBe('main');
    expect(evidence.finalDefaultBranch).toBe('release');
    expect(evidence.finalDefaultBranchSha).toBe(releaseSha);
    expect(evidence.findings).toContainEqual({
      code: 'default_branch_changed_during_collection',
      scope: 'repository:default_branch',
    });
  });

  it('marks inaccessible conversation comments separately instead of dropping the whole audit', async () => {
    const base = fixtureFetch();
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/issues/900/comments?')) return response({ message: 'Forbidden' }, 403);
      return base.fetchFn(input, init);
    }) as unknown as typeof fetch;
    const reader = new GitHubChangeGenealogyReader(
      'jussray/founder-control-room',
      {},
      {
        fetchFn,
        now: () => NOW,
        apiBaseUrl: 'https://api.github.test',
        tokenFactory: async () => 'read-only-genealogy-token',
      },
    );

    const evidence = await reader.readGenealogyEvidence();
    expect(evidence.findings).toContainEqual({
      code: 'pr_comment_collection_unavailable',
      scope: 'pr:900:comments',
    });
    expect(evidence.pullRequests[0]?.commits[0]?.sha).toBe(PR_COMMIT);
  });
});
