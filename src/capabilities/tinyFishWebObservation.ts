import { createHash } from 'node:crypto';
import type { Capability } from './workbenchRegistry.js';

export const TINYFISH_WEB_OBSERVATION_CAPABILITY_ID = 'tinyfish-web-observation-v1';
export const TINYFISH_SEARCH_ENDPOINT = 'https://api.search.tinyfish.ai';
export const TINYFISH_FETCH_ENDPOINT = 'https://api.fetch.tinyfish.ai';

const MAX_QUERY_LENGTH = 2_048;
const MAX_FETCH_URLS = 10;
const MAX_FETCH_TEXT_LENGTH = 100_000;

export type TinyFishReadOnlyErrorCode = 'tinyfish_invalid_request' | 'tinyfish_not_configured' | 'tinyfish_upstream_failure';
export type TinyFishContinuityTransition = 'initial' | 'confirmed' | 'changed';

export class TinyFishReadOnlyError extends Error {
  constructor(
    public readonly code: TinyFishReadOnlyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TinyFishReadOnlyError';
  }
}

export interface TinyFishContinuityInput {
  priorEvidenceFingerprint?: string | null;
  priorProofCookie?: string | null;
}

interface TinyFishContinuityReceipt {
  predecessorFingerprint: string | null;
  predecessorProofCookie: string | null;
  evidenceFingerprint: string;
  proofCookie: string;
  transition: TinyFishContinuityTransition;
  authorityEffect: 'none';
}

export interface TinyFishSearchResult {
  position: number | null;
  title: string;
  snippet: string;
  url: string;
}

export interface TinyFishFetchResult {
  title: string;
  url: string;
  text: string;
}

export interface TinyFishObservationReceipt<T> {
  contract: 'fcr/tinyfish-readonly-observation@v1';
  provider: 'tinyfish';
  operation: 'search' | 'fetch';
  authority: 'read_only';
  consequence: 'READ';
  mutationAllowed: false;
  providerAccepted: true;
  truthState: 'provider_observed_unverified';
  contentTrust: 'untrusted_web';
  observedAt: string;
  requestFingerprint: string;
  sourceUrls: string[];
  resultCount: number;
  data: T;
  continuity: TinyFishContinuityReceipt;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function proofCookieFor(evidenceFingerprint: string): string {
  return `tinyfish-readonly:v1:${evidenceFingerprint.replace(/^sha256:/, '').slice(0, 32)}`;
}

function normalizeContinuityValue(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, 256) : null;
}

function continuityReceipt(
  evidenceFingerprint: string,
  continuity: TinyFishContinuityInput = {},
): TinyFishContinuityReceipt {
  const predecessorFingerprint = normalizeContinuityValue(continuity.priorEvidenceFingerprint);
  const predecessorProofCookie = normalizeContinuityValue(continuity.priorProofCookie);
  const proofCookie = proofCookieFor(evidenceFingerprint);
  const hasPredecessor = predecessorFingerprint !== null || predecessorProofCookie !== null;
  const transition: TinyFishContinuityTransition = !hasPredecessor
    ? 'initial'
    : predecessorFingerprint === evidenceFingerprint && predecessorProofCookie === proofCookie
      ? 'confirmed'
      : 'changed';

  return {
    predecessorFingerprint,
    predecessorProofCookie,
    evidenceFingerprint,
    proofCookie,
    transition,
    authorityEffect: 'none',
  };
}

function obviousPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}

function validateFetchUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TinyFishReadOnlyError('tinyfish_invalid_request', 'TinyFish fetch URLs must be absolute HTTP(S) URLs.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TinyFishReadOnlyError('tinyfish_invalid_request', 'TinyFish fetch URLs must use HTTP or HTTPS.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname === '::1'
    || hostname === '0:0:0:0:0:0:0:1'
    || hostname === 'metadata.google.internal'
    || obviousPrivateIpv4(hostname)
  ) {
    throw new TinyFishReadOnlyError('tinyfish_invalid_request', 'TinyFish fetch refuses local or obviously private-network targets.');
  }

  return parsed.toString();
}

