import {
  generateKeyPairSync,
  sign,
  type JsonWebKey,
} from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ControlRoomWorkerEnv } from '../handler.js';
import {
  BIP_PROOF_OIDC_AUDIENCE,
  aggregateGitHubChecks,
  handleBipControlRoomProofIngress,
  verifyGitHubActionsOidc,
} from '../bipChiefEvidenceIngress.js';

const SHA = '579342699fc7fb394cf9684643756cdc8c9342a8';
const RECEIPT_ID = '123e4567-e89b-42d3-a456-426614174000';
const NOW = new Date('2026-09-23T04:20:00.000Z');

function proof(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'juss-proof/v1',
    receiptId: RECEIPT_ID,
    project: 'jussray/Sekret-Bip',
    actor: 'sekret-bip-control-room',
    authority: {
      provider: 'github',
      scope: 'repository',
      target: 'jussray/Sekret-Bip',
      mode: 'verify',
    },
    exactTarget: {
      repository: 'jussray/Sekret-Bip',
      branch: 'main',
      sha: SHA,
    },
    operation: 'exact_head_test_ledger',
    state: 'verified',
    evidence: [
      {
        type: 'control_room_test_ledger',
        name: 'Sanitized exact-head GitHub check ledger',
        state: 'verified',
        ref: `artifact:control-room-test-ledger-${SHA}`,
        sha256: 'a'.repeat(64),
      },
      {
        type: 'github_check_aggregate',
        name: 'checks total=2 passed=2 failed=0 queued=0 running=0 skipped=0 unknown=0',
        state: 'verified',
      },
    ],
    acknowledges: [],
    dependsOn: [],
    supersedes: [],
    nextAuthority: 'founder-control-room',
    issuedAt: '2026-09-23T04:19:30.000Z',
    ...overrides,
  };
}

function fakeEnv() {
  const version = vi.fn().mockResolvedValue({
    ok: true,
    service: 'chief-ai',
    rpcContract: 'juss-v10/chief-fcr-rpc@v1',
    bipEvidenceContract: 'juss/bip-fcr-chief-evidence@v1',
    releaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  const ingestBipEvidence = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    service: 'chief-ai',
    rpcContract: 'juss-v10/chief-fcr-rpc@v1',
    bipEvidenceContract: 'juss/bip-fcr-chief-evidence@v1',
    releaseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    result: { accepted: true },
  });
  return {
    env: {
      CHIEF_AI: { version, ingestBipEvidence },
    } as unknown as ControlRoomWorkerEnv,
    version,
    ingestBipEvidence,
  };
}

