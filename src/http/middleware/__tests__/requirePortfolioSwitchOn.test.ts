import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readEffectiveDesiredState } = vi.hoisted(() => ({
  readEffectiveDesiredState: vi.fn(),
}));

vi.mock('../../../switchboard/store.js', () => ({
  readEffectiveDesiredState,
  SwitchboardError: class SwitchboardError extends Error {},
}));

import { requirePortfolioSwitchOn } from '../requirePortfolioSwitchOn.js';

function buildApp() {
  const app = express();
  app.post(
    '/execute',
    requirePortfolioSwitchOn('fcr-privileged-execution-master'),
    (_req, res) => res.status(204).end(),
  );
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('requirePortfolioSwitchOn', () => {
  it('allows the governed action only when desired state is ON', async () => {
    readEffectiveDesiredState.mockResolvedValue('on');
    const response = await request(buildApp()).post('/execute');
    expect(response.status).toBe(204);
  });

  it('blocks the governed action when the founder turned the switch OFF', async () => {
    readEffectiveDesiredState.mockResolvedValue('off');
    const response = await request(buildApp()).post('/execute');
    expect(response.status).toBe(423);
    expect(response.body).toMatchObject({
      error: 'founder_switch_off',
      switchId: 'fcr-privileged-execution-master',
      desiredState: 'off',
    });
  });

  it('fails closed when switch authority cannot be read', async () => {
    readEffectiveDesiredState.mockRejectedValue(new Error('database unavailable'));
    const response = await request(buildApp()).post('/execute');
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('switchboard_state_unavailable');
  });
});
