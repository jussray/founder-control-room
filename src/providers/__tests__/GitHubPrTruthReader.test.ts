import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GitHubPrTruthReader } from '../GitHubPrTruthReader.js';

const BASE = 'b'.repeat(40);
const MOVED_BASE = 'c'.repeat(40);
const HEAD = 'a'.repeat(40);
const APP_ID = '12345';
const NOW = new Date('2026-09-14T02:40:00.000Z');

function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function pull() {
  return {
    number: 702,
    state: 'open',
    merged_at: null,
    draft: false,
    title: 'GitHub Truth',
    user: { login: 'jussray' },
    base: {
      ref: 'main',
      sha: BASE,
      repo: { full_name: 'jussray/founder-control-room' },
    },
    head: {
      ref: 'feat/github-truth-mcp-v0-core',
      sha: HEAD,
      repo: { full_name: 'jussray/founder-control-room' },
    },
  };
}

function rulesetDetail(include = 'refs/heads/main') {
  return {
    id: 1,
    name: 'Founder Control Room main exact-head gate [strict freshness]',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: [include], exclude: [] } },
    rules: [{
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [
          { context: 'Required Gate', integration_id: 15368 },
          { context: 'Verify test-ledger contract', integration_id: 15368 },
        ],
      },
    }],
  };
}

function auditFetch(options: { movedBase?: boolean; rulesetInclude?: string } = {}) {
  let branchReads = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith('/repos/jussray/founder-control-room/installation')) {
      return response({ id: 6789, app_id: Number(APP_ID) });
    }
    if (url.endsWith('/app/installations/6789/access_tokens')) {
      return response({
        token: 'read-only-audit-token',
        permissions: {
          administration: 'read',
          checks: 'read',
          contents: 'read',
          pull_requests: 'read',
          statuses: 'read',
        },
      });
    }
    if (/\/pulls\/702$/.test(url)) return response(pull());
    if (/\/branches\/main$/.test(url)) {
      branchReads += 1;
      return response({ commit: { sha: options.movedBase && branchReads > 1 ? MOVED_BASE : BASE } });
    }
    if (url.includes(`/commits/${HEAD}/check-runs?`)) {
      return response({
        total_count: 2,
        check_runs: [
          {
            id: 1,
            name: 'Required Gate',
            status: 'completed',
            conclusion: 'success',
            head_sha: HEAD,
            app: { id: 15368 },
          },
          {
            id: 2,
            name: 'Verify test-ledger contract',
            status: 'completed',
            conclusion: 'success',
            head_sha: HEAD,
            app: { id: 15368 },
          },
        ],
      });
    }
    if (url.includes(`/commits/${HEAD}/statuses?`)) return response([]);
    if (url.includes('/rulesets?')) {
      return response([{ id: 1, target: 'branch', enforcement: 'active' }]);
    }
    if (/\/rulesets\/1$/.test(url)) return response(rulesetDetail(options.rulesetInclude));
    if (/\/branches\/main\/protection$/.test(url)) return response({ message: 'Not Found' }, 404);
    if (url.includes('/pulls/702/reviews?')) return response([]);
    if (url.includes(`/compare/${BASE}...${HEAD}?`)) {
      return response({
        ahead_by: 1,
        behind_by: 0,
        files: [{
          filename: 'src/example.ts',
          status: 'modified',
          additions: 3,
          deletions: 1,
          patch: 'PRIVATE PATCH MUST NEVER LEAVE PROVIDER BOUNDARY',
        }],
      });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

describe('GitHubPrTruthReader', () => {
  it('mints a repository-scoped read-only token and returns provider-owned complete required checks', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const { fetchFn, calls } = auditFetch();
    const reader = new GitHubPrTruthReader(
      'jussray/founder-control-room',
      { GITHUB_APP_ID: APP_ID, GITHUB_PRIVATE_KEY: pem },
      { fetchFn, now: () => NOW, apiBaseUrl: 'https://api.github.test' },
    );

    const evidence = await reader.readAuditEvidence(702);

    const tokenCall = calls.find((call) => call.url.endsWith('/app/installations/6789/access_tokens'));
    expect(tokenCall).toBeDefined();
    const body = JSON.parse(String(tokenCall?.init?.body)) as { repositories: string[]; permissions: Record<string, string> };
    expect(body.repositories).toEqual(['founder-control-room']);
    expect(body.permissions).toEqual({
      administration: 'read',
      checks: 'read',
      contents: 'read',
      pull_requests: 'read',
      statuses: 'read',
    });
    expect(Object.values(body.permissions)).not.toContain('write');
    expect(evidence.requiredChecks).toMatchObject({
      state: 'complete',
      source: 'ruleset',
      requiredChecks: [
        { kind: 'check_run', context: 'Required Gate', appId: 15368 },
        { kind: 'check_run', context: 'Verify test-ledger contract', appId: 15368 },
      ],
    });
    expect(evidence.liveBaseShaInitial).toBe(BASE);
    expect(evidence.liveBaseShaFinal).toBe(BASE);
    expect(evidence.transportFindings).toEqual([]);
    expect(JSON.stringify(evidence)).not.toContain('PRIVATE PATCH MUST NEVER LEAVE PROVIDER BOUNDARY');
  });

  it('marks live-base movement as a separate conflict receipt instead of donating stale base proof', async () => {
    const { fetchFn } = auditFetch({ movedBase: true });
    const reader = new GitHubPrTruthReader(
      'jussray/founder-control-room',
      {},
      {
        fetchFn,
        now: () => NOW,
        apiBaseUrl: 'https://api.github.test',
        tokenFactory: async () => 'read-only-audit-token',
      },
    );

    const evidence = await reader.readAuditEvidence(702);
    expect(evidence.liveBaseShaInitial).toBe(BASE);
    expect(evidence.liveBaseShaFinal).toBe(MOVED_BASE);
    expect(evidence.kernelFindings).toContain('pr_identity_changed_during_collection');
    expect(evidence.transportFindings).toContain('live_base_changed_during_collection');
  });

  it('fails required-check discovery closed on provider ref patterns it cannot prove locally', async () => {
    const { fetchFn } = auditFetch({ rulesetInclude: 'refs/heads/m*' });
    const reader = new GitHubPrTruthReader(
      'jussray/founder-control-room',
      {},
      {
        fetchFn,
        now: () => NOW,
        apiBaseUrl: 'https://api.github.test',
        tokenFactory: async () => 'read-only-audit-token',
      },
    );

    const evidence = await reader.readAuditEvidence(702);
    expect(evidence.requiredChecks.state).toBe('partial');
    expect(evidence.requiredChecks.findings).toContain('required_check_visibility_incomplete');
  });
});
