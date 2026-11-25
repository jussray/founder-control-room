import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), config: vi.fn(), send: vi.fn() }));
vi.mock('../../middleware/requireFounder.js', () => ({
  requireFounder: mocks.auth,
  requireInteractiveFounder: mocks.auth,
}));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { from: mocks.from } }));
vi.mock('../../../services/founderNotificationDelivery.js', () => ({
  founderPushConfig: mocks.config, notificationOwnerId: vi.fn(),
}));
vi.mock('../../../services/webPushTransport.js', () => ({
  normalizePushSubscription: vi.fn(), sealSubscription: vi.fn(), subscriptionFingerprint: vi.fn(),
  unsealSubscription: vi.fn(), sendWebPush: mocks.send,
}));
import { founderNotificationsRouter } from '../founderNotifications.js';

it('shares a pre-authentication request budget across all five notification routes', async () => {
  mocks.auth.mockImplementation((_req, res) => res.status(401).json({ error: 'authentication_required' }));
  const app = express();
  app.use(express.json());
  app.use('/founder-notifications', founderNotificationsRouter);
  const paths = ['/config', '/feed', '/subscribe', '/unsubscribe', '/test'];
  const call = (path: string) => ['/config', '/feed'].includes(path)
    ? request(app).get('/founder-notifications' + path)
    : request(app).post('/founder-notifications' + path).send({});
  for (let i = 0; i < 60; i++) {
    const result = await call(paths[i % paths.length]);
    expect(result.status).toBe(401);
  }
  for (const path of paths) {
    const result = await call(path);
    expect(result.status).toBe(429);
    expect(result.headers['cache-control']).toBe('no-store');
  }
  expect(mocks.auth).toHaveBeenCalledTimes(60);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.config).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
