import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { FounderRequest } from '../../middleware/requireFounder.js';
import { createFounderContentLifecycleRouter } from '../founderContentLifecycle.js';
import type { importFounderContentMetricsCsv } from '../../../lib/founderContentMetricsStore.js';

const csv = [
  'provider,platform,source,account_id,page_id,metric_name,metric_unit,metric_value,observed_at',
  'linkedin,linkedin,native_platform_export,acct-1,page-1,impressions,count,1,2026-10-24T04:00:00Z',
].join('\n');

function app(importMetricsCsv: typeof importFounderContentMetricsCsv, authenticated = true) {
  const server = express();
  server.use(express.json({ limit: '2mb' }));
  if (authenticated) {
    server.use((req, _res, next) => {
      (req as FounderRequest).founder = {
        userId: 'founder-1',
        email: 'founder@example.test',
      };
      next();
    });
  }
  server.use('/lifecycle', createFounderContentLifecycleRouter({ importMetricsCsv }));
  return server;
}

describe('founder content metrics CSV runtime path', () => {
  it('imports CSV only through the authenticated founder observation path', async () => {
    const importMetricsCsv = vi.fn(async () => ({
      contract: 'fcr/founder-content-metrics-import@v1' as const,
      authority: 'observation_only' as const,
      founderUserId: 'founder-1',
      postId: null,
      normalizedObservations: 1,
      insertedObservations: 1,
      applicationImportFingerprint: 'a'.repeat(64),
      databaseEnvelopeSha256: 'b'.repeat(64),
      receiptId: 'receipt-1',
      observedAt: '2026-10-24T04:05:00.000Z',
    }));

    const response = await request(app(importMetricsCsv as typeof importFounderContentMetricsCsv))
      .post('/lifecycle/metrics/import-csv')
      .send({ csv });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      receipt: {
        authority: 'observation_only',
        insertedObservations: 1,
      },
    });
    expect(importMetricsCsv).toHaveBeenCalledWith(expect.objectContaining({
      founderUserId: 'founder-1',
      csv,
      actor: 'founder@example.test',
      postId: null,
    }));
  });

  it('rejects the import path without founder identity', async () => {
    const importMetricsCsv = vi.fn();
    const response = await request(app(importMetricsCsv as unknown as typeof importFounderContentMetricsCsv, false))
      .post('/lifecycle/metrics/import-csv')
      .send({ csv });
    expect(response.status).toBe(401);
    expect(importMetricsCsv).not.toHaveBeenCalled();
  });

  it('rejects blank CSV before persistence', async () => {
    const importMetricsCsv = vi.fn();
    const response = await request(app(importMetricsCsv as unknown as typeof importFounderContentMetricsCsv))
      .post('/lifecycle/metrics/import-csv')
      .send({ csv: '   ' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('METRICS_CSV_REQUIRED');
    expect(importMetricsCsv).not.toHaveBeenCalled();
  });
});
