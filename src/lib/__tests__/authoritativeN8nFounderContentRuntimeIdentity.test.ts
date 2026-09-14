import { beforeEach, describe, expect, it, vi } from 'vitest';

const { baseDispatch } = vi.hoisted(() => ({
  baseDispatch: vi.fn(),
}));

vi.mock('../n8nFounderContentAuthorityAdapter.js', () => ({
  dispatchAuthoritativeN8nFounderContent: baseDispatch,
}));

import {
  N8N_FOUNDER_CONTENT_RUNTIME_IDENTITY_CONTRACT,
  computeN8nFounderContentRuntimeIdentitySignature,
  createN8nFounderContentRuntimeIdentityFetch,
  dispatchAuthoritativeN8nFounderContent,
  type N8nFounderContentRuntimeIdentityExpectation,
} from '../authoritativeN8nFounderContentPublisher.js';

const EXPECTATION: N8nFounderContentRuntimeIdentityExpectation = {
  workflowId: 'fcrFounderContentV1',
  workflowFingerprint: 'a'.repeat(64),
  runtimeVersion: '2.32.6',
};
const SECRET = 'runtime-identity-secret-32-characters-minimum';

function signedHeaders(
  challenge: string,
  overrides: Partial<{
    challenge: string;
    contract: string;
    workflowId: string;
    workflowFingerprint: string;
    runtimeVersion: string;
    signature: string;
  }> = {},
): Headers {
  const effective = {
    challenge,
    contract: N8N_FOUNDER_CONTENT_RUNTIME_IDENTITY_CONTRACT,
    workflowId: EXPECTATION.workflowId,
    workflowFingerprint: EXPECTATION.workflowFingerprint,
    runtimeVersion: EXPECTATION.runtimeVersion,
    ...overrides,
  };
  const signature = overrides.signature ?? computeN8nFounderContentRuntimeIdentitySignature(
    {
      workflowId: effective.workflowId,
      workflowFingerprint: effective.workflowFingerprint,
      runtimeVersion: effective.runtimeVersion,
    },
    effective.challenge,
    SECRET,
  );

  return new Headers({
    'X-FCR-N8N-Identity-Challenge': effective.challenge,
    'X-FCR-N8N-Identity-Contract': effective.contract,
    'X-FCR-N8N-Workflow-Id': effective.workflowId,
    'X-FCR-N8N-Workflow-Fingerprint': effective.workflowFingerprint,
    'X-FCR-N8N-Runtime-Version': effective.runtimeVersion,
    'X-FCR-N8N-Identity-Signature': signature,
  });
}

