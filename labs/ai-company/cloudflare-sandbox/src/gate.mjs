export const NONCE_TTL_MS = 10 * 60 * 1_000;
export const RATE_WINDOW_MS = 60 * 1_000;
export const MAX_REQUESTS_PER_WINDOW = 1;

const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,95}$/;

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function isGateInput(value) {
  return typeof value === 'object'
    && value !== null
    && NONCE_PATTERN.test(value.nonce ?? '')
    && Number.isSafeInteger(value.issuedAt);
}

export class SandboxRequestGate {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);

    const contentLength = request.headers.get('content-length');
    if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > 512)) {
      return json({ code: 'payload_too_large' }, 413);
    }

    const input = await request.json().catch(() => null);
    if (!isGateInput(input)) return json({ code: 'invalid_gate_input' }, 400);

    const now = Date.now();
    await this.cleanupExpired(now);

    const nonceKey = `nonce:${input.nonce}`;
    const nonceExpiresAt = await this.state.storage.get(nonceKey);
    if (typeof nonceExpiresAt === 'number' && nonceExpiresAt > now) {
      return json({ code: 'replayed_request' }, 409);
    }

    const bucket = Math.floor(now / RATE_WINDOW_MS);
    const rateKey = `rate:${bucket}`;
    const requestCount = (await this.state.storage.get(rateKey)) ?? 0;
    if (typeof requestCount !== 'number' || requestCount >= MAX_REQUESTS_PER_WINDOW) {
      return json({ code: 'rate_limited' }, 429);
    }

    await this.state.storage.put({
      [nonceKey]: now + NONCE_TTL_MS,
      [rateKey]: requestCount + 1,
    });
    await this.state.storage.setAlarm(now + NONCE_TTL_MS);
    return json({ code: 'accepted' }, 200);
  }

  async alarm() {
    await this.cleanupExpired(Date.now());
  }

  async cleanupExpired(now) {
    const entries = await this.state.storage.list({ prefix: 'nonce:' });
    const expiredKeys = [];
    for (const [key, expiresAt] of entries) {
      if (typeof expiresAt === 'number' && expiresAt <= now) expiredKeys.push(key);
    }
    if (expiredKeys.length > 0) await this.state.storage.delete(expiredKeys);

    // Rate buckets are intentionally short lived. Retaining every historical
    // minute would turn a long-running subject gate into an unbounded storage
    // sink even though only the current bucket affects admission.
    const currentBucket = Math.floor(now / RATE_WINDOW_MS);
    const rateEntries = await this.state.storage.list({ prefix: 'rate:' });
    const obsoleteRateKeys = [];
    for (const [key] of rateEntries) {
      const bucket = Number(key.slice('rate:'.length));
      if (Number.isSafeInteger(bucket) && bucket < currentBucket) obsoleteRateKeys.push(key);
    }
    if (obsoleteRateKeys.length > 0) await this.state.storage.delete(obsoleteRateKeys);
  }
}
