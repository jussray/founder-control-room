const INSTALL_KEY = '__fcrSafeRateLimitFetchInstalled';
const MAX_RETRY_AFTER_SECONDS = 61;
const SAFE_METHODS = new Set(['GET', 'HEAD']);

export function parseBoundedRetryAfter(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_RETRY_AFTER_SECONDS) return null;
  return seconds;
}

function requestMethod(input, init) {
  const explicit = init?.method;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim().toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function requestUrl(input, origin) {
  try {
    const raw = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
    return new URL(raw, origin);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithSafeRateLimitRetry(
  nativeFetch,
  input,
  init,
  { origin = globalThis.location?.origin, sleepFn = sleep } = {},
) {
  const method = requestMethod(input, init);
  const url = requestUrl(input, origin);
  const first = await nativeFetch(input, init);

  // Mutation retries can duplicate consequential actions when outcome truth is
  // ambiguous. Only retry safe browser reads, and only for this same-origin
  // Control Room boundary.
  if (!SAFE_METHODS.has(method) || !url || !origin || url.origin !== origin || first.status !== 429) {
    return first;
  }

  // Require the same rate-limit evidence emitted by FCR's general limiter.
  // Missing/malformed evidence remains a visible 429 instead of becoming an
  // invented retry policy.
  if (!first.headers.get('ratelimit-limit') || !first.headers.get('ratelimit-reset')) return first;
  const retryAfterSeconds = parseBoundedRetryAfter(first.headers.get('retry-after'));
  if (retryAfterSeconds === null) return first;

  await sleepFn((retryAfterSeconds * 1000) + 250);
  return nativeFetch(input, init);
}

export function installSafeRateLimitFetch(target = globalThis) {
  if (!target?.fetch || target[INSTALL_KEY]) return false;
  const nativeFetch = target.fetch.bind(target);
  const origin = target.location?.origin;
  target.fetch = (input, init) => fetchWithSafeRateLimitRetry(nativeFetch, input, init, { origin });
  Object.defineProperty(target, INSTALL_KEY, { value: true, configurable: false, enumerable: false });
  return true;
}

if (typeof window !== 'undefined') installSafeRateLimitFetch(window);
