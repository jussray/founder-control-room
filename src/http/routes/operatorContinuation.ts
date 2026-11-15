import { Router } from 'express';
import {
  OPERATOR_CONTINUATION_STORAGE_CONTRACT,
  OperatorContinuationStoreError,
  readOperatorExecutionContinuation,
  storeOperatorExecutionContinuation,
} from '../../lib/operatorExecutionContinuationStore.js';
import {
  validateOperatorExecutionContinuation,
  type OperatorExecutionContinuation,
} from '../../lib/operatorContinuity.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const operatorContinuationRouter = Router();

// The continuity store is internal to the founder, not a public user workspace.
// All mutations also inherit server-wide CSRF and rate-limit middleware.
operatorContinuationRouter.use(requireFounder);
operatorContinuationRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});

function requestRecord(value: unknown): OperatorExecutionContinuation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as OperatorExecutionContinuation;
  return validateOperatorExecutionContinuation(candidate).length === 0 ? candidate : null;
}

function failure(error: unknown): { status: number; code: string } {
  if (error instanceof OperatorContinuationStoreError) {
    if (error.code === 'invalid_continuation') return { status: 400, code: error.code };
    if (error.code === 'project_not_found') return { status: 404, code: error.code };
  }
  return { status: 503, code: 'continuation_store_unavailable' };
}

/**
 * POST /operator/continuity
 * Body: { continuation: <reference-only validated non-authorizing packet> }
 */
operatorContinuationRouter.post('/', async (req: FounderRequest, res) => {
  const record = requestRecord((req.body as Record<string, unknown> | null)?.continuation);
  if (!record) return res.status(400).json({ code: 'invalid_continuation' });
  try {
    const result = await storeOperatorExecutionContinuation(record);
    return res.status(result.disposition === 'stored' ? 201 : 200).json({
      contract: OPERATOR_CONTINUATION_STORAGE_CONTRACT,
      disposition: result.disposition,
      continuation: result.stored,
      executionAuthorityFromHandoff: false,
      currentEvidenceVerified: false,
    });
  } catch (error) {
    const mapped = failure(error);
    return res.status(mapped.status).json({ code: mapped.code });
  }
});

/**
 * GET /operator/continuity/:taskId?projectSlug=...&repositoryFullName=...
 * Retrieval restores pointers; it never claims the captured SHA still matches
 * the current repository/provider state. The caller must independently reread.
 */
operatorContinuationRouter.get('/:taskId', async (req: FounderRequest, res) => {
  const projectSlug = typeof req.query.projectSlug === 'string' ? req.query.projectSlug.trim() : '';
  const repository = typeof req.query.repositoryFullName === 'string'
    ? req.query.repositoryFullName.trim() : '';
  if (!projectSlug || !repository || !req.params.taskId) {
    return res.status(400).json({ code: 'missing_continuation_scope' });
  }
  try {
    const continuation = await readOperatorExecutionContinuation(
      projectSlug, repository, req.params.taskId,
    );
    if (!continuation) return res.status(404).json({ code: 'continuation_not_found' });
    return res.json({
      contract: OPERATOR_CONTINUATION_STORAGE_CONTRACT,
      continuation,
      currentEvidenceVerified: false,
      executionAuthorityFromHandoff: false,
      nextGate: 'Resolve source references and independently revalidate repository, provider, runtime and action authority.',
    });
  } catch (error) {
    const mapped = failure(error);
    return res.status(mapped.status).json({ code: mapped.code });
  }
});
