import type { ExportedHandler } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import { FCR_EMAIL_FROM } from '../projectEmail.js';
import {
  composeWorkerHandler,
  validateWorkerEnv,
  type ControlRoomWorkerEnv,
} from '../handler.js';

interface TestEnv {
  label: string;
}

const PROJECT_REF = 'abcdefghijklmnopqrst';
const VALID_ENV: ControlRoomWorkerEnv = {
  SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
  SUPABASE_PROJECT_REF: PROJECT_REF,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
  FOUNDER_SESSION_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  GITHUB_WEBHOOK_SECRET: 'webhook-test-secret',
  GITHUB_APP_ID: '123456',
  GITHUB_PRIVATE_KEY: 'private-key-test-value',
  FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com,https://staging.control.example.com',
  FOUNDER_API_URL: 'https://api.control.example.com',
  FCR_EMAIL: {
    send: vi.fn().mockResolvedValue({ messageId: 'email-test-id' }),
  },
  FCR_EMAIL_FROM,
  FCR_V10_CAPABILITY_PLAN_CONTRACT: 'juss-v10/capability-plan@v1',
  FCR_V10_CONVEYOR_CONTRACT: 'founder-control-room/n8n-conveyor@v3',
  FCR_V10_MAX_RUNTIME_AUTHORITY: 'draft',
  FCR_V10_REGISTRY_RESOLUTION_REQUIRED: 'true',
  FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: 'true',
};

describe('Cloudflare Worker binding validation', () => {
  it('accepts complete absolute production bindings with GitHub App credentials', () => {
    expect(() => validateWorkerEnv(VALID_ENV)).not.toThrow();
  });

  it('accepts the documented GitHub token fallback without GitHub App credentials', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      GITHUB_APP_ID: undefined,
      GITHUB_PRIVATE_KEY: undefined,
      GITHUB_TOKEN: 'github-token-test-value',
    })).not.toThrow();
  });

  it('reports every missing required service binding in one failure', () => {
    expect(() => validateWorkerEnv({ SUPABASE_URL: `https://${PROJECT_REF}.supabase.co` }))
      .toThrow('Missing required Worker bindings: SUPABASE_PROJECT_REF');
  });

  it('rejects a missing or malformed provider-held founder session key', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FOUNDER_SESSION_ENCRYPTION_KEY: undefined,
    })).toThrow('Missing required Worker bindings: FOUNDER_SESSION_ENCRYPTION_KEY');

    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FOUNDER_SESSION_ENCRYPTION_KEY: 'not-base64url',
    })).toThrow('FOUNDER_SESSION_ENCRYPTION_KEY must be 43-character unpadded base64url');
  });

  it('rejects a missing outbound FCR email binding', () => {
    expect(() => validateWorkerEnv({ ...VALID_ENV, FCR_EMAIL: undefined }))
      .toThrow('Missing required Worker binding: FCR_EMAIL');
  });

  it('rejects a sender identity that drifts away from the checked-in FCR identity', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FCR_EMAIL_FROM: 'welcome@sekretbip.net',
    })).toThrow('FCR_EMAIL_FROM must match the checked-in Founder Control Room sender identity');
  });

  it('rejects a Worker with no GitHub authentication path', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      GITHUB_APP_ID: undefined,
      GITHUB_PRIVATE_KEY: undefined,
      GITHUB_TOKEN: undefined,
    })).toThrow(
      'GitHub authentication is not configured; set GITHUB_APP_ID and GITHUB_PRIVATE_KEY or GITHUB_TOKEN',
    );
  });

  it('rejects partial GitHub App credentials instead of silently falling back', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      GITHUB_PRIVATE_KEY: undefined,
      GITHUB_TOKEN: 'github-token-test-value',
    })).toThrow('GITHUB_APP_ID and GITHUB_PRIVATE_KEY must be configured together');
  });

  it('rejects malformed service and callback URLs', () => {
    expect(() => validateWorkerEnv({ ...VALID_ENV, FOUNDER_API_URL: 'not-a-url' }))
      .toThrow('SUPABASE_URL and FOUNDER_API_URL must be absolute URLs');
  });

  it('rejects a Supabase URL whose host does not match the declared project ref', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      SUPABASE_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co',
    })).toThrow('SUPABASE_URL must match SUPABASE_PROJECT_REF on the Supabase HTTPS origin');
  });

  it('rejects stale V2 or otherwise mismatched V10 contracts', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FCR_V10_CONVEYOR_CONTRACT: 'founder-control-room/n8n-conveyor@v2',
    })).toThrow('Worker V10 conveyor contract does not match checked-in runtime contract');

    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FCR_V10_CAPABILITY_PLAN_CONTRACT: 'juss-v9/capability-plan@v1',
    })).toThrow('Worker V10 capability-plan contract does not match checked-in runtime contract');
  });

  it('rejects authority escalation, disabling trusted-registry resolution, or disabling Supabase receipt persistence', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FCR_V10_MAX_RUNTIME_AUTHORITY: 'privileged',
    })).toThrow('Worker V10 runtime authority must remain capped at draft before trusted registry promotion');

    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FCR_V10_REGISTRY_RESOLUTION_REQUIRED: 'false',
    })).toThrow('Worker V10 runtime must require trusted registry resolution before L1+ promotion');

    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: 'false',
    })).toThrow('Worker V10 runtime must persist accepted conveyor receipts to the Supabase audit ledger');
  });

  it('rejects origins containing paths or invalid URLs', () => {
    expect(() => validateWorkerEnv({
      ...VALID_ENV,
      FOUNDER_ALLOWED_ORIGINS: 'https://control.example.com/app,invalid-origin',
    })).toThrow('FOUNDER_ALLOWED_ORIGINS must contain comma-separated absolute origins');
  });
});

