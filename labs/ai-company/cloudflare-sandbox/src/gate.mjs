export const NONCE_TTL_MS = 10 * 60 * 1_000;
export const RATE_WINDOW_MS = 60 * 1_000;
export const LAST_ACCEPTED_AT_KEY = 'rate:last-accepted-at';

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

    // This is a rolling limit, not a minute-aligned bucket: two envelopes on
    // opposite sides of a wall-clock boundary must not execute back to back.
    const lastAcceptedAt = await this.state.storage.get(LAST_ACCEPTED_AT_KEY);
    if (typeof lastAcceptedAt === 'number' && now - lastAcceptedAt < RATE_WINDOW_MS) {
      return json({ code: 'rate_limited' }, 429);
    }

    await this.state.storage.put({
      [nonceKey]: now + NONCE_TTL_MS,
      [LAST_ACCEPTED_AT_KEY]: now,
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

  }
}