function normalizeSearchPayload(payload: unknown): TinyFishSearchResult[] {
  const record = asRecord(payload);
  const values = Array.isArray(record?.results) ? record.results : [];

  return values.slice(0, 50).flatMap((value, index) => {
    const result = asRecord(value);
    if (!result) return [];
    const url = cleanString(result.url, 4_096);
    if (!url) return [];
    return [{
      position: typeof result.position === 'number' && Number.isFinite(result.position)
        ? result.position
        : index + 1,
      title: cleanString(result.title, 2_000),
      snippet: cleanString(result.snippet, 8_000),
      url,
    }];
  });
}

function normalizeFetchPayload(payload: unknown): TinyFishFetchResult[] {
  const record = asRecord(payload);
  const values = Array.isArray(record?.results) ? record.results : [];

  return values.slice(0, MAX_FETCH_URLS).flatMap((value) => {
    const result = asRecord(value);
    if (!result) return [];
    const url = cleanString(result.url, 4_096);
    if (!url) return [];
    const text = cleanString(result.markdown ?? result.text ?? result.content, MAX_FETCH_TEXT_LENGTH);
    return [{
      title: cleanString(result.title, 2_000),
      url,
      text,
    }];
  });
}

export class TinyFishReadOnlyClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    const normalized = apiKey.trim();
    if (!normalized) {
      throw new TinyFishReadOnlyError('tinyfish_not_configured', 'TinyFish provider is not configured.');
    }
    this.apiKey = normalized;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): TinyFishReadOnlyClient {
    return new TinyFishReadOnlyClient(env.TINYFISH_API_KEY ?? '');
  }

  private async request(url: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.headers ?? {}),
          'X-API-Key': this.apiKey,
        },
      });
    } catch {
      throw new TinyFishReadOnlyError('tinyfish_upstream_failure', 'TinyFish upstream request failed.');
    }

    if (!response.ok) {
      throw new TinyFishReadOnlyError('tinyfish_upstream_failure', `TinyFish upstream returned HTTP ${response.status}.`);
    }

    try {
      return await response.json();
    } catch {
      throw new TinyFishReadOnlyError('tinyfish_upstream_failure', 'TinyFish upstream returned invalid JSON.');
    }
  }

  async search(
    query: string,
    continuity: TinyFishContinuityInput = {},
  ): Promise<TinyFishObservationReceipt<{ query: string; results: TinyFishSearchResult[] }>> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || normalizedQuery.length > MAX_QUERY_LENGTH) {
      throw new TinyFishReadOnlyError('tinyfish_invalid_request', `TinyFish search query must be between 1 and ${MAX_QUERY_LENGTH} characters.`);
    }

    const endpoint = `${TINYFISH_SEARCH_ENDPOINT}?${new URLSearchParams({ query: normalizedQuery }).toString()}`;
    const payload = await this.request(endpoint);
    const results = normalizeSearchPayload(payload);
    const data = { query: normalizedQuery, results };
    const requestFingerprint = sha256({ provider: 'tinyfish', operation: 'search', query: normalizedQuery });
    const evidenceFingerprint = sha256({ provider: 'tinyfish', operation: 'search', data });

    return {
      contract: 'fcr/tinyfish-readonly-observation@v1',
      provider: 'tinyfish',
      operation: 'search',
      authority: 'read_only',
      consequence: 'READ',
      mutationAllowed: false,
      providerAccepted: true,
      truthState: 'provider_observed_unverified',
      contentTrust: 'untrusted_web',
      observedAt: new Date().toISOString(),
      requestFingerprint,
      sourceUrls: results.map((result) => result.url),
      resultCount: results.length,
      data,
      continuity: continuityReceipt(evidenceFingerprint, continuity),
    };
  }

  async fetchUrls(
    urls: string[],
    continuity: TinyFishContinuityInput = {},
  ): Promise<TinyFishObservationReceipt<{ requestedUrls: string[]; format: 'markdown'; results: TinyFishFetchResult[] }>> {
    if (urls.length < 1 || urls.length > MAX_FETCH_URLS) {
      throw new TinyFishReadOnlyError('tinyfish_invalid_request', `TinyFish fetch requires between 1 and ${MAX_FETCH_URLS} URLs.`);
    }
    const requestedUrls = urls.map((url) => validateFetchUrl(url));
    const payload = await this.request(TINYFISH_FETCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: requestedUrls, format: 'markdown' }),
    });
    const results = normalizeFetchPayload(payload);
    const data = { requestedUrls, format: 'markdown' as const, results };
    const requestFingerprint = sha256({ provider: 'tinyfish', operation: 'fetch', requestedUrls, format: 'markdown' });
    const evidenceFingerprint = sha256({ provider: 'tinyfish', operation: 'fetch', data });

    return {
      contract: 'fcr/tinyfish-readonly-observation@v1',
      provider: 'tinyfish',
      operation: 'fetch',
      authority: 'read_only',
      consequence: 'READ',
      mutationAllowed: false,
      providerAccepted: true,
      truthState: 'provider_observed_unverified',
      contentTrust: 'untrusted_web',
      observedAt: new Date().toISOString(),
      requestFingerprint,
      sourceUrls: results.length > 0 ? results.map((result) => result.url) : requestedUrls,
      resultCount: results.length,
      data,
      continuity: continuityReceipt(evidenceFingerprint, continuity),
    };
  }
}

