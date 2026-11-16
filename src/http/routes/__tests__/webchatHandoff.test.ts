import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { WebchatHumanHandoff } from '../../../growth/webchatHumanHandoff.js';
import type { WebchatHandoffRow, WebchatHandoffStore } from '../../../growth/webchatHandoffStore.js';
import { createWebchatHandoffRouter, createWebchatMessageHandler } from '../webchatHandoff.js';

vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.founder = { email: 'founder@example.com', userId: 'founder-user-1' };
    next();
  },
}));

const ENV = { FCR_WEBCHAT_HUMAN_HANDOFF_PROJECTS: 'founder-control-room' } as NodeJS.ProcessEnv;
const NOW = new Date('2026-11-16T01:00:00.000Z');

function memoryStore(): WebchatHandoffStore & { rows: Map<string, WebchatHandoffRow> } {
  const rows = new Map<string, WebchatHandoffRow>();
  return {
    rows,
    async record(h: WebchatHumanHandoff) {
      if (rows.has(h.idempotencyKey)) return 'duplicate';
      rows.set(h.idempotencyKey, {
        idempotencyKey: h.idempotencyKey,
        projectId: h.projectId,
        brandId: h.brandId,
        conversationId: h.providerConversationId,
        visitorHash: h.providerUserId,
        reason: h.reason,
        state: 'pending_human',
        requestedAt: h.requestedAt,
        releasedAt: null,
      });
      return 'stored';
    },
    async hasOpenHandoff(projectId, conversationId) {
      return [...rows.values()].some((r) => r.projectId === projectId && r.conversationId === conversationId && r.state === 'pending_human');
    },
    async listPending() {
      return [...rows.values()].filter((r) => r.state === 'pending_human');
    },
    async release(key) {
      const row = rows.get(key);
      if (!row || row.state !== 'pending_human') return false;
      row.state = 'released';
      row.releasedAt = NOW.toISOString();
      return true;
    },
  };
}

function app(store: WebchatHandoffStore, env: NodeJS.ProcessEnv = ENV) {
  const a = express();
  a.post('/webchat/messages', express.json({ limit: '4kb' }), createWebchatMessageHandler(store, { env, now: () => NOW }));
  a.use(express.json());
  a.use('/webchat', createWebchatHandoffRouter(store));
  return a;
}

const message = (text?: string) => ({
  projectId: 'founder-control-room',
  entryFlowFingerprintId: 'entry:fcr:61f9e074',
  conversationId: 'conversation:abc12345',
  anonymousVisitorId: 'visitor:xyz12345',
  text,
});

describe('POST /webchat/messages', () => {
  it('is disabled (404) unless the project is allowlisted', async () => {
    const store = memoryStore();
    const res = await request(app(store, {} as NodeJS.ProcessEnv)).post('/webchat/messages').send(message('/human'));
    expect(res.status).toBe(404);
    expect(store.rows.size).toBe(0);
  });

  it('queues /human, pauses the bot, and returns the honest acknowledgement', async () => {
    const store = memoryStore();
    const res = await request(app(store)).post('/webchat/messages').send(message('/human refund help'));
    expect(res.status).toBe(202);
    expect(res.body.botMayReply).toBe(false);
    expect(res.body.handoff).toMatchObject({ state: 'pending_human', disposition: 'stored', reason: 'refund help' });
    expect(res.body.visitorMessage).toMatch(/human queue/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toContain('visitor:xyz12345');
    const [row] = [...store.rows.values()];
    expect(row.visitorHash).toMatch(/^anon:[a-f0-9]{64}$/);
  });

  it('keeps the bot paused for later messages until a founder releases it', async () => {
    const store = memoryStore();
    const a = app(store);
    await request(a).post('/webchat/messages').send(message('/human'));
    const paused = await request(a).post('/webchat/messages').send(message('still there?'));
    expect(paused.status).toBe(200);
    expect(paused.body.botMayReply).toBe(false);

    const list = await request(a).get('/webchat/handoffs');
    expect(list.body.handoffs).toHaveLength(1);
    const key = list.body.handoffs[0].idempotencyKey;

    const released = await request(a).post(`/webchat/handoffs/${encodeURIComponent(key)}/release`);
    expect(released.status).toBe(200);

    const resumed = await request(a).post('/webchat/messages').send(message('hello again'));
    expect(resumed.body.botMayReply).toBe(true);
    expect((await request(a).post(`/webchat/handoffs/${encodeURIComponent(key)}/release`)).status).toBe(404);
  });

  it('lets the bot reply in conversations without a handoff', async () => {
    const res = await request(app(memoryStore())).post('/webchat/messages').send(message('hello'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, handoff: null, botMayReply: true });
  });

  it('rejects malformed input with 400 and writes nothing', async () => {
    const store = memoryStore();
    const res = await request(app(store)).post('/webchat/messages').send({ ...message('/human'), conversationId: 'x' });
    expect(res.status).toBe(400);
    expect(store.rows.size).toBe(0);
  });

  it('never reports success when the queue write fails', async () => {
    const store = memoryStore();
    store.record = async () => { throw new Error('db down'); };
    const res = await request(app(store)).post('/webchat/messages').send(message('/human'));
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('db down');
  });
});

describe('founder handoff routes', () => {
  it('rejects malformed release keys', async () => {
    const res = await request(app(memoryStore())).post('/webchat/handoffs/not-a-key/release');
    expect(res.status).toBe(400);
  });
});
