import assert from 'node:assert/strict';
import test from 'node:test';
import { LAST_ACCEPTED_AT_KEY, SandboxRequestGate } from '../src/gate.mjs';

class FakeStorage {
  values = new Map();
  alarm = null;

  async get(key) {
    return this.values.get(key);
  }

  async put(entries) {
    for (const [key, value] of Object.entries(entries)) this.values.set(key, value);
  }

  async delete(keys) {
    for (const key of keys) this.values.delete(key);
  }

  async list({ prefix }) {
    return new Map([...this.values].filter(([key]) => key.startsWith(prefix)));
  }

  async setAlarm(timestamp) {
    this.alarm = timestamp;
  }
}

function request(nonce) {
  return new Request('https://sandbox-gate.internal/consume', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nonce, issuedAt: Date.now() }),
  });
}

test('accepts one valid nonce and schedules cleanup', async () => {
  const storage = new FakeStorage();
  const gate = new SandboxRequestGate({ storage });
  const response = await gate.fetch(request('nonce_1234567890'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: 'accepted' });
  assert.equal(typeof storage.alarm, 'number');
});

test('rejects replay of the same signed nonce', async () => {
  const gate = new SandboxRequestGate({ storage: new FakeStorage() });
  await gate.fetch(request('nonce_1234567890'));
  const replay = await gate.fetch(request('nonce_1234567890'));
  assert.equal(replay.status, 409);
  assert.deepEqual(await replay.json(), { code: 'replayed_request' });
});

test('uses a rolling 60-second subject limit across a wall-clock boundary', async () => {
  const originalNow = Date.now;
  const storage = new FakeStorage();
  const gate = new SandboxRequestGate({ storage });

  try {
    Date.now = () => 119_999;
    assert.equal((await gate.fetch(request('nonce_1234567890'))).status, 200);

    Date.now = () => 120_000;
    const limited = await gate.fetch(request('nonce_0987654321'));
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { code: 'rate_limited' });

    Date.now = () => 179_998;
    assert.equal((await gate.fetch(request('nonce_1234567891'))).status, 429);

    Date.now = () => 179_999;
    assert.equal((await gate.fetch(request('nonce_1234567892'))).status, 200);
  } finally {
    Date.now = originalNow;
  }
});

test('removes expired nonce state without accumulating per-minute rate buckets', async () => {
  const storage = new FakeStorage();
  const gate = new SandboxRequestGate({ storage });
  const now = Date.now();
  storage.values.set('nonce:expired_1234567890', now - 1);
  storage.values.set('nonce:live_1234567890', now + 60_000);
  storage.values.set(LAST_ACCEPTED_AT_KEY, now);

  await gate.cleanupExpired(now);

  assert.equal(storage.values.has('nonce:expired_1234567890'), false);
  assert.equal(storage.values.has('nonce:live_1234567890'), true);
  assert.equal(storage.values.get(LAST_ACCEPTED_AT_KEY), now);
});
