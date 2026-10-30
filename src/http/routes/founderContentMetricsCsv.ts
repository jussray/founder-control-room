import { Router } from 'express';
import {
  CONTENT_METRICS_CSV_CONTRACT,
  parseContentMetricsCsv,
  type ContentMetricCsvReceipt,
} from '../../lib/contentMetricsCsv.js';
import {
  FOUNDER_CONTENT_METRIC_OBSERVATION_STORE_CONTRACT,
  importFounderContentMetricObservations,
} from '../../lib/contentMetricsStore.js';
import { getStoredFounderContentPost } from '../../lib/founderContentLifecycleStore.js';
import type { FounderRequest } from '../middleware/requireFounder.js';

export const FOUNDER_CONTENT_METRICS_CSV_ROUTE_MAX_BYTES = 96 * 1024;
export const FOUNDER_CONTENT_METRICS_MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

type MetricsCsvRouteDependencies = {
  getPost: typeof getStoredFounderContentPost;
  importMetrics: typeof importFounderContentMetricObservations;
  now: () => Date;
};

const DEFAULT_DEPENDENCIES: MetricsCsvRouteDependencies = {
  getPost: getStoredFounderContentPost,
  importMetrics: importFounderContentMetricObservations,
  now: () => new Date(),
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metricsError(res: Parameters<Parameters<Router['post']>[1]>[1], error: unknown) {
  const message = error instanceof Error ? error.message : 'founder-content metric import failed';
  const unavailable = /does not exist|schema cache|function .* not found|relation .* not found/i.test(message);
  return res.status(unavailable ? 503 : 409).json({
    ok: false,
    code: unavailable
      ? 'FOUNDER_CONTENT_METRIC_OBSERVATION_STORE_NOT_APPLIED'
      : 'FOUNDER_CONTENT_METRIC_IMPORT_REJECTED',
    contract: CONTENT_METRICS_CSV_CONTRACT,
    storeContract: FOUNDER_CONTENT_METRIC_OBSERVATION_STORE_CONTRACT,
    reason: message,
    authority: 'observation_only',
    publicationAuthority: false,
    freshnessAuthority: false,
    strategyMutationAuthority: false,
  });
}

function validatePostIdentity(
  receipt: ContentMetricCsvReceipt,
  post: {
    contentHash: string;
    provider: string;
    accountId: string;
  },
) {
  const pageIds = new Set<string>();
  for (const observation of receipt.observations) {
    if (observation.contentFingerprint !== post.contentHash
        || observation.provider !== post.provider
        || observation.accountId !== post.accountId) {
      throw new Error('CONTENT_METRICS_POST_IDENTITY_MISMATCH');
    }
    pageIds.add(observation.pageId);
  }
  if (pageIds.size !== 1) {
    throw new Error('CONTENT_METRICS_PAGE_IDENTITY_AMBIGUOUS');
  }
}

function validateObservationTime(receipt: ContentMetricCsvReceipt, now: Date) {
  const maxAllowed = now.getTime() + FOUNDER_CONTENT_METRICS_MAX_FUTURE_SKEW_MS;
  for (const observation of receipt.observations) {
    const observedAt = Date.parse(observation.observedAt);
    if (!Number.isFinite(observedAt) || observedAt > maxAllowed) {
      throw new Error('CONTENT_METRICS_FUTURE_OBSERVATION_REJECTED');
    }
  }
}

export function createFounderContentMetricsCsvRouter(
  overrides: Partial<MetricsCsvRouteDependencies> = {},
) {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const router = Router();

  router.post('/posts/:postId/import-metrics-csv', async (req: FounderRequest, res) => {
    const founder = req.founder;
    if (!founder) {
      return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
    }

    const body = record(req.body);
    const csv = typeof body.csv === 'string' ? body.csv : '';
    if (!csv) {
      return res.status(400).json({
        ok: false,
        code: 'CONTENT_METRICS_CSV_REQUIRED',
        contract: CONTENT_METRICS_CSV_CONTRACT,
      });
    }
    if (Buffer.byteLength(csv, 'utf8') > FOUNDER_CONTENT_METRICS_CSV_ROUTE_MAX_BYTES) {
      return res.status(413).json({
        ok: false,
        code: 'CONTENT_METRICS_CSV_ROUTE_LIMIT_EXCEEDED',
        maxCsvBytes: FOUNDER_CONTENT_METRICS_CSV_ROUTE_MAX_BYTES,
        reason: 'The authenticated JSON route is intentionally narrower than the standalone parser so the global request-body ceiling remains fail-closed.',
      });
    }

    try {
      const post = await deps.getPost(founder.userId, text(req.params.postId));
      if (!post) {
        return res.status(404).json({ ok: false, code: 'FOUNDER_CONTENT_POST_NOT_FOUND' });
      }

      let parsed: ContentMetricCsvReceipt;
      try {
        parsed = parseContentMetricsCsv(csv);
      } catch (error) {
        return res.status(400).json({
          ok: false,
          code: 'CONTENT_METRICS_CSV_INVALID',
          contract: CONTENT_METRICS_CSV_CONTRACT,
          reason: error instanceof Error ? error.message : 'CSV parser rejected input',
        });
      }
      if (parsed.observations.length < 1) {
        return res.status(400).json({
          ok: false,
          code: 'CONTENT_METRICS_CSV_EMPTY',
          contract: CONTENT_METRICS_CSV_CONTRACT,
        });
      }

      try {
        validatePostIdentity(parsed, post);
        validateObservationTime(parsed, deps.now());
      } catch (error) {
        return res.status(409).json({
          ok: false,
          code: error instanceof Error ? error.message : 'CONTENT_METRICS_IMPORT_BOUNDARY_REJECTED',
          contract: CONTENT_METRICS_CSV_CONTRACT,
          authority: 'observation_only',
        });
      }

      const importedAt = deps.now().toISOString();
      const stored = await deps.importMetrics({
        founderUserId: founder.userId,
        postId: post.postId,
        receipt: parsed,
        importedAt,
      });

      return res.status(201).json({
        ok: true,
        contract: CONTENT_METRICS_CSV_CONTRACT,
        storeContract: stored.contract,
        postId: post.postId,
        importFingerprint: parsed.importFingerprint,
        inputRowCount: parsed.inputRowCount,
        normalizedRowCount: parsed.normalizedRowCount,
        duplicateRowsCollapsed: parsed.duplicateRowsCollapsed,
        insertedRowCount: stored.insertedRowCount,
        existingRowCount: stored.existingRowCount,
        latestObservedAt: stored.latestObservedAt,
        authority: 'observation_only',
        publicationAuthority: false,
        freshnessAuthority: false,
        strategyMutationAuthority: false,
        providerSyncPerformed: false,
        rawCsvPersisted: false,
      });
    } catch (error) {
      return metricsError(res, error);
    }
  });

  return router;
}

export const founderContentMetricsCsvRouter = createFounderContentMetricsCsvRouter();
