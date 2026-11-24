import { findPortfolioSwitch, type PortfolioSwitchDefinition } from '../switchboard/catalog.js';

// Read-only federation between Founder Control Room (C) and the PromptOS shared-service API (B).
// The registration comes from the existing switchboard catalog entry. Nothing here creates a new registry.
// HTTP 200 alone never produces a verified state: identity schema, service, exact release, freshness,
// and authority are all checked. Operational readiness is never claimed by identity alone.
//
// States:
//   unavailable = no identity obtained (not registered, no credential, rejected, down, timeout, 503)
//   reachable   = a 200 arrived but identity failed the contract (schema, service, release, freshness, authority)
//   verified    = identity passed the contract; provider states are reported as observed
//   degraded    = identity verified, but a REQUIRED provider is ABSENT or missing, or the release differs from expected
// Runtime proof (provider invocation) is a separate probe and needs allowProviderInvocation on every call.

export const PROMPTOS_SERVICE_ID = 'promptos' as const;
export const PROMPTOS_CATALOG_ID = 'promptos-live-provider-runtime' as const;
export const PROMPTOS_RUNTIME_IDENTITY_SCHEMA = 'promptos/shared-runtime-identity@v1' as const;
export const PROMPTOS_BASE_URL_ENV = 'PROMPTOS_SHARED_API_BASE_URL' as const;
export const PROMPTOS_CREDENTIAL_ENV = 'PROMPTOS_AI_OPERATOR_KEY' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const PROVIDER_STATES = new Set(['INTEGRATED', 'ABSENT']);
const MAX_JSON_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_AGE_MS = 5 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;

type JsonRecord = Record<string, unknown>;

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}>;

export type PromptOsRuntimeState = 'unavailable' | 'reachable' | 'verified' | 'degraded';

export interface PromptOsRegistration {
  readonly serviceId: typeof PROMPTOS_SERVICE_ID;
  readonly catalogId: typeof PROMPTOS_CATALOG_ID;
  readonly repository: string;
  readonly auditedSha: string | null;
  readonly baseUrl: string;
}

export interface PromptOsRuntimeStatus {
  readonly state: PromptOsRuntimeState;
  readonly serviceId: typeof PROMPTOS_SERVICE_ID;
  readonly catalogId: typeof PROMPTOS_CATALOG_ID;
  readonly checkedAt: string;
  readonly observedAt: string | null;
  readonly releaseSha: string | null;
  readonly identityVerified: boolean;
  readonly providers: Readonly<Record<string, 'INTEGRATED' | 'ABSENT'>>;
  readonly operationalReadiness: 'unproven';
  readonly authority: 'none';
  readonly reasons: readonly string[];
}

export interface PromptOsProofResult {
  readonly provider: string;
  readonly verified: boolean;
  readonly releaseSha: string | null;
  readonly responseId: string | null;
  readonly reasons: readonly string[];
}

type EnvLike = Readonly<Record<string, string | undefined>>;

function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return url.origin;
}

/**
 * Discovers PromptOS as a registered service: the catalog entry supplies identity and
 * repository, and the environment supplies the https origin. Missing pieces fail closed.
 */
