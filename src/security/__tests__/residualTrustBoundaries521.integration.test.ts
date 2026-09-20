import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { debugRouter } from '../../http/routes/debug.js';
import { portableConsoleRouter } from '../../http/routes/portableConsole.js';

describe('residual trust boundaries from #521', () => {
  it('keeps provider debug metadata founder-gated when the router is mounted by itself', async () => {
    const app = express();
    app.use('/_debug', debugRouter);

    const response = await request(app).get('/_debug/provider');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Founder session required' });
    expect(response.body).not.toHaveProperty('provider');
    expect(response.body).not.toHaveProperty('openaiKeyPresent');
    expect(response.body).not.toHaveProperty('nodeEnv');
  });

  it('keeps Portable Console founder-gated even when mounted by itself', async () => {
    const app = express();
    app.use(express.json());
    app.use('/v1', portableConsoleRouter);

    const response = await request(app).get('/v1/repo/status');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Founder session required' });
  });
});
