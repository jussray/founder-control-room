import {
  validateProductBuildDirective,
  validateProductBuildReceipt,
  type ProductBuildDirective,
  type ProductBuildReceipt,
} from './productBuildDirective.js';

export const STORYENGINE_PRODUCT_BUILD_PROJECT = 'l99' as const;
export const STORYENGINE_PRODUCT_BUILD_REPOSITORY = 'jussray/StoryEngine' as const;
export const STORYENGINE_PRODUCT_CONTROL_ROOM = 'storyengine-control-room' as const;
export const STORYENGINE_PRODUCT_BUILD_CAPABILITY = 'founder-control-room-federation' as const;
export const STORYENGINE_PRODUCT_BUILD_ACTION = 'build-product-control-room-loop' as const;
export const STORYENGINE_PRODUCT_BUILD_MUTATION_SCOPE = 'control-room:event-log' as const;

const MAX_JSON_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const FULL_SHA = /^[0-9a-f]{40}$/i;

type JsonRecord = Record<string, unknown>;

type FetchLike = (
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
  text(): Promise<string>;
}>;

export interface StoryEngineRuntimeIdentity {
  service: 'l99-story-engine';
  release_sha: string;
  runtime_mode: string;
  state_backend: string;
  persistence_contract: string;
  started_at: string;
}

export interface ProductBuildFederationReconciliation {
  state: 'verified';
  directive: ProductBuildDirective;
  receipt: ProductBuildReceipt;
  runtimeIdentityBefore: StoryEngineRuntimeIdentity;
  runtimeIdentityAfter: StoryEngineRuntimeIdentity;
  exactHeadVerified: true;
  serviceIdentityVerified: true;
  receiptVerified: true;
  mergePerformed: false;
  deployPerformed: false;
  providerMutationPerformed: false;
}

export class ProductBuildFederationError extends Error {
  readonly code: string;
  readonly mayHaveExecuted: boolean;

  constructor(code: string, message: string, mayHaveExecuted = false) {
    super(message);
    this.name = 'ProductBuildFederationError';
    this.code = code;
    this.mayHaveExecuted = mayHaveExecuted;
  }
}

export interface ProductBuildFederationOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort()
    : [];
}

function exactList(actual: unknown, expected: readonly string[]): boolean {
  return JSON.stringify(stringArray(actual)) === JSON.stringify([...expected].sort());
}

function runtimeIdentity(value: unknown): StoryEngineRuntimeIdentity | null {
  const candidate = record(value);
  if (!candidate) return null;
  const service = text(candidate.service);
  const releaseSha = text(candidate.release_sha).toLowerCase();
  const runtimeMode = text(candidate.runtime_mode);
  const stateBackend = text(candidate.state_backend);
  const persistenceContract = text(candidate.persistence_contract);
  const startedAt = text(candidate.started_at);
  if (service !== 'l99-story-engine' || !FULL_SHA.test(releaseSha) || !startedAt) return null;
  return {
    service: 'l99-story-engine',
    release_sha: releaseSha,
    runtime_mode: runtimeMode,
    state_backend: stateBackend,
    persistence_contract: persistenceContract,
    started_at: startedAt,
  };
}

function receiptFromUnknown(value: unknown): ProductBuildReceipt | null {
  const candidate = record(value);
  if (!candidate) return null;
  return {
    contract: candidate.contract as ProductBuildReceipt['contract'],
    directiveHash: text(candidate.directiveHash).toLowerCase(),
    productControlRoomId: text(candidate.productControlRoomId),
    repository: text(candidate.repository),
    status: candidate.status as ProductBuildReceipt['status'],
    changedResources: stringArray(candidate.changedResources),
    proofRefs: stringArray(candidate.proofRefs),
    executionReceiptId: text(candidate.executionReceiptId),
    mergePerformed: candidate.mergePerformed as false,
    deployPerformed: candidate.deployPerformed as false,
    providerMutationPerformed: candidate.providerMutationPerformed as false,
    receiptHash: text(candidate.receiptHash).toLowerCase(),
  };
}