function oidcToken(claimOverrides: Record<string, unknown> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'test-key',
  };
  const nowSeconds = Math.floor(NOW.getTime() / 1000);
  const claims = {
    iss: 'https://token.actions.githubusercontent.com',
    aud: BIP_PROOF_OIDC_AUDIENCE,
    exp: nowSeconds + 300,
    iat: nowSeconds - 10,
    nbf: nowSeconds - 10,
    jti: 'oidc-test-jti',
    repository: 'jussray/Sekret-Bip',
    ref: 'refs/heads/main',
    sha: SHA,
    event_name: 'push',
    workflow_ref: 'jussray/Sekret-Bip/.github/workflows/control-room-test-ledger.yml@refs/heads/main',
    ...claimOverrides,
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode(header);
  const body = encode(claims);
  const signature = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');
  return {
    token: `${head}.${body}.${signature}`,
    jwk: { ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' } as JsonWebKey,
  };
}

describe('Bip Control Room proof ingress', () => {
  it('verifies a GitHub Actions OIDC token bound to Bip main and the exact SHA', async () => {
    const fixture = oidcToken();
    await expect(verifyGitHubActionsOidc(
      fixture.token,
      SHA,
      NOW,
      async () => fixture.jwk,
    )).resolves.toBeUndefined();
  });

  it('rejects an OIDC token with the wrong audience even when correctly signed', async () => {
    const fixture = oidcToken({ aud: 'https://example.invalid' });
    await expect(verifyGitHubActionsOidc(
      fixture.token,
      SHA,
      NOW,
      async () => fixture.jwk,
    )).rejects.toThrow('github_oidc_audience_invalid');
  });

  it('deduplicates checks by app/name and excludes the observer check', () => {
    const runs = [
      {
        id: 1,
        name: 'Unit Tests',
        head_sha: SHA,
        status: 'completed',
        conclusion: 'failure',
        completed_at: '2026-09-23T04:18:00Z',
        app: { slug: 'github-actions' },
      },
      {
        id: 2,
        name: 'Unit Tests',
        head_sha: SHA,
        status: 'completed',
        conclusion: 'success',
        completed_at: '2026-09-23T04:19:00Z',
        app: { slug: 'github-actions' },
      },
      {
        id: 3,
        name: 'Cloudflare Pages',
        head_sha: SHA,
        status: 'completed',
        conclusion: 'success',
        completed_at: '2026-09-23T04:19:00Z',
        app: { slug: 'cloudflare-workers-and-pages' },
      },
      {
        id: 4,
        name: 'Publish exact-head test ledger',
        head_sha: SHA,
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-09-23T04:19:00Z',
        app: { slug: 'github-actions' },
      },
    ];

    expect(aggregateGitHubChecks(runs, SHA)).toEqual({
      state: 'passed',
      counts: {
        total: 2,
        passed: 2,
        failed: 0,
        queued: 0,
        running: 0,
        skipped: 0,
        unknown: 0,
      },
    });
  });

  it('revalidates GitHub truth and relays only FCR-normalized evidence to Chief', async () => {
    const { env, version, ingestBipEvidence } = fakeEnv();
    const request = new Request('https://api.foundercontrolroom.org/ingest/bip-control-room-proof', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer oidc-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proof()),
    });

    const response = await handleBipControlRoomProofIngress(request, env, {
      now: () => NOW,
      verifyOidc: vi.fn().mockResolvedValue(undefined),
      observeGitHub: vi.fn().mockResolvedValue({
        state: 'passed',
        counts: {
          total: 2,
          passed: 2,
          failed: 0,
          queued: 0,
          running: 0,
          skipped: 0,
          unknown: 0,
        },
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      project: 'sekret-bip',
      sourceReceiptId: RECEIPT_ID,
      sourceRevision: SHA,
      contract: 'juss/bip-fcr-chief-evidence@v1',
    });
    expect(version).toHaveBeenCalledTimes(1);
    expect(ingestBipEvidence).toHaveBeenCalledTimes(1);
    expect(ingestBipEvidence.mock.calls[0]?.[0]).toMatchObject({
      sourceSystem: 'founder-control-room',
      projectId: 'sekret-bip',
      sourceRevision: SHA,
      authority: {
        scope: 'evidence-only',
        permitsExecution: false,
        permitsApproval: false,
      },
    });
  });

  it('fails closed on GitHub aggregate drift before Chief is called', async () => {
    const { env, ingestBipEvidence } = fakeEnv();
    const request = new Request('https://api.foundercontrolroom.org/ingest/bip-control-room-proof', {
      method: 'POST',
      headers: { Authorization: 'Bearer oidc-token' },
      body: JSON.stringify(proof()),
    });

    const response = await handleBipControlRoomProofIngress(request, env, {
      now: () => NOW,
      verifyOidc: vi.fn().mockResolvedValue(undefined),
      observeGitHub: vi.fn().mockResolvedValue({
        state: 'warning',
        counts: {
          total: 3,
          passed: 2,
          failed: 0,
          queued: 0,
          running: 0,
          skipped: 1,
          unknown: 0,
        },
      }),
    });

    expect(response.status).toBe(409);
    expect(ingestBipEvidence).not.toHaveBeenCalled();
  });
});
