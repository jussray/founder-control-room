import { describe, expect, it } from 'vitest';
import { findPortfolioSwitch, type PortfolioSwitchDefinition } from '../../switchboard/catalog.js';
import {
  PROMPTOS_CATALOG_ID,
  PROMPTOS_RUNTIME_IDENTITY_SCHEMA,
  probePromptOsProof,
  probePromptOsRuntime,
  resolvePromptOsRegistration,
  type FetchLike,
  type PromptOsProbeOptions,
  type PromptOsProofOptions,
  type PromptOsRegistration,
} from '../promptOsRuntimeFederation.js';

const BASE = 'https://promptos.foundercontrolroom.org';
const CREDENTIAL = 'fcr-test-operator-credential-value';
const SHA = '1234567890abcdef1234567890abcdef12345678';
const NOW = new Date('2026-10-23T12:00:00.000Z');

const REGISTRATION: PromptOsRegistration = {
  serviceId: 'promptos',
  catalogId: PROMPTOS_CATALOG_ID,
  repository: 'jussray/promptos',
  auditedSha: null,
  baseUrl: BASE,
};

type Reply = Awaited<ReturnType<FetchLike>>;

interface Recorded {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function reply(status: number, body: unknown): Reply {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function streamingReply(
  status: number,
  chunks: readonly string[],
  onPull?: (index: number) => void,
  onCancel?: () => void,
): Reply {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.(index);
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
    cancel() {
      onCancel?.();
    },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    text: async () => chunks.join(''),
  };
}

function recordingFetch(respond: (url: string) => Reply | Promise<Reply>): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ url: input, method: init?.method, headers: init?.headers, body: init?.body });
    return respond(input);
  };
  return { fetchImpl, calls };
}

// A fetch that must never be reached. The probe records the call before failing, so any call is caught.
function neverCalled(): { fetchImpl: FetchLike; calls: Recorded[] } {
  return recordingFetch(() => {
    throw new Error('network must not be reached');
  });
}

const hangsUntilAborted: FetchLike = (_input, init) => new Promise<Reply>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    reject(error);
  });
});

function identity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: PROMPTOS_RUNTIME_IDENTITY_SCHEMA,
    service: 'promptos',
    release_sha: SHA,
    observed_at: NOW.toISOString(),
    providers: { openai: { state: 'INTEGRATED', model: 'gpt-test' } },
    authority: 'none',
    ...overrides,
  };
}

function proofBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    service: 'promptos',
    provider: 'openai',
    provider_state: 'VERIFIED',
    release_sha: SHA,
    response_id: 'resp_test_1',
    authority: 'none',
    ...overrides,
  };
}

function probeOptions(overrides: Partial<PromptOsProbeOptions> & Pick<PromptOsProbeOptions, 'fetchImpl'>): PromptOsProbeOptions {
  return { registration: REGISTRATION, credential: CREDENTIAL, now: NOW, ...overrides };
}

function proofOptions(overrides: Partial<PromptOsProofOptions> & Pick<PromptOsProofOptions, 'fetchImpl'>): PromptOsProofOptions {
  return {
    registration: REGISTRATION,
    credential: CREDENTIAL,
    provider: 'openai',
    allowProviderInvocation: true,
    ...overrides,
  };
}