function normalizedBaseUrl(value: string): string {
  const configured = value.trim();
  if (!configured) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_FEDERATION_NOT_CONFIGURED',
      'STORYENGINE_PRODUCT_CONTROL_ROOM_URL is required before StoryEngine federation can execute.',
    );
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ProductBuildFederationError('PRODUCT_BUILD_FEDERATION_URL_INVALID', 'StoryEngine federation URL is invalid.');
  }
  const localhost = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_FEDERATION_URL_INSECURE',
      'StoryEngine federation requires HTTPS except for an explicit loopback test runtime.',
    );
  }
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

async function readBoundedJson(response: { text(): Promise<string> }, label: string): Promise<unknown> {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) {
    throw new ProductBuildFederationError('PRODUCT_BUILD_RESPONSE_TOO_LARGE', `${label} exceeded the bounded response size.`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ProductBuildFederationError('PRODUCT_BUILD_RESPONSE_INVALID', `${label} did not return valid JSON.`);
  }
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

function defaultFetch(input: string, init?: Parameters<FetchLike>[1]) {
  return fetch(input, init);
}

async function fetchStoryEngineRuntimeIdentity(
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<StoryEngineRuntimeIdentity> {
  let response;
  try {
    response = await withDeadline(timeoutMs, (signal) => fetchImpl(`${baseUrl}/runtime-identity`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    }));
  } catch (error) {
    if (error instanceof ProductBuildFederationError) throw error;
    throw new ProductBuildFederationError('PRODUCT_BUILD_RUNTIME_UNAVAILABLE', 'StoryEngine runtime identity could not be read.');
  }
  if (!response.ok) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_RUNTIME_UNAVAILABLE',
      `StoryEngine runtime identity returned HTTP ${response.status}.`,
    );
  }
  const parsed = runtimeIdentity(await readBoundedJson(response, 'StoryEngine runtime identity'));
  if (!parsed) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_RUNTIME_IDENTITY_INVALID',
      'StoryEngine runtime identity is missing exact service/release evidence.',
    );
  }
  return parsed;
}

export function reconcileStoryEngineProductBuild(input: {
  directive: ProductBuildDirective;
  receipt: ProductBuildReceipt;
  runtimeIdentityBefore: StoryEngineRuntimeIdentity;
  runtimeIdentityAfter: StoryEngineRuntimeIdentity;
}): ProductBuildFederationReconciliation {
  const directiveErrors = validateProductBuildDirective(input.directive);
  const errors = [...directiveErrors];
  const expectedHead = input.directive.proposal.expectedHeadSha?.toLowerCase() ?? '';

  if (input.directive.proposal.projectSlug !== STORYENGINE_PRODUCT_BUILD_PROJECT) errors.push('product build directive must target project l99');
  if (input.directive.proposal.actionType !== STORYENGINE_PRODUCT_BUILD_ACTION) errors.push('product build directive actionType is outside the StoryEngine federation boundary');
  if (input.directive.repository !== STORYENGINE_PRODUCT_BUILD_REPOSITORY) errors.push('product build directive repository is outside the StoryEngine federation boundary');
  if (input.directive.productControlRoomId !== STORYENGINE_PRODUCT_CONTROL_ROOM) errors.push('product build directive control room is outside the StoryEngine federation boundary');
  if (!exactList(input.directive.allowedCapabilities, [STORYENGINE_PRODUCT_BUILD_CAPABILITY])) errors.push('product build directive capability set is outside the StoryEngine federation boundary');
  if (!exactList(input.directive.allowedMutationScope, [STORYENGINE_PRODUCT_BUILD_MUTATION_SCOPE])) errors.push('product build directive mutation scope is outside the StoryEngine federation boundary');

  if (input.runtimeIdentityBefore.service !== 'l99-story-engine' || input.runtimeIdentityAfter.service !== 'l99-story-engine') {
    errors.push('StoryEngine service identity mismatch');
  }
  if (!FULL_SHA.test(expectedHead)) errors.push('StoryEngine exact target head is invalid');
  if (input.runtimeIdentityBefore.release_sha.toLowerCase() !== expectedHead) errors.push('StoryEngine runtime head did not match the exact directive head before execution');
  if (input.runtimeIdentityAfter.release_sha.toLowerCase() !== expectedHead) errors.push('StoryEngine runtime head did not match the exact directive head after execution');
  if (input.runtimeIdentityAfter.started_at !== input.runtimeIdentityBefore.started_at) errors.push('StoryEngine runtime changed during product-build execution');

  errors.push(...validateProductBuildReceipt(input.receipt, input.directive));
  if (!exactList(input.receipt.changedResources, [STORYENGINE_PRODUCT_BUILD_MUTATION_SCOPE])) {
    errors.push('StoryEngine receipt changed resources outside the bounded event-log actuator');
  }

  if (errors.length > 0) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_RECONCILIATION_FAILED',
      [...new Set(errors)].join('; '),
      true,
    );
  }

  return {
    state: 'verified',
    directive: input.directive,
    receipt: input.receipt,
    runtimeIdentityBefore: input.runtimeIdentityBefore,
    runtimeIdentityAfter: input.runtimeIdentityAfter,
    exactHeadVerified: true,
    serviceIdentityVerified: true,
    receiptVerified: true,
    mergePerformed: false,
    deployPerformed: false,
    providerMutationPerformed: false,
  };
}

