import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createProtectSecurityEventIngestHandler,
  signProtectEvent,
  type ProtectSecurityEventStore,
} from '../protectSecurityEvents.js';

const KEY = 'protect-ingest-only-secret-with-at-least-32-bytes';
const NOW = Date.parse('2026-11-15T20:00:00.000Z');
const TIMESTAMP = String(Math.floor(NOW / 1000));
const EVENT_ID = '9d2c5df0-81a7-4d92-bb10-2a2fd4b8f321';

function payload() {
  return {
    event: {
      schema: 'protect-me/shield-event@v1',
      service: 'juss-protect-me-2',
      method: 'GET',
      pathname: '[redacted]',
      verdict: 'PROBE',
      identity: {
        actor: null, asn: null, country: null, userAgent: null,
        claimedCrawler: null, verifiedBot: false, botScore: null,
      },
    },
    receipt: 'a'.repeat(64),
    receiptKind: 'hmac-sha256',
    transportAuthority: { level: 'evidence_only', canAuthorize: false },
  };
}

function appFor(store: ProtectSecurityEventStore, secret: string | undefined = KEY) {
  const app = express();
  app.post('/ingest/protect-security-events',
    express.raw({ type: 'application/json', limit: '16kb' }),
    createProtectSecurityEventIngestHandler({
      env: secret === undefined ? {} : { FCR_PROTECT_EVENT_INGEST_SECRET: secret },
      now: () => NOW,
      store,
    }));
  return app;
}

function signed(raw: string, secret = KEY, timestamp = TIMESTAMP, eventId = EVENT_ID) {
  return {
    'x-protect-event-timestamp': timestamp,
    'x-protect-event-id': eventId,
    'x-protect-event-signature': signProtectEvent(secret, timestamp, eventId, Buffer.from(raw)),
  };
}

describe('authenticated Protect Me evidence-only ingestion', () => {
  it('fails closed with no separately configured credential', async () => {
    const store = vi.fn<ProtectSecurityEventStore>();
    const result = await request(appFor(store, undefined))
      .post('/ingest/protect-security-events')
      .set(signed(JSON.stringify(payload())))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload()));
    expect(result.status).toBe(503);
    expect(store).not.toHaveBeenCalled();
  });

  it('accepts only a signed redacted observation and strips any actor identity', async () => {
    const store = vi.fn<ProtectSecurityEventStore>().mockResolvedValue('stored');
    const candidate = payload();
    candidate.event.identity.actor = 'opaque-actor-fingerprint';
    const raw = JSON.stringify(candidate);
    const result = await request(appFor(store))
      .post('/ingest/protect-security-events')
      .set(signed(raw))
      .set('Content-Type', 'application/json')
      .send(raw);
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ accepted: true, eventId: EVENT_ID, authority: 'evidence_only' });
    expect(store).toHaveBeenCalledOnce();
    const observed = vi.mocked(store).mock.calls[0][0];
    expect(observed.verdict).toBe('PROBE');
    expect(observed.service).toBe('juss-protect-me-2');
    expect(observed.shieldReceiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(observed)).not.toContain('opaque-actor-fingerprint');
    expect(JSON.stringify(observed)).not.toContain('secret');
  });

  it('rejects unsigned, tampered, and expired observations before storage', async () => {
    const store = vi.fn<ProtectSecurityEventStore>();
    const raw = JSON.stringify(payload());
    const endpoint = '/ingest/protect-security-events';
    const app = appFor(store);
    const unsigned = await request(app).post(endpoint)
      .set('Content-Type', 'application/json').send(raw);
    expect(unsigned.status).toBe(401);

    const modified = JSON.stringify({ ...payload(), event: { ...payload().event, verdict: 'AUTOMATION' } });
    const tampered = await request(app).post(endpoint)
      .set(signed(raw)).set('Content-Type', 'application/json').send(modified);
    expect(tampered.status).toBe(401);

    const oldTimestamp = String(Math.floor(NOW / 1000) - 600);
    const expired = await request(app).post(endpoint)
      .set(signed(raw, KEY, oldTimestamp))
      .set('Content-Type', 'application/json').send(raw);
    expect(expired.status).toBe(401);
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects raw paths, raw UAs, fake response authority and extra payload fields', async () => {
    const store = vi.fn<ProtectSecurityEventStore>();
    const cases: unknown[] = [
      { ...payload(), event: { ...payload().event, pathname: '/secret' } },
      { ...payload(), event: { ...payload().event, identity: { ...payload().event.identity, userAgent: 'curl/8' } } },
      { ...payload(), transportAuthority: { level: 'mutation', canAuthorize: true } },
      { ...payload(), rawIp: '198.51.100.2' },
      { ...payload(), event: { ...payload().event, identity: { ...payload().event.identity, verifiedBot: true } } },
      { ...payload(), checks: [{ path: '/private' }] },
    ];
    for (const candidate of cases) {
      const raw = JSON.stringify(candidate);
      const result = await request(appFor(store)).post('/ingest/protect-security-events')
        .set(signed(raw)).set('Content-Type', 'application/json').send(raw);
      expect(result.status).toBe(400);
    }
    expect(store).not.toHaveBeenCalled();
  });

  it('rejects validly signed replays and store conflicts without creating another action', async () => {
    const store = vi.fn<ProtectSecurityEventStore>()
      .mockResolvedValueOnce('stored')
      .mockResolvedValueOnce('duplicate')
      .mockResolvedValueOnce('conflict');
    const raw = JSON.stringify(payload());
    const app = appFor(store);
    const send = () => request(app).post('/ingest/protect-security-events')
      .set(signed(raw)).set('Content-Type', 'application/json').send(raw);
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(409);
    expect((await send()).status).toBe(409);
  });

  it('fails closed when persistence is unavailable', async () => {
    const store = vi.fn<ProtectSecurityEventStore>().mockRejectedValue(new Error('db unavailable'));
    const raw = JSON.stringify(payload());
    const res = await request(appFor(store)).post('/ingest/protect-security-events')
      .set(signed(raw)).set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Protect security event store unavailable' });
  });
});
