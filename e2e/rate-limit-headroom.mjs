/**
 * Local browser-proof scheduling only. Observe the real FCR per-IP rate limiter
 * and wait for its own bounded reset before a multi-request proof section.
 * Never bypass middleware, increase server limits, fake responses, retry writes,
 * or count rate-limit waiting as a passing application assertion.
 */
export async function ensureRateLimitHeadroom(
  url,
  {
    minimumRemaining = 45,
    fetchFn = globalThis.fetch,
    nowFn = Date.now,
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  if (!Number.isSafeInteger(minimumRemaining) || minimumRemaining < 1) {
    throw new Error('E2E_RATE_LIMIT_INVALID_BUDGET');
  }
  async function observe() {
    const response = await fetchFn(url, { method: 'GET', cache: 'no-store' });
    const limit = Number(response.headers.get('ratelimit-limit'));
    const remaining = Number(response.headers.get('ratelimit-remaining'));
    const resetSeconds = Number(response.headers.get('ratelimit-reset'));
    if ((response.status !== 200 && response.status !== 429)
      || !Number.isSafeInteger(limit) || limit < minimumRemaining
      || !Number.isSafeInteger(remaining) || remaining < 0 || remaining > limit
      || !Number.isSafeInteger(resetSeconds) || resetSeconds <= 0) {
      throw new Error('E2E_RATE_LIMIT_RECEIPT_INVALID');
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter === null || !/^\d+$/.test(retryAfter.trim())
        || Number(retryAfter) < 1 || Number(retryAfter) > 61) {
        throw new Error('E2E_RATE_LIMIT_RETRY_AFTER_INVALID');
      }
    }
    return { status: response.status, remaining, limit, resetSeconds };
  }
  const first = await observe();
  if (first.status === 200 && first.remaining >= minimumRemaining) {
    return { waited: false, remaining: first.remaining };
  }
  // The server uses an absolute epoch-second reset; do not invent delays.
  const waitMs = Math.max(1, first.resetSeconds * 1000 - nowFn() + 500);
  if (!Number.isSafeInteger(waitMs) || waitMs > 61_000) {
    throw new Error('E2E_RATE_LIMIT_RESET_UNBOUNDED');
  }
  await sleepFn(waitMs);
  const next = await observe();
  if (next.status !== 200 || next.remaining < minimumRemaining) {
    throw new Error('E2E_RATE_LIMIT_HEADROOM_UNAVAILABLE');
  }
  return { waited: true, waitedMs: waitMs, remaining: next.remaining };
}