export async function dispatchStoryEngineProductBuildDirective(
  directive: ProductBuildDirective,
  options: ProductBuildFederationOptions = {},
): Promise<ProductBuildFederationReconciliation> {
  const directiveErrors = validateProductBuildDirective(directive);
  if (directiveErrors.length > 0) {
    throw new ProductBuildFederationError('PRODUCT_BUILD_DIRECTIVE_INVALID', directiveErrors.join('; '));
  }

  const baseUrl = normalizedBaseUrl(options.baseUrl ?? process.env.STORYENGINE_PRODUCT_CONTROL_ROOM_URL ?? '');
  const apiKey = (options.apiKey ?? process.env.STORYENGINE_PRODUCT_CONTROL_ROOM_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_FEDERATION_NOT_CONFIGURED',
      'STORYENGINE_PRODUCT_CONTROL_ROOM_API_KEY is required before StoryEngine federation can execute.',
    );
  }
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 60_000));

  const runtimeIdentityBefore = await fetchStoryEngineRuntimeIdentity(baseUrl, fetchImpl, timeoutMs);
  const expectedHead = directive.proposal.expectedHeadSha?.toLowerCase() ?? '';
  if (runtimeIdentityBefore.release_sha.toLowerCase() !== expectedHead) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_STALE_RUNTIME',
      `StoryEngine runtime head ${runtimeIdentityBefore.release_sha} does not match directive head ${expectedHead}.`,
    );
  }

  let response;
  try {
    response = await withDeadline(timeoutMs, (signal) => fetchImpl(`${baseUrl}/api/control-room/product-build/execute`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ directive }),
      signal,
    }));
  } catch {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_EXECUTION_UNKNOWN',
      'StoryEngine product-build request did not return a terminal response; do not blind-retry because the event-log actuator may have executed.',
      true,
    );
  }

  if (!response.ok) {
    const body = await readBoundedJson(response, 'StoryEngine product-build response').catch(() => null);
    const detail = record(body);
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_EXECUTION_REJECTED',
      text(detail?.error) || `StoryEngine rejected product-build execution with HTTP ${response.status}.`,
      false,
    );
  }

  const payload = record(await readBoundedJson(response, 'StoryEngine product-build response'));
  const receipt = receiptFromUnknown(payload?.receipt);
  if (!receipt) {
    throw new ProductBuildFederationError(
      'PRODUCT_BUILD_EXECUTION_UNKNOWN',
      'StoryEngine returned no valid product-build receipt; do not blind-retry because the event-log actuator may have executed.',
      true,
    );
  }

  const runtimeIdentityAfter = await fetchStoryEngineRuntimeIdentity(baseUrl, fetchImpl, timeoutMs).catch((error) => {
    if (error instanceof ProductBuildFederationError) {
      throw new ProductBuildFederationError('PRODUCT_BUILD_EXECUTION_UNKNOWN', error.message, true);
    }
    throw error;
  });

  return reconcileStoryEngineProductBuild({
    directive,
    receipt,
    runtimeIdentityBefore,
    runtimeIdentityAfter,
  });
}
