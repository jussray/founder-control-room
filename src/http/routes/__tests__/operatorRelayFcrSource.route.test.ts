import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createOperatorRelayRouter } from '../operatorRelay.js';

describe('operator relay reserved FCR source', () => {
  it('rejects external requests that claim to originate from FCR', async () => {
    const app = express();
    app.use(express.json());
    app.use(createOperatorRelayRouter({}));

    const response = await request(app).post('/api/operator-relay').send({ fromOperator: 'fcr' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('relay_source_reserved');
  });
});