export function resolvePromptOsRegistration(
  env: EnvLike,
  lookup: (id: string) => PortfolioSwitchDefinition | null = findPortfolioSwitch,
): { registration: PromptOsRegistration | null; reasons: string[] } {
  const entry = lookup(PROMPTOS_CATALOG_ID);
  if (!entry) return { registration: null, reasons: ['catalog_entry_missing'] };
  if (!entry.repository) return { registration: null, reasons: ['catalog_repository_missing'] };
  const baseUrl = normalizeBaseUrl(env[PROMPTOS_BASE_URL_ENV]);
  if (!baseUrl) return { registration: null, reasons: ['base_url_missing_or_invalid'] };
  return {
    registration: {
      serviceId: PROMPTOS_SERVICE_ID,
      catalogId: PROMPTOS_CATALOG_ID,
      repository: entry.repository,
      auditedSha: entry.auditedSha,
      baseUrl,
    },
    reasons: [],
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

async function withDeadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readBounded(response: {
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}, timeoutMs: number): Promise<string | null> {
  if (!response.body) {
    const raw = await response.text();
    return Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES ? null : raw;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let raw = '';
  // The request deadline is disarmed once headers arrive, so the body needs its own bound.
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    reader.cancel('response_body_deadline').catch(() => undefined);
  }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired) throw new Error('response_body_deadline');
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_JSON_BYTES) {
        await reader.cancel('response_body_too_large').catch(() => undefined);
        return null;
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return raw;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

interface IdentityFacts {
  observedAt: string | null;
  releaseSha: string | null;
  providers: Record<string, 'INTEGRATED' | 'ABSENT'>;
}

function evaluateIdentity(body: unknown, now: Date, maxAgeMs: number): { reasons: string[]; facts: IdentityFacts } {
  const reasons: string[] = [];
  const facts: IdentityFacts = { observedAt: null, releaseSha: null, providers: {} };
  const record = asRecord(body);
  if (!record) return { reasons: ['identity_not_object'], facts };

  if (record.schema === undefined) reasons.push('identity_lacks_schema');
  else if (record.schema !== PROMPTOS_RUNTIME_IDENTITY_SCHEMA) reasons.push('schema_mismatch');

  if (record.service !== PROMPTOS_SERVICE_ID) reasons.push('service_mismatch');

  if (typeof record.release_sha === 'string' && FULL_SHA.test(record.release_sha)) {
    facts.releaseSha = record.release_sha.toLowerCase();
  } else {
    reasons.push('release_sha_invalid');
  }

  const observed = typeof record.observed_at === 'string' ? Date.parse(record.observed_at) : Number.NaN;
  if (!Number.isFinite(observed)) {
    reasons.push('identity_lacks_freshness');
  } else {
    facts.observedAt = new Date(observed).toISOString();
    if (now.getTime() - observed > maxAgeMs) reasons.push('identity_stale');
    if (observed - now.getTime() > MAX_CLOCK_SKEW_MS) reasons.push('identity_from_future');
  }

  if (record.authority !== 'none') reasons.push('authority_not_none');

  const providers = asRecord(record.providers);
  const names = providers ? Object.keys(providers) : [];
  const valid = providers !== null && names.length > 0 && names.every((name) => {
    const entry = asRecord(providers[name]);
    return entry !== null && typeof entry.state === 'string' && PROVIDER_STATES.has(entry.state);
  });
  if (!valid || !providers) {
    reasons.push('providers_invalid');
  } else {
    for (const name of names) {
      const entry = asRecord(providers[name]) as JsonRecord;
      facts.providers[name] = entry.state as 'INTEGRATED' | 'ABSENT';
    }
  }
  return { reasons, facts };
}

export interface PromptOsProbeOptions {
  readonly registration: PromptOsRegistration | null;
  readonly registrationReasons?: readonly string[];
  readonly credential: string | null | undefined;
  readonly fetchImpl: FetchLike;
  readonly now: Date;
  readonly expectedReleaseSha?: string | null;
  readonly timeoutMs?: number;
  readonly maxAgeMs?: number;
  /** Providers FCR depends on. Other providers are reported as observed and never degrade the state. */
  readonly requiredProviders?: readonly string[];
}

/**
 * Probes the protected identity endpoint with FCR's own credential. Without a credential the
 * endpoint is never called, so protected routes are not exposed to health checks.
 */
export async function probePromptOsRuntime(options: PromptOsProbeOptions): Promise<PromptOsRuntimeStatus> {
  const checkedAt = options.now.toISOString();
  const base = {
    serviceId: PROMPTOS_SERVICE_ID,
    catalogId: PROMPTOS_CATALOG_ID,
    checkedAt,
    operationalReadiness: 'unproven',
    authority: 'none',
  } as const;
  const empty = { observedAt: null, releaseSha: null, identityVerified: false, providers: {} } as const;

  const { registration } = options;
  if (!registration) {
    return { ...base, ...empty, state: 'unavailable', reasons: [...(options.registrationReasons ?? ['not_registered'])] };
  }
  const credential = options.credential?.trim();
  if (!credential) {
    return { ...base, ...empty, state: 'unavailable', reasons: ['credential_missing'] };
  }

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await withDeadline(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, (signal) => options.fetchImpl(
      `${registration.baseUrl}/runtime-identity`,
      {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${credential}` },
        signal,
      },
    ));
  } catch (error) {
    return { ...base, ...empty, state: 'unavailable', reasons: [isAbort(error) ? 'timeout' : 'unreachable'] };
  }

  if (response.status === 401 || response.status === 403) {
    return { ...base, ...empty, state: 'unavailable', reasons: ['credential_rejected'] };
  }
  if (response.status === 503) {
    return { ...base, ...empty, state: 'unavailable', reasons: ['service_unavailable'] };
  }
  if (!response.ok) {
    return { ...base, ...empty, state: 'unavailable', reasons: ['unexpected_status'] };
  }

  // From here the endpoint responded with 200. That is reachable, never verified on its own.
  const raw = await readBounded(response, options.timeoutMs ?? DEFAULT_TIMEOUT_MS).catch(() => null);
  if (raw === null) {
    return { ...base, ...empty, state: 'reachable', reasons: ['identity_unreadable_or_too_large'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...base, ...empty, state: 'reachable', reasons: ['identity_not_json'] };
  }

  const { reasons, facts } = evaluateIdentity(parsed, options.now, options.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  if (reasons.length > 0) {
    return {
      ...base,
      state: 'reachable',
      observedAt: facts.observedAt,
      releaseSha: facts.releaseSha,
      identityVerified: false,
      providers: facts.providers,
      reasons,
    };
  }

  const degradedReasons: string[] = [];
  if (options.expectedReleaseSha && facts.releaseSha !== options.expectedReleaseSha.toLowerCase()) {
    degradedReasons.push('release_differs_from_expected');
  }
  for (const name of options.requiredProviders ?? []) {
    const observed = facts.providers[name];
    if (observed === undefined) degradedReasons.push(`provider_missing:${name}`);
    else if (observed === 'ABSENT') degradedReasons.push(`provider_absent:${name}`);
  }
  return {
    ...base,
    state: degradedReasons.length > 0 ? 'degraded' : 'verified',
    observedAt: facts.observedAt,
    releaseSha: facts.releaseSha,
    identityVerified: true,
    providers: facts.providers,
    reasons: degradedReasons,
  };
}

export interface PromptOsProofOptions {
  readonly registration: PromptOsRegistration | null;
  readonly credential: string | null | undefined;
  readonly provider: string;
  readonly fetchImpl: FetchLike;
  /** Runtime proof invokes a provider and spends budget. It must be explicitly authorized per call. */
  readonly allowProviderInvocation: boolean;
  readonly expectedReleaseSha?: string | null;
  readonly timeoutMs?: number;
}

export async function probePromptOsProof(options: PromptOsProofOptions): Promise<PromptOsProofResult> {
  const provider = options.provider.trim().toLowerCase();
  const fail = (reasons: string[]): PromptOsProofResult => ({
    provider, verified: false, releaseSha: null, responseId: null, reasons,
  });
  if (!options.allowProviderInvocation) return fail(['proof_not_authorized']);
  const registration = options.registration;
  if (!registration) return fail(['not_registered']);
  const credential = options.credential?.trim();
  if (!credential) return fail(['credential_missing']);

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await withDeadline(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, (signal) => options.fetchImpl(
      `${registration.baseUrl}/runtime-proof`,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${credential}` },
        body: JSON.stringify({ provider }),
        signal,
      },
    ));
  } catch (error) {
    return fail([isAbort(error) ? 'timeout' : 'unreachable']);
  }
  if (response.status === 401 || response.status === 403) return fail(['credential_rejected']);
  if (!response.ok) return fail(['unexpected_status']);

  const raw = await readBounded(response, options.timeoutMs ?? DEFAULT_TIMEOUT_MS).catch(() => null);
  if (raw === null) return fail(['proof_unreadable_or_too_large']);
  let body: JsonRecord | null;
  try {
    body = asRecord(JSON.parse(raw));
  } catch {
    return fail(['proof_not_json']);
  }
  if (!body) return fail(['proof_not_object']);

  const reasons: string[] = [];
  if (body.service !== PROMPTOS_SERVICE_ID) reasons.push('service_mismatch');
  if (body.provider !== provider) reasons.push('provider_mismatch');
  if (body.provider_state !== 'VERIFIED') reasons.push('provider_state_not_verified');
  if (body.authority !== 'none') reasons.push('authority_not_none');
  const releaseSha = typeof body.release_sha === 'string' && FULL_SHA.test(body.release_sha)
    ? body.release_sha.toLowerCase()
    : null;
  if (!releaseSha) reasons.push('release_sha_invalid');
  if (options.expectedReleaseSha && releaseSha !== options.expectedReleaseSha.toLowerCase()) {
    reasons.push('release_differs_from_expected');
  }
  const responseId = typeof body.response_id === 'string' && body.response_id.trim() ? body.response_id : null;
  if (!responseId) reasons.push('response_id_missing');

  return { provider, verified: reasons.length === 0, releaseSha, responseId, reasons };
}