describe('PromptOS registration discovery', () => {
  it('resolves PromptOS from the existing switchboard catalog entry, not a parallel registry', () => {
    const entry = findPortfolioSwitch(PROMPTOS_CATALOG_ID);
    expect(entry).toBeTruthy();

    const result = resolvePromptOsRegistration({ PROMPTOS_SHARED_API_BASE_URL: `${BASE}/` });
    expect(result.reasons).toEqual([]);
    expect(result.registration?.catalogId).toBe(entry?.id);
    expect(result.registration?.repository).toBe(entry?.repository);
    expect(result.registration?.auditedSha).toBe(entry?.auditedSha ?? null);
    expect(result.registration?.baseUrl).toBe(BASE);
  });

  it('fails closed when the catalog no longer has the PromptOS entry', () => {
    const result = resolvePromptOsRegistration({ PROMPTOS_SHARED_API_BASE_URL: BASE }, () => null);
    expect(result.registration).toBeNull();
    expect(result.reasons).toEqual(['catalog_entry_missing']);
  });

  it('fails closed when the catalog entry names no repository', () => {
    const real = findPortfolioSwitch(PROMPTOS_CATALOG_ID);
    if (!real) throw new Error('PromptOS catalog entry must exist for this test');
    const withoutRepository = { ...real, repository: null } as unknown as PortfolioSwitchDefinition;

    const result = resolvePromptOsRegistration({ PROMPTOS_SHARED_API_BASE_URL: BASE }, () => withoutRepository);
    expect(result.registration).toBeNull();
    expect(result.reasons).toEqual(['catalog_repository_missing']);
  });

  it('accepts only a bare https origin and rejects every other shape', () => {
    const invalid: Array<string | undefined> = [
      undefined,
      '',
      'not a url',
      'http://promptos.foundercontrolroom.org',
      'https://user:secret@promptos.foundercontrolroom.org',
      `${BASE}/runtime-identity`,
      `${BASE}/?probe=1`,
      `${BASE}/#fragment`,
    ];
    for (const value of invalid) {
      const result = resolvePromptOsRegistration({ PROMPTOS_SHARED_API_BASE_URL: value });
      expect(result.registration).toBeNull();
      expect(result.reasons).toEqual(['base_url_missing_or_invalid']);
    }
  });
});