export const TINYFISH_WEB_OBSERVATION_CAPABILITY: Capability = {
  id: TINYFISH_WEB_OBSERVATION_CAPABILITY_ID,
  kind: 'Automation',
  category: 'integrations',
  score: 97,
  runtime: 'dynamic',
  summary: 'Search the public web or fetch approved public URLs through TinyFish without granting TinyFish mutation authority.',
  purpose: 'Give FCR a bounded read-only web observation lane that emits source URLs, evidence fingerprints, continuity proof-cookie metadata, and an explicit no-authority receipt before any downstream decision or action.',
  inputs: [
    ['operation', 'enum', 'search | fetch'],
    ['query', 'string', 'Required for search; founder-bounded public-web query'],
    ['urls', 'https URL[]', 'Required for fetch; 1-10 public HTTP(S) targets'],
    ['priorEvidenceFingerprint', 'fingerprint', 'Optional predecessor observation used only to classify continuity'],
    ['priorProofCookie', 'non-secret marker', 'Optional predecessor continuity marker; never authority'],
  ],
  environment: [
    'TINYFISH_API_KEY (server-side only)',
    `Search endpoint: ${TINYFISH_SEARCH_ENDPOINT}`,
    `Fetch endpoint: ${TINYFISH_FETCH_ENDPOINT}`,
    'FCR remains the control plane; returned web content is untrusted input',
  ],
  proof: [
    'Founder authorization is required before the FCR route executes',
    'Every successful observation returns source URLs plus request/evidence fingerprints',
    'Continuity reports initial, confirmed, or changed without renewing authority',
    'Proof-cookie metadata is returned as a non-secret state marker and is never emitted as a browser cookie',
    'Receipt pins authority=read_only, consequence=READ, mutationAllowed=false, and authorityEffect=none',
    'Provider acceptance remains separate from the truth of fetched web content or any founder outcome',
  ],
  risk: 'Read-only web observation only. Search/fetched text is untrusted data and never executable instruction, founder approval, merge/deploy/publication authority, or verified outcome. The route rejects local/obviously private fetch targets, never returns the API key, and performs no external mutation.',
  implementation: 'Runtime-backed: POST /capabilities/tinyfish-web-observation-v1/runs with { operation, query | urls, priorEvidenceFingerprint?, priorProofCookie? }. The synchronous response is a read-only observation receipt; no provider write path exists.',
};
