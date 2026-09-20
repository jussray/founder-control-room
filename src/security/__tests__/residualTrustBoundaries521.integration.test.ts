import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createServer } from '../../http/server.js';
import { portableConsoleRouter } from '../../http/routes/portableConsole.js';

describe('residual trust boundaries from #521', () => {
  it('does not expose provider debug metadata without founder authentication', async () => {
    const response = await request(createServer()).get('/_debug/provider');

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