describe('PromptOS runtime identity probe', () => {
  it('reports unavailable without touching the network when PromptOS is not registered', async () => {
    const { fetchImpl, calls } = neverCalled();
    const status = await probePromptOsRuntime(probeOptions({
      registration: null,
      registrationReasons: ['catalog_entry_missing'],
      fetchImpl,
    }));
    expect(status.state).toBe('unavailable');
    expect(status.reasons).toEqual(['catalog_entry_missing']);
    expect(calls.length).toBe(0);
  });

  it('never probes anonymously: a missing or blank credential stops before any request', async () => {
    for (const credential of [undefined, null, '   ']) {
      const { fetchImpl, calls } = neverCalled();
      const status = await probePromptOsRuntime(probeOptions({ credential, fetchImpl }));
      expect(status.state).toBe('unavailable');
      expect(status.reasons).toEqual(['credential_missing']);
      expect(calls.length).toBe(0);
    }
  });

  it('sends the operator credential only to the registered identity endpoint', async () => {
    const { fetchImpl, calls } = recordingFetch(() => reply(200, identity()));
    const status = await probePromptOsRuntime(probeOptions({ fetchImpl }));
    expect(status.state).toBe('verified');
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(`${BASE}/runtime-identity`);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers?.Authorization).toBe(`Bearer ${CREDENTIAL}`);
  });

  it('verifies a fresh, schema-correct identity with an exact release', async () => {
    const { fetchImpl } = recordingFetch(() => reply(200, identity()));
    const status = await probePromptOsRuntime(probeOptions({ fetchImpl }));
    expect(status.state).toBe('verified');
    expect(status.identityVerified).toBe(true);
    expect(status.releaseSha).toBe(SHA);
    expect(status.observedAt).toBe(NOW.toISOString());
    expect(status.providers).toEqual({ openai: 'INTEGRATED' });
    expect(status.reasons).toEqual([]);
    expect(status.operationalReadiness).toBe('unproven');
    expect(status.authority).toBe('none');
  });

  it('treats an HTTP 200 without the identity contract as reachable, never verified', async () => {
    const { fetchImpl } = recordingFetch(() => reply(200, {}));
    const status = await probePromptOsRuntime(probeOptions({ fetchImpl }));
    expect(status.state).toBe('reachable');
    expect(status.identityVerified).toBe(false);
    expect(status.reasons).toContain('identity_lacks_schema');
    expect(status.reasons).toContain('identity_lacks_freshness');
    expect(status.reasons).toContain('release_sha_invalid');
  });

  it('rejects a foreign schema, a foreign service, or a non-exact release', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [identity({ schema: 'promptos/other@v9' }), 'schema_mismatch'],
      [identity({ service: 'storyengine' }), 'service_mismatch'],
      [identity({ release_sha: 'unknown' }), 'release_sha_invalid'],
      [identity({ release_sha: SHA.slice(0, 12) }), 'release_sha_invalid'],
    ];
    for (const [body, reason] of cases) {
      const { fetchImpl } = recordingFetch(() => reply(200, body));
      const status = await probePromptOsRuntime(probeOptions({ fetchImpl }));
      expect(status.state).toBe('reachable');
      expect(status.identityVerified).toBe(false);
      expect(status.reasons).toContain(reason);
    }
  });

  it('refuses stale and future-dated identity, and accepts identity inside the freshness window', async () => {
    const stale = new Date(NOW.getTime() - 10 * 60_000).toISOString();
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    const fresh = new Date(NOW.getTime() - 60_000).toISOString();
    const outcomes = await Promise.all([stale, future, fresh].map((observed) => {
      const { fetchImpl } = recordingFetch(() => reply(200, identity({ observed_at: observed })));
      return probePromptOsRuntime(probeOptions({ fetchImpl }));
    }));
    expect(outcomes[0].reasons).toContain('identity_stale');
    expect(outcomes[1].reasons).toContain('identity_from_future');
    expect(outcomes[2].state).toBe('verified');
  });

  it('refuses any authority beyond none', async () => {
    const { fetchImpl } = recordingFetch(() => reply(200, identity({ authority: 'write' })));
    const status = await probePromptOsRuntime(probeOptions({ fetchImpl }));
    expect(status.state).toBe('reachable');
    expect(status.reasons).toContain('authority_not_none');
  });

  it('keeps an unconfigured optional provider visible without degrading the identity', async () => {
    const { fetchImpl } = recordingFetch(() => reply(200, identity({
      providers: {
        openai: { state: 'INTEGRATED', model: 'gpt-test' },
        anthropic: { state: 'ABSENT', model: 'claude-test' },
      },
    })));
    const status = await probePromptOsRuntime(probeOptions({ fetchImpl }));
    expect(status.state).toBe('verified');
    expect(status.providers).toEqual({ openai: 'INTEGRATED', anthropic: 'ABSENT' });
    expect(status.reasons).toEqual([]);
  });

  it('degrades when a provider FCR requires is absent or missing, while identity stays verified', async () => {
    const absent = recordingFetch(() => reply(200, identity({
      providers: { openai: { state: 'ABSENT', model: null } },
    })));
    const absentStatus = await probePromptOsRuntime(probeOptions({
      fetchImpl: absent.fetchImpl,
      requiredProviders: ['openai'],
    }));
    expect(absentStatus.state).toBe('degraded');
    expect(absentStatus.identityVerified).toBe(true);
    expect(absentStatus.providers).toEqual({ openai: 'ABSENT' });
    expect(absentStatus.reasons).toEqual(['provider_absent:openai']);

    const missing = recordingFetch(() => reply(200, identity()));
    const missingStatus = await probePromptOsRuntime(probeOptions({
      fetchImpl: missing.fetchImpl,
      requiredProviders: ['anthropic'],
    }));
    expect(missingStatus.state).toBe('degraded');
    expect(missingStatus.reasons).toEqual(['provider_missing:anthropic']);
  });

  it('degrades when the deployed release differs from the expected release, and matches case-insensitively', async () => {
    const mismatch = recordingFetch(() => reply(200, identity()));
    const differs = await probePromptOsRuntime(probeOptions({
      fetchImpl: mismatch.fetchImpl,
      expectedReleaseSha: 'f'.repeat(40),
    }));
    expect(differs.state).toBe('degraded');
    expect(differs.reasons).toEqual(['release_differs_from_expected']);

    const match = recordingFetch(() => reply(200, identity()));
    const same = await probePromptOsRuntime(probeOptions({
      fetchImpl: match.fetchImpl,
      expectedReleaseSha: SHA.toUpperCase(),
    }));
    expect(same.state).toBe('verified');
  });

  it('maps credential rejection, unavailable service, and other statuses to unavailable', async () => {
    const cases: Array<[number, string]> = [
      [401, 'credential_rejected'],
      [403, 'credential_rejected'],
      [503, 'service_unavailable'],
      [500, 'unexpected_status'],
    ];
    for (const [status, reason] of cases) {
      const { fetchImpl } = recordingFetch(() => reply(status, { error: 'refused' }));
      const result = await probePromptOsRuntime(probeOptions({ fetchImpl }));
      expect(result.state).toBe('unavailable');
      expect(result.reasons).toEqual([reason]);
      expect(result.identityVerified).toBe(false);
    }
  });

  it('maps transport failure to unreachable and a blown deadline to timeout', async () => {
    const down = recordingFetch(() => {
      throw new Error('socket hang up');
    });
    const unreachable = await probePromptOsRuntime(probeOptions({ fetchImpl: down.fetchImpl }));
    expect(unreachable.state).toBe('unavailable');
    expect(unreachable.reasons).toEqual(['unreachable']);

    const slow = await probePromptOsRuntime(probeOptions({ fetchImpl: hangsUntilAborted, timeoutMs: 5 }));
    expect(slow.state).toBe('unavailable');
    expect(slow.reasons).toEqual(['timeout']);
  });

  it('bounds a 200 whose body stalls after headers, so the probe cannot hang on an endless body', async () => {
    const stalled: FetchLike = async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({ start() {} }),
      text: () => new Promise<string>(() => {}),
    });
    const result = await probePromptOsRuntime(probeOptions({ fetchImpl: stalled, timeoutMs: 20 }));
    expect(result.state).toBe('reachable');
    expect(result.reasons).toEqual(['identity_unreadable_or_too_large']);
  });

  it('refuses a non-JSON or oversized 200 without verifying it', async () => {
    const html = recordingFetch(() => reply(200, '<html>PromptOS</html>'));
    const notJson = await probePromptOsRuntime(probeOptions({ fetchImpl: html.fetchImpl }));
    expect(notJson.state).toBe('reachable');
    expect(notJson.reasons).toEqual(['identity_not_json']);

    const big = recordingFetch(() => reply(200, 'x'.repeat(17 * 1024)));
    const oversized = await probePromptOsRuntime(probeOptions({ fetchImpl: big.fetchImpl }));
    expect(oversized.state).toBe('reachable');
    expect(oversized.reasons).toEqual(['identity_unreadable_or_too_large']);
  });

  it('cancels an oversized streamed identity before consuming the full untrusted body', async () => {
    let pulls = 0;
    let cancelled = false;
    const chunks = ['x'.repeat(9 * 1024), 'y'.repeat(9 * 1024), 'z'.repeat(9 * 1024)];
    const { fetchImpl } = recordingFetch(() => streamingReply(
      200,
      chunks,
      () => { pulls += 1; },
      () => { cancelled = true; },
    ));

    const status = await probePromptOsRuntime(probeOptions({ fetchImpl }));

    expect(status.state).toBe('reachable');
    expect(status.reasons).toEqual(['identity_unreadable_or_too_large']);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(chunks.length + 1);
  });

  it('never echoes the operator credential into a status, whatever the outcome', async () => {
    const verified = await probePromptOsRuntime(probeOptions({
      fetchImpl: recordingFetch(() => reply(200, identity())).fetchImpl,
    }));
    const rejected = await probePromptOsRuntime(probeOptions({
      fetchImpl: recordingFetch(() => reply(401, {})).fetchImpl,
    }));
    const opaque = await probePromptOsRuntime(probeOptions({
      fetchImpl: recordingFetch(() => reply(200, 'nope')).fetchImpl,
    }));
    for (const outcome of [verified, rejected, opaque]) {
      expect(JSON.stringify(outcome).includes(CREDENTIAL)).toBe(false);
    }
  });
});

