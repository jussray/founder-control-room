import { Router } from 'express';
import { parseContentMetricsCsv } from '../../lib/contentMetricsCsv.js';
import {
  listStoredFounderContentMetricObservations,
  persistFounderContentMetricReceipt,
  type FounderContentMetricRepository,
} from '../../lib/contentMetricsStore.js';
import type { FounderRequest } from '../middleware/requireFounder.js';

type Dependencies = {
  persist: typeof persistFounderContentMetricReceipt;
  list: typeof listStoredFounderContentMetricObservations;
  repository?: FounderContentMetricRepository;
};

const DEFAULT_DEPENDENCIES: Dependencies = {
  persist: persistFounderContentMetricReceipt,
  list: listStoredFounderContentMetricObservations,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function storeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /does not exist|schema cache|function .* not found|relation .* not found/i.test(message);
}

export function createFounderContentMetricsRouter(
  overrides: Partial<Dependencies> = {},
) {
  const deps: Dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const router = Router();

  router.get('/', async (req: FounderRequest, res) => {
    const founder = req.founder;
    if (!founder) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });

    const limit = Math.max(1, Math.min(integer(req.query.limit, 100), 500));
    try {
      const observations = await deps.list(
        { founderUserId: founder.userId, limit },
        deps.repository,
      );
      return res.json({
        ok: true,
        contract: 'fcr/founder-content-metric-store@v1',
        authority: 'observation_only',
        observations,
      });
    } catch (error) {
      return res.status(storeUnavailable(error) ? 503 : 409).json({
        ok: false,
        code: storeUnavailable(error)
          ? 'FOUNDER_CONTENT_METRIC_STORE_NOT_APPLIED'
          : 'FOUNDER_CONTENT_METRIC_READBACK_REJECTED',
        authority: 'observation_only',
      });
    }
  });

  router.post('/import', async (req: FounderRequest, res) => {
    const founder = req.founder;
    if (!founder) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });

    const body = record(req.body);
    if (typeof body.csv !== 'string') {
      return res.status(400).json({
        ok: false,
        code: 'CONTENT_METRICS_CSV_REQUIRED',
        authority: 'observation_only',
      });
    }

    let receipt;
    try {
      receipt = parseContentMetricsCsv(body.csv);
    } catch {
      return res.status(400).json({
        ok: false,
        code: 'CONTENT_METRICS_CSV_REJECTED',
        contract: 'content-metrics-csv@v1',
        authority: 'observation_only',
        stored: false,
      });
    }

    try {
      const stored = await deps.persist(
        { founderUserId: founder.userId, receipt },
        deps.repository,
      );
      return res.status(stored.insertedCount > 0 ? 201 : 200).json({
        ok: true,
        stored: true,
        receipt: {
          contract: stored.contract,
          importFingerprint: stored.importFingerprint,
          insertedCount: stored.insertedCount,
          idempotentCount: stored.idempotentCount,
          authority: stored.authority,
          freshnessAuthority: stored.freshnessAuthority,
          publicationAuthority: stored.publicationAuthority,
          strategyMutationAuthority: stored.strategyMutationAuthority,
        },
        input: {
          contract: receipt.contract,
          inputRowCount: receipt.inputRowCount,
          normalizedRowCount: receipt.normalizedRowCount,
          duplicateRowsCollapsed: receipt.duplicateRowsCollapsed,
        },
      });
    } catch (error) {
      return res.status(storeUnavailable(error) ? 503 : 409).json({
        ok: false,
        code: storeUnavailable(error)
          ? 'FOUNDER_CONTENT_METRIC_STORE_NOT_APPLIED'
          : 'FOUNDER_CONTENT_METRIC_IMPORT_REJECTED',
        contract: 'fcr/founder-content-metric-import@v1',
        authority: 'observation_only',
        stored: false,
      });
    }
  });

  return router;
}

export const founderContentMetricsRouter = createFounderContentMetricsRouter();
