import { timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import {
  FounderSignalReviewExecutionError,
  founderSignalReviewContextRepository,
  type FounderSignalReviewContextRepository,
  validateFounderSignalReviewContextRegistration,
} from '../../founderSignalEmailIngress/reviewExecution.js';
import { deriveProofOfShipReceiptToken } from './proofOfShipReceipts.js';

function tokenMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const left = Buffer.from(provided, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function headers(res: Response) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

function authorize(req: Request, res: Response): boolean {
  const mcpToken = process.env.FOUNDER_SIGNAL_ENGINE_MCP_TOKEN?.trim();
  if (!mcpToken) {
    res.status(503).json({ error: 'Founder review context ingest is not configured' });
    return false;
  }
  const expected = deriveProofOfShipReceiptToken(mcpToken);
  if (!tokenMatches(req.get('x-proof-of-ship-receipt-token'), expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function createFounderSignalReviewContextIngestHandler(
  repository: FounderSignalReviewContextRepository = founderSignalReviewContextRepository,
): RequestHandler {
  return async function handleFounderSignalReviewContextIngest(req: Request, res: Response) {
    headers(res);
    if (!authorize(req, res)) return;

    let context;
    try {
      context = validateFounderSignalReviewContextRegistration(req.body);
    } catch (error) {
      const code = error instanceof FounderSignalReviewExecutionError
        ? error.code
        : 'invalid_review_context';
      return res.status(400).json({ error: code });
    }

    try {
      const disposition = await repository.store(context);
      if (disposition === 'conflict') {
        return res.status(409).json({
          accepted: false,
          error: 'review_context_conflict',
          replyContextId: context.replyContextId,
        });
      }
      return res.status(disposition === 'stored' ? 201 : 200).json({
        accepted: true,
        duplicate: disposition === 'duplicate',
        replyContextId: context.replyContextId,
        batchId: context.batchId,
        sourceRepo: context.sourceRepo,
        sourceCommitSha: context.sourceCommitSha,
        reviewDeadline: context.reviewDeadline,
        scheduledPostCount: context.scheduledPosts.length,
      });
    } catch {
      return res.status(503).json({ error: 'Founder review context store unavailable' });
    }
  };
}

export const handleFounderSignalReviewContextIngest =
  createFounderSignalReviewContextIngestHandler();
