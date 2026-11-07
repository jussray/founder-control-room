import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  EXECUTION_PATH,
  authenticateInvocation,
  deriveSandboxSessionId,
  signInvocation,
} from '../src/auth-core.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const secret = 'sandbox-shared-secret-at-least-thirty-two-characters';
const now = 1_787_048_000_000;
const validInvocation = {
  method: 'POST',
  pathname: EXECUTION_PATH,
  subject: 'founder-session_12345',
  nonce: 'nonce_1234567890',
  issuedAt: now,
};

async function signedRequest(invocation = validInvocation, overrides = {}) {
  const signature = await signInvocation(secret, invocation);
  return new Request(`https://sandbox.example${invocation.pathname}`, {
    method: invocation.method,
    headers: {
      'x-sandbox-subject': invocation.subject,
      'x-sandbox-nonce': invocation.nonce,
      'x-sandbox-issued-at': String(invocation.issuedAt),
      'x-sandbox-signature': signature,
      ...overrides,
    },
  });
}

test('accepts an exact signed, bodyless POST', async () => {
  const result = await authenticateInvocation(await signedRequest(), secret, now);
  assert.equal(result.ok, true);
});

test('rejects a signature made with another secret', async () => {
  const request = await signedRequest();
  const result = await authenticateInvocation(request, `${secret}-wrong`, now);
  assert.deepEqual(result, { ok: false, code: 'invalid_signature' });
});

test('rejects a signature after the subject is tampered', async () => {
  const request = await signedRequest(validInvocation, { 'x-sandbox-subject': 'attacker-session_12345' });
  const result = await authenticateInvocation(request, secret, now);
  assert.deepEqual(result, { ok: false, code: 'invalid_signature' });
});

test('rejects a signature after the nonce is tampered', async () => {
  const request = await signedRequest(validInvocation, { 'x-sandbox-nonce': 'other_nonce_123456' });
  const result = await authenticateInvocation(request, secret, now);
  assert.deepEqual(result, { ok: false, code: 'invalid_signature' });
});

test('rejects a malformed subject before sandbox selection', async () => {
  const request = await signedRequest(validInvocation, { 'x-sandbox-subject': '../cross-tenant' });
  const result = await authenticateInvocation(request, secret, now);
  assert.deepEqual(result, { ok: false, code: 'invalid_subject' });
});

test('rejects a malformed nonce before sandbox selection', async () => {
  const request = await signedRequest(validInvocation, { 'x-sandbox-nonce': 'short' });
  const result = await authenticateInvocation(request, secret, now);
  assert.deepEqual(result, { ok: false, code: 'invalid_nonce' });
});

test('rejects stale signed requests', async () => {
  const stale = { ...validInvocation, issuedAt: now - 300_001 };
  const result = await authenticateInvocation(await signedRequest(stale), secret, now);
  assert.deepEqual(result, { ok: false, code: 'stale_request' });
});

test('rejects future signed requests', async () => {
  const future = { ...validInvocation, issuedAt: now + 300_001 };
  const result = await authenticateInvocation(await signedRequest(future), secret, now);
  assert.deepEqual(result, { ok: false, code: 'future_request' });
});

test('rejects query-bearing requests even when their path is signed', async () => {
  const request = await signedRequest();
  const queried = new Request(`${request.url}?run=anything`, request);
  const result = await authenticateInvocation(queried, secret, now);
  assert.deepEqual(result, { ok: false, code: 'route_not_found' });
});

test('rejects an undeclared request body before any sandbox work', async () => {
  const signature = await signInvocation(secret, validInvocation);
  const request = new Request(`https://sandbox.example${EXECUTION_PATH}`, {
    method: 'POST',
    headers: {
      'x-sandbox-subject': validInvocation.subject,
      'x-sandbox-nonce': validInvocation.nonce,
      'x-sandbox-issued-at': String(validInvocation.issuedAt),
      'x-sandbox-signature': signature,
    },
    body: 'untrusted input',
  });
  const result = await authenticateInvocation(request, secret, now);
  assert.deepEqual(result, { ok: false, code: 'body_not_allowed' });
});

test('derives opaque, distinct disposable sandbox IDs', async () => {
  const first = await deriveSandboxSessionId(validInvocation);
  const second = await deriveSandboxSessionId({ ...validInvocation, nonce: 'nonce_0987654321' });
  assert.match(first, /^session-[a-f0-9]{48}$/);
  assert.notEqual(first, second);
  assert.equal(first.includes(validInvocation.subject), false);
});
