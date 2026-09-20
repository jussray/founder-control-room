import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { FounderRequest } from '../../middleware/requireFounder.js';
import type { StoredFounderContentPost } from '../../../lib/founderContentLifecycleStore.js';
import {
  FOUNDER_CONTENT_METRICS_CSV_ROUTE_MAX_BYTES,
  createFounderContentMetricsCsvRouter,
} from '../founderContentMetricsCsv.js';

const CONTENT_HASH = 'f'.repeat(64);
const POST_ID = '11111111-1111-4111-8111-111111111111';

const storedPost: StoredFounderContentPost = {
  contract: 'fcr/founder-content-lifecycle-store@v1',
  postId: POST_ID,
  founderUserId: 'founder-1',
  provider: 'linkedin',
  platform: 'linkedin',
  accountId: 'acct-fcr',
  title: 'proof',
  publicPayload: { text: 'proof' },
  contentHash: CONTENT_HASH,
  mediaCount: 0,
  status: 'posted',
  providerWriteState: 'verified_published',
  approvalId: null,
  executionId: null,
  scheduledAt: null,
  postedAt: '2026-09-15T12:00:00.000Z',
  externalPostId: 'post-1',
  permalink: 'https://www.linkedin.com/feed/update/post-1',
  retryCount: 0,
  lastError: null,
  lastMetricsSyncAt: null,
  createdAt: '2026-09-15T12:00:00.000Z',
  updatedAt: '2026-09-15T12:00:00.000Z',
};

const header = [
  'observation_id',
  'content_fingerprint',
  'provider',
  'account_id',
  'page_id',
  'audience_segment',
  'metric_name',
  'metric_value',
  'unit',
  'window_start',
  'window_end',
  'observed_at',
  'source',
  'source_ref',
].join(',');

function validCsv(overrides: { contentHash?: string; provider?: string; accountId?: string; pageId?: string } = {}) {
  return [
    header,
    [
      'obs-1',
      overrides.contentHash ?? CONTENT_HASH,
      overrides.provider ?? 'linkedin',
      overrides.accountId ?? 'acct-fcr',
      overrides.pageId ?? 'page-founder',
      'founders',
      'impressions',
      '542',
      'count',
      '2026-09-10T00:00:00Z',
      '2026-09-16T00:00:00Z',
      '2026-09-16T08:30:00Z',
      'linkedin_native_export',
      'export:20260916',
    ].join(','),
  ].join('\n');
}

function app(overrides: Parameters<typeof createFounderContentMetricsCsvRouter>[0]) {
  const instance = express();
  instance.use(express.json({ limit: '256kb' }));
  instance.use((req, _res, next) => {
    (req as FounderRequest).founder = { email: 'founder@example.com', userId: 'founder-1' };
    next();
  });
  instance.use(createFounderContentMetricsCsvRouter(overrides));
  return instance;
}

describe('founder content metrics CSV import', () => {
  it('imports safe normalized observations without granting freshness or publication authority', async () => {
    const importMetrics = vi.fn(async (input) => ({
      contract: 'fcr/founder-content-metric-observation-store@v1' as const,
      authority: 'observation_only' as const,
      importFingerprint: input.receipt.importFingerprint,
      normalizedRowCount: input.receipt.normalizedRowCount,
      insertedRowCount: 1,
      existingRowCount: 0,
      latestObservedAt: '2026-09-16T08:30:00.000Z',
      publicationAuthority: false as const,
      freshnessAuthority: false as const,
      strategyMutationAuthority: false as const,
    }));
    const response = await request(app({
      getPost: vi.fn(async () => storedPost),
      importMetrics,
      now: () => new Date('2026-09-19T00:00:00.000Z'),
    }))
      .post(`/posts/${POST_ID}/import-metrics-csv`)
      .send({ csv: validCsv() });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ok: true,
      authority: 'observation_only',
      publicationAuthority: false,
      freshnessAuthority: false,
      strategyMutationAuthority: false,
      providerSyncPerformed: false,
      rawCsvPersisted: false,
      insertedRowCount: 1,
      existingRowCount: 0,
    });
    expect(importMetrics).toHaveBeenCalledTimes(1);
    expect(importMetrics.mock.calls[0]?.[0]).toMatchObject({
      founderUserId: 'founder-1',
      postId: POST_ID,
    });
  });

  it('rejects content, provider, or account drift before durable import', async () => {
    const importMetrics = vi.fn();
    for (const csv of [
      validCsv({ contentHash: 'a'.repeat(64) }),
      validCsv({ provider: 'facebook' }),
      validCsv({ accountId: 'other-account' }),
    ]) {
      const response = await request(app({
        getPost: vi.fn(async () => storedPost),
        importMetrics,
        now: () => new Date('2026-09-19T00:00:00.000Z'),
      }))
        .post(`/posts/${POST_ID}/import-metrics-csv`)
        .send({ csv });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('CONTENT_METRICS_POST_IDENTITY_MISMATCH');
    }
    expect(importMetrics).not.toHaveBeenCalled();
  });

  it('rejects ambiguous page identity and future-dated observations before durable import', async () => {
    const importMetrics = vi.fn();
    const secondPage = validCsv({ pageId: 'page-two' }).split('\n')[1];
    const ambiguous = `${validCsv()}\n${secondPage}`;

    const pageResponse = await request(app({
      getPost: vi.fn(async () => storedPost),
      importMetrics,
      now: () => new Date('2026-09-19T00:00:00.000Z'),
    }))
      .post(`/posts/${POST_ID}/import-metrics-csv`)
      .send({ csv: ambiguous });
    expect(pageResponse.status).toBe(409);
    expect(pageResponse.body.code).toBe('CONTENT_METRICS_PAGE_IDENTITY_AMBIGUOUS');

    const futureCsv = validCsv().replace('2026-09-16T08:30:00Z', '2026-09-20T08:30:00Z');
    const futureResponse = await request(app({
      getPost: vi.fn(async () => storedPost),
      importMetrics,
      now: () => new Date('2026-09-19T00:00:00.000Z'),
    }))
      .post(`/posts/${POST_ID}/import-metrics-csv`)
      .send({ csv: futureCsv });
    expect(futureResponse.status).toBe(409);
    expect(futureResponse.body.code).toBe('CONTENT_METRICS_FUTURE_OBSERVATION_REJECTED');
    expect(importMetrics).not.toHaveBeenCalled();
  });

  it('keeps the authenticated JSON route below the global request-body ceiling', async () => {
    const importMetrics = vi.fn();
    const oversized = 'x'.repeat(FOUNDER_CONTENT_METRICS_CSV_ROUTE_MAX_BYTES + 1);
    const response = await request(app({
      getPost: vi.fn(async () => storedPost),
      importMetrics,
    }))
      .post(`/posts/${POST_ID}/import-metrics-csv`)
      .send({ csv: oversized });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe('CONTENT_METRICS_CSV_ROUTE_LIMIT_EXCEEDED');
    expect(importMetrics).not.toHaveBeenCalled();
  });
});