describe('Cloudflare Worker handler composition', () => {
  it('delegates fetch requests to Cloudflare\'s HTTP adapter', async () => {
    const response = new Response('ok', { status: 202 });
    const mockFetch = vi.fn().mockResolvedValue(response);
    const httpHandler: ExportedHandler<TestEnv> = { fetch: mockFetch };
    const loadReconciler = vi.fn();
    const handler = composeWorkerHandler(httpHandler, loadReconciler);
    const request = new Request('https://control.example.com/health');
    const env = { label: 'test' };
    const ctx = {} as never;

    if (!handler.fetch) throw new Error('fetch handler is missing');
    const result = await handler.fetch(request as never, env, ctx);

    expect(result).not.toBe(response);
    expect(result.status).toBe(202);
    expect(result.headers.get('x-founder-control-room-service')).toBe('founder-control-room');
    await expect(result.text()).resolves.toBe('ok');
    expect(mockFetch).toHaveBeenCalledWith(request, env, ctx);
    expect(loadReconciler).not.toHaveBeenCalled();
  });

  it('loads the reconciler only for scheduled events and registers its promise', async () => {
    const mockRunReconcilerCycle = vi.fn().mockResolvedValue(undefined);
    const loadReconciler = vi.fn().mockResolvedValue({
      runReconcilerCycle: mockRunReconcilerCycle,
    });
    const httpHandler: ExportedHandler<TestEnv> = {
      fetch: vi.fn().mockResolvedValue(new Response('ok')),
    };
    const handler = composeWorkerHandler(httpHandler, loadReconciler);
    const waitUntil = vi.fn();

    if (!handler.scheduled) throw new Error('scheduled handler is missing');
    await handler.scheduled(
      {} as never,
      { label: 'test' },
      { waitUntil } as never,
    );

    expect(loadReconciler).toHaveBeenCalledTimes(1);
    expect(mockRunReconcilerCycle).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0]?.[0];
  });

  it('fails during composition when the HTTP adapter has no fetch handler', () => {
    expect(() => composeWorkerHandler({}, vi.fn())).toThrow(
      'Cloudflare HTTP handler is missing fetch',
    );
  });
});
