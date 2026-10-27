import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createFounderContentMetricsRouter,
} from '../founderContentMetrics.js';
import type {
  FounderContentMetricRepository,
} from '../../../lib/contentMetricsStore.js';
import type { FounderRequest } from '../../middleware/requireFounder.js';

const CSV = [
  'observation_id,content_fingerprint,provider,account_id,page_id,audience_segment,metric_name,metric_value,unit,window_start,window_end,observed_at,source,source_ref',
  'obs-1,content-1,linkedin,account-1,page-1,Founder,impressions,10,count,2026-10-01T00:00:00Z,2026-10-07T00:00:00Z,2026-10-08T00:00:00Z,manual_export,export-1',
].join('\n');

function repository(): FounderContentMetricRepository {
  return {
    ingest: vi.fn(async (_founderUserId, receipt) => ({
      contract: 'fcr/founder-content-metric-import@v1',
      importFingerprint: receipt.importFingerprint,
      insertedCount: 1,
      idempotentCount: 0,
      authority: 'observation_only',
      freshnessAuthority: false,
      publicationAuthority: false,
      strategyMutationAuthority: false,
    })),
    list: vi.fn(async () => []),
  };
}

function app(repo: FounderContentMetricRepository, authenticated = true) {
  const instance = express();
  instance.use(express.json({ limit: '2mb' }));
  if (authenticated) {
    instance.use((req, _res, next) => {
      (req as FounderRequest).founder = {
        userId: 'founder-user-1',
        email: 'founder@example.test',
      };
      next();
    });
  }
  instance.use('/metrics', createFounderContentMetricsRouter({ repository: repo }));
  return instance;
}

describe('founder-content metric import route', () => {
  it('parses canonical CSV and persists observation-only evidence', async () => {
    const repo = repository();
    const response = await request(app(repo))
      .post('/metrics/import')
      .send({ csv: CSV })
      .expect(201);

    expect(response.body).toMatchObject({
      ok: true,
      stored: true,
      receipt: {
        contract: 'fcr/founder-content-metric-import@v1',
        insertedCount: 1,
        idempotentCount: 0,
        authority: 'observation_only',
        freshnessAuthority: false,
        publicationAuthority: false,
        strategyMutationAuthority: false,
      },
      input: {
        contract: 'content-metrics-csv@v1',
        inputRowCount: 1,
        normalizedRowCount: 1,
        duplicateRowsCollapsed: 0,
      },
    });

    expect(repo.ingest).toHaveBeenCalledTimes(1);
    const [founderUserId, receipt] = vi.mocked(repo.ingest).mock.calls[0];
    expect(founderUserId).toBe('founder-user-1');
    expect(receipt.observations[0]).toMatchObject({
      observationId: 'obs-1',
      accountId: 'account-1',
      pageId: 'page-1',
      audienceSegment: 'Founder',
      metricName: 'impressions',
      metricValue: 10,
      evidenceState: 'OBSERVED',
    });
  });

  it('rejects malformed CSV before persistence without echoing source data', async () => {
    const repo = repository();
    const response = await request(app(repo))
      .post('/metrics/import')
      .send({ csv: 'secret-account,not,the,right,shape' })
      .expect(400);

    expect(response.body).toEqual({
      ok: false,
      code: 'CONTENT_METRICS_CSV_REJECTED',
      contract: 'content-metrics-csv@v1',
      authority: 'observation_only',
      stored: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-account');
    expect(repo.ingest).not.toHaveBeenCalled();
  });

  it('requires authenticated founder identity even when the router is mounted directly', async () => {
    const repo = repository();
    await request(app(repo, false))
      .post('/metrics/import')
      .send({ csv: CSV })
      .expect(401);
    expect(repo.ingest).not.toHaveBeenCalled();
  });

  it('reads only the authenticated founder metric ledger', async () => {
    const repo = repository();
    const response = await request(app(repo))
      .get('/metrics?limit=25')
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      contract: 'fcr/founder-content-metric-store@v1',
      authority: 'observation_only',
      observations: [],
    });
    expect(repo.list).toHaveBeenCalledWith('founder-user-1', 25);
  });
});
