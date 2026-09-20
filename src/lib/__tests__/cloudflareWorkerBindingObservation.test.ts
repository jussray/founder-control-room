import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const observerModulePath = new URL(
  '../../../scripts/inspect-cloudflare-worker-bindings.mjs',
  import.meta.url,
).href;
const observer = await import(observerModulePath);
const {
  classifyBindingObservation,
  extractRequiredSecretNames,
  observeCloudflareWorkerBindings,
} = observer;

const relayBindings = [
  'GEMINI_API_KEY',
  'FCR_RELAY_GEMINI_MODEL',
  'FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP',
];
const coreRequiredBinding = 'FOUNDER_SESSION_ENCRYPTION_KEY';

describe('Cloudflare Worker binding observation', () => {
  it('keeps relay bindings capability-specific instead of global deploy requirements', () => {
    const wrangler = readFileSync(resolve(process.cwd(), 'wrangler.worker.toml'), 'utf8');
    const names = extractRequiredSecretNames(wrangler) as string[];

    expect(names).toContain(coreRequiredBinding);
    for (const name of relayBindings) expect(names).not.toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('verifies global required bindings while independently proving relay readiness', () => {
    const receipt = classifyBindingObservation({
      accountId: '1234567890abcdef',
      workerName: 'founder-control-room',
      requiredNames: [coreRequiredBinding],
      providerNames: [coreRequiredBinding, ...relayBindings, 'UNDECLARED_PRIVATE_NAME'],
    });

    expect(receipt.status).toBe('VERIFIED');
    expect(receipt.relayReady).toBe(true);
    expect(receipt.missingRequiredBindings).toEqual([]);
    expect(receipt.providerValuesRetained).toBe(false);
    expect(receipt.undeclaredBindingNamesRetained).toBe(false);
    expect(receipt.canAuthorizeProviderMutation).toBe(false);
    expect(receipt).not.toHaveProperty('providerBindingCount');
    expect(JSON.stringify(receipt)).not.toContain('UNDECLARED_PRIVATE_NAME');
    expect(
      (receipt.requiredBindings as Array<{ present: boolean }>).every((entry) => entry.present),
    ).toBe(true);
  });

  it('keeps relay drift separate from global required-binding truth', () => {
    const receipt = classifyBindingObservation({
      accountId: '1234567890abcdef',
      workerName: 'founder-control-room',
      requiredNames: [coreRequiredBinding],
      providerNames: [
        coreRequiredBinding,
        ...relayBindings.filter((name) => name !== 'GEMINI_API_KEY'),
      ],
    });

    expect(receipt.status).toBe('VERIFIED');
    expect(receipt.missingRequiredBindings).toEqual([]);
    expect(receipt.relayReady).toBe(false);
  });

  it('does not let relay readiness hide global required-binding drift', () => {
    const receipt = classifyBindingObservation({
      accountId: '1234567890abcdef',
      workerName: 'founder-control-room',
      requiredNames: [coreRequiredBinding],
      providerNames: relayBindings,
    });

    expect(receipt.status).toBe('DRIFT');
    expect(receipt.missingRequiredBindings).toEqual([coreRequiredBinding]);
    expect(receipt.relayReady).toBe(true);
  });

  it('uses only the Cloudflare GET secret-name endpoint and never sends a request body', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: { method?: string; body?: unknown }) => {
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      return new Response(JSON.stringify({
        success: true,
        result: [coreRequiredBinding, ...relayBindings].map((name) => ({ name, type: 'secret_text' })),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const receipt = await observeCloudflareWorkerBindings({
      accountId: '1234567890abcdef',
      workerName: 'founder-control-room',
      apiToken: 'cfut_example_read_only_token',
      requiredNames: [coreRequiredBinding],
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/accounts/1234567890abcdef/workers/scripts/founder-control-room/secrets',
    );
    expect(receipt.status).toBe('VERIFIED');
    expect(receipt.relayReady).toBe(true);
  });

  it('fails closed on provider failure without retaining provider error content', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ success: false, errors: [{ message: 'secret-bearing provider diagnostic' }] }),
      { status: 403 },
    ));

    const receipt = await observeCloudflareWorkerBindings({
      accountId: '1234567890abcdef',
      workerName: 'founder-control-room',
      apiToken: 'cfut_example_read_only_token',
      requiredNames: [coreRequiredBinding],
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(receipt.status).toBe('BLOCKED');
    expect(receipt.classification).toBe('provider-http-403');
    expect(receipt.relayReady).toBe(false);
    expect(JSON.stringify(receipt)).not.toContain('secret-bearing provider diagnostic');
  });
});