describe('PromptOS runtime proof probe', () => {
  it('refuses proof without explicit per-call authorization, so no provider is invoked', async () => {
    const { fetchImpl, calls } = neverCalled();
    const result = await probePromptOsProof(proofOptions({ fetchImpl, allowProviderInvocation: false }));
    expect(result.verified).toBe(false);
    expect(result.reasons).toEqual(['proof_not_authorized']);
    expect(calls.length).toBe(0);
  });

  it('stops before any request when the credential is missing', async () => {
    const { fetchImpl, calls } = neverCalled();
    const result = await probePromptOsProof(proofOptions({ fetchImpl, credential: undefined }));
    expect(result.verified).toBe(false);
    expect(result.reasons).toEqual(['credential_missing']);
    expect(calls.length).toBe(0);
  });

  it('posts only the normalized provider name to the registered proof endpoint', async () => {
    const { fetchImpl, calls } = recordingFetch(() => reply(200, proofBody()));
    const result = await probePromptOsProof(proofOptions({ fetchImpl, provider: ' OpenAI ' }));
    expect(result.verified).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/runtime-proof`);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers?.Authorization).toBe(`Bearer ${CREDENTIAL}`);
    expect(JSON.parse(calls[0].body ?? 'null')).toEqual({ provider: 'openai' });
  });

  it('verifies proof only when service, provider, state, authority, release, and response id all match', async () => {
    const { fetchImpl } = recordingFetch(() => reply(200, proofBody()));
    const result = await probePromptOsProof(proofOptions({ fetchImpl }));
    expect(result.verified).toBe(true);
    expect(result.responseId).toBe('resp_test_1');
    expect(result.releaseSha).toBe(SHA);
    expect(result.reasons).toEqual([]);
  });

  it('rejects proof that disagrees with the contract on any field', async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [proofBody({ service: 'other' }), 'service_mismatch'],
      [proofBody({ provider: 'anthropic' }), 'provider_mismatch'],
      [proofBody({ provider_state: 'ABSENT' }), 'provider_state_not_verified'],
      [proofBody({ authority: 'write' }), 'authority_not_none'],
      [proofBody({ release_sha: 'unknown' }), 'release_sha_invalid'],
      [proofBody({ response_id: '   ' }), 'response_id_missing'],
    ];
    for (const [body, reason] of cases) {
      const { fetchImpl } = recordingFetch(() => reply(200, body));
      const result = await probePromptOsProof(proofOptions({ fetchImpl }));
      expect(result.verified).toBe(false);
      expect(result.reasons).toContain(reason);
    }
  });

  it('honours an expected release, and maps HTTP and transport failures without verifying', async () => {
    const pinned = recordingFetch(() => reply(200, proofBody()));
    const wrongRelease = await probePromptOsProof(proofOptions({
      fetchImpl: pinned.fetchImpl,
      expectedReleaseSha: 'f'.repeat(40),
    }));
    expect(wrongRelease.verified).toBe(false);
    expect(wrongRelease.reasons).toContain('release_differs_from_expected');

    const rejected = await probePromptOsProof(proofOptions({
      fetchImpl: recordingFetch(() => reply(401, {})).fetchImpl,
    }));
    expect(rejected.verified).toBe(false);
    expect(rejected.reasons).toEqual(['credential_rejected']);

    const failed = await probePromptOsProof(proofOptions({
      fetchImpl: recordingFetch(() => reply(500, {})).fetchImpl,
    }));
    expect(failed.verified).toBe(false);
    expect(failed.reasons).toEqual(['unexpected_status']);

    const down = await probePromptOsProof(proofOptions({
      fetchImpl: recordingFetch(() => {
        throw new Error('socket hang up');
      }).fetchImpl,
    }));
    expect(down.verified).toBe(false);
    expect(down.reasons).toEqual(['unreachable']);
  });
});
