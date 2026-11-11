import assert from 'node:assert/strict';
import {
  fetchWithSafeRateLimitRetry,
  parseBoundedRetryAfter,
} from '../public/control-room/safe-rate-limit-fetch.js';

const ORIGIN = 'https://fcr.test';
const rateLimitHeaders = {
  'content-type': 'application/json',
  'ratelimit-limit': '60',
  'ratelimit-reset': '1770000000',
  'retry-after': '2',
};

assert.equal(parseBoundedRetryAfter('1'), 1);
assert.equal(parseBoundedRetryAfter('61'), 61);
assert.equal(parseBoundedRetryAfter('0'), null);
assert.equal(parseBoundedRetryAfter('62'), null);
assert.equal(parseBoundedRetryAfter('1.5'), null);
assert.equal(parseBoundedRetryAfter('not-a-number'), null);

{
  let calls = 0;
  const sleeps = [];
  const fakeFetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
        status: 429,
        headers: rateLimitHeaders,
      });
    }
    return new Response(JSON.stringify({ connections: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const response = await fetchWithSafeRateLimitRetry(
    fakeFetch,
    `${ORIGIN}/projects/demo-project/connections`,
    { method: 'GET' },
    { origin: ORIGIN, sleepFn: async (ms) => sleeps.push(ms) },
  );

  assert.equal(response.status, 200);
  assert.equal(calls, 2, 'safe same-origin GET retries exactly once');
  assert.deepEqual(sleeps, [2250], 'retry waits for the server Retry-After plus a small boundary cushion');
}

{
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
      status: 429,
      headers: rateLimitHeaders,
    });
  };

  const response = await fetchWithSafeRateLimitRetry(
    fakeFetch,
    `${ORIGIN}/projects/demo-project/connections`,
    { method: 'POST', body: '{}' },
    { origin: ORIGIN, sleepFn: async () => { throw new Error('mutation retry must not sleep'); } },
  );

  assert.equal(response.status, 429);
  assert.equal(calls, 1, 'consequential POST is never retried automatically');
}

{
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response('', { status: 429, headers: rateLimitHeaders });
  };

  const response = await fetchWithSafeRateLimitRetry(
    fakeFetch,
    'https://provider.example/data',
    { method: 'GET' },
    { origin: ORIGIN, sleepFn: async () => { throw new Error('cross-origin retry must not sleep'); } },
  );

  assert.equal(response.status, 429);
  assert.equal(calls, 1, 'cross-origin response is never retried by FCR browser policy');
}

{
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return new Response('', {
      status: 429,
      headers: {
        'ratelimit-limit': '60',
        'ratelimit-reset': '1770000000',
        'retry-after': '900',
      },
    });
  };

  const response = await fetchWithSafeRateLimitRetry(
    fakeFetch,
    `${ORIGIN}/projects/demo-project/connections`,
    { method: 'GET' },
    { origin: ORIGIN, sleepFn: async () => { throw new Error('unbounded retry must not sleep'); } },
  );

  assert.equal(response.status, 429);
  assert.equal(calls, 1, 'unbounded Retry-After remains a visible 429');
}

console.log('Safe rate-limit fetch proof passed: one bounded same-origin safe-read retry; mutations, cross-origin requests, and malformed/unbounded retry evidence remain fail-closed.');