function enabledIdentityEnv(): NodeJS.ProcessEnv {
  return {
    N8N_FOUNDER_CONTENT_ENABLED: 'true',
    N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_ID: EXPECTATION.workflowId,
    N8N_FOUNDER_CONTENT_EXPECTED_WORKFLOW_FINGERPRINT: EXPECTATION.workflowFingerprint,
    N8N_FOUNDER_CONTENT_EXPECTED_RUNTIME_VERSION: EXPECTATION.runtimeVersion,
    N8N_FOUNDER_CONTENT_IDENTITY_HMAC_SECRET: SECRET,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authoritative n8n founder-content runtime identity membrane', () => {
  it('adds an unpredictable challenge and accepts a matching signed workflow/runtime identity', async () => {
    const failures: string[] = [];
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestHeaders = new Headers(init?.headers);
      const challenge = requestHeaders.get('X-FCR-N8N-Identity-Challenge') ?? '';

      expect(challenge).toMatch(/^[0-9a-f]{64}$/);
      expect(requestHeaders.get('X-FCR-N8N-Identity-Contract')).toBe(
        N8N_FOUNDER_CONTENT_RUNTIME_IDENTITY_CONTRACT,
      );
      expect(requestHeaders.get('X-FCR-N8N-Expected-Workflow-Id')).toBe(EXPECTATION.workflowId);
      expect(requestHeaders.get('X-FCR-N8N-Expected-Workflow-Fingerprint')).toBe(
        EXPECTATION.workflowFingerprint,
      );
      expect(requestHeaders.get('X-FCR-N8N-Expected-Runtime-Version')).toBe(EXPECTATION.runtimeVersion);

      return new Response(JSON.stringify({
        orchestrationId: 'fcr-n8n-social-v2:ok',
        provider: 'buffer',
        state: 'scheduled',
      }), {
        status: 202,
        headers: signedHeaders(challenge),
      });
    }) as typeof fetch;

    const guardedFetch = createN8nFounderContentRuntimeIdentityFetch(
      upstream,
      EXPECTATION,
      SECRET,
      (reason) => failures.push(reason),
    );
    const response = await guardedFetch('https://n8n.example/webhook/founder-content', {
      method: 'POST',
    });

    expect(response.status).toBe(202);
    expect(failures).toEqual([]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wrong workflow id', { workflowId: 'otherWorkflow' }, /workflow id/],
    ['wrong workflow fingerprint', { workflowFingerprint: 'b'.repeat(64) }, /workflow fingerprint/],
    ['wrong runtime version', { runtimeVersion: '2.33.0' }, /runtime version/],
    ['wrong challenge', { challenge: 'f'.repeat(64) }, /challenge/],
    ['missing signature', { signature: '' }, /signature/],
  ])('rejects %s before a provider receipt can advance', async (_label, overrides, reasonPattern) => {
    const failures: string[] = [];
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const challenge = new Headers(init?.headers).get('X-FCR-N8N-Identity-Challenge') ?? '';
      return new Response(JSON.stringify({
        orchestrationId: 'fcr-n8n-social-v2:accepted-by-wrong-runtime',
        provider: 'buffer',
        state: 'scheduled',
      }), {
        status: 202,
        headers: signedHeaders(challenge, overrides),
      });
    }) as typeof fetch;

    const guardedFetch = createN8nFounderContentRuntimeIdentityFetch(
      upstream,
      EXPECTATION,
      SECRET,
      (reason) => failures.push(reason),
    );
    const response = await guardedFetch('https://n8n.example/webhook/founder-content', {
      method: 'POST',
    });
    const body = await response.json() as { orchestrationId?: string };

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(reasonPattern);
    expect(body.orchestrationId).toBe('fcr-n8n-runtime-identity-rejected');
  });

  it('fails before consuming founder authority when the enabled lane lacks exact runtime identity configuration', async () => {
    const result = await dispatchAuthoritativeN8nFounderContent({} as never, {
      founderUserId: 'founder-user',
      founderIdentity: 'founder@example.com',
      env: {
        N8N_FOUNDER_CONTENT_ENABLED: 'true',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      code: 'ORCHESTRATION_NOT_CONFIGURED',
      status: 503,
      request: null,
      receipt: null,
    }));
    expect(result.reasons.join(' ')).toContain('did not consume one-shot founder authority');
    expect(baseDispatch).not.toHaveBeenCalled();
  });

  it('keeps runtime identity failure terminally non-finalizing at the authoritative facade', async () => {
    baseDispatch.mockImplementation(async (_input, options) => {
      const response = await options.fetchImpl?.('https://n8n.example/webhook/founder-content', {
        method: 'POST',
      });
      const body = await response?.json() as { orchestrationId?: string } | undefined;

      return {
        ok: false,
        code: 'UPSTREAM_RECEIPT_INVALID',
        status: 502,
        request: { orchestrationId: body?.orchestrationId ?? 'missing' },
        receipt: null,
        reasons: ['inner verifier rejected receipt'],
      };
    });

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const challenge = new Headers(init?.headers).get('X-FCR-N8N-Identity-Challenge') ?? '';
      return new Response(JSON.stringify({
        orchestrationId: 'fcr-n8n-social-v2:provider-accepted',
        provider: 'buffer',
        state: 'scheduled',
      }), {
        status: 202,
        headers: signedHeaders(challenge, { runtimeVersion: '9.9.9' }),
      });
    }) as typeof fetch;

    const result = await dispatchAuthoritativeN8nFounderContent({} as never, {
      founderUserId: 'founder-user',
      founderIdentity: 'founder@example.com',
      env: enabledIdentityEnv(),
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UPSTREAM_RECEIPT_INVALID');
    expect(result.receipt).toBeNull();
    expect(result.reasons.join(' ')).toMatch(/runtime version/);
    expect(result.reasons.join(' ')).toContain('did not finalize the execution');
    expect(result.reasons.join(' ')).toContain('reconcile provider state');
  });
});
