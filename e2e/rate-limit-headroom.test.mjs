import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureRateLimitHeadroom } from './rate-limit-headroom.mjs';

const epoch = 1_800_000_000_000;
function receipt({ status = 200, remaining = 75, reset = epoch / 1000 + 20, retryAfter = status === 429 ? '20' : null, limit = '120' } = {}) {
  const headers = new Map([
    ['ratelimit-limit', limit],
    ['ratelimit-remaining', String(remaining)],
    ['ratelimit-reset', String(reset)],
  ]);
  if (retryAfter !== null) headers.set('retry-after', retryAfter);
  return { status, headers: { get(name) { return headers.get(name) ?? null; } } };
}

test('honors existing sufficient real limiter budget without any timer', async () => {
  let waits = 0;
  const result = await ensureRateLimitHeadroom('http://127.0.0.1/health', {
    fetchFn: async () => receipt(),
    nowFn: () => epoch,
    sleepFn: async () => { waits += 1; },
  });
  assert.deepEqual(result, { waited: false, remaining: 75 });
  assert.equal(waits, 0);
});

test('waits for a bounded real reset and verifies renewed headroom', async () => {
  const sequence = [receipt({ status: 429, remaining: 0 }), receipt({ remaining: 119 })];
  let calls = 0;
  const waits = [];
  const result = await ensureRateLimitHeadroom('http://127.0.0.1/health', {
    fetchFn: async () => { calls += 1; return sequence.shift(); },
    nowFn: () => epoch,
    sleepFn: async (ms) => waits.push(ms),
  });
  assert.equal(result.waited, true);
  assert.equal(result.remaining, 119);
  assert.deepEqual(waits, [20_500]);
  assert.equal(calls, 2);
});

test('does not bypass an exhausted limiter after its claimed reset', async () => {
  const sequence = [receipt({ remaining: 5 }), receipt({ status: 429, remaining: 0 })];
  await assert.rejects(ensureRateLimitHeadroom('http://127.0.0.1/health', {
    fetchFn: async () => sequence.shift(),
    nowFn: () => epoch,
    sleepFn: async () => {},
  }), /HEADROOM_UNAVAILABLE/);
});

test('rejects malformed, absent and unbounded rate-limit evidence', async () => {
  for (const response of [
    receipt({ status: 429, remaining: 0, retryAfter: null }),
    receipt({ status: 429, remaining: 0, retryAfter: '620' }),
    receipt({ status: 429, remaining: 0, reset: epoch / 1000 + 500 }),
    receipt({ status: 503 }),
    { status: 429, headers: { get: () => null } },
  ]) {
    await assert.rejects(
      ensureRateLimitHeadroom('http://127.0.0.1/health', {
        fetchFn: async () => response,
        nowFn: () => epoch,
        sleepFn: async () => {},
      }), /E2E_RATE_LIMIT_/,
    );
  }
});
