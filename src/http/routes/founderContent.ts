import { Router, type Response } from 'express';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import {
  FounderContentDispatchError,
  reserveAndDispatchFounderContent,
} from '../../founderContent/dispatch.js';

export const founderContentRouter = Router();
founderContentRouter.use(requireFounder);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

founderContentRouter.post('/schedule', async (req: FounderRequest, res: Response) => {
  const body = asRecord(req.body);
  const proposal = body.proposal;
  const rawApproval = asRecord(body.approval);
  const rawCurrentYou = asRecord(rawApproval.current_you);
  const linkedinStrategyRaw = asRecord(body.linkedinStrategy);

  const proofUrl = typeof body.proofUrl === 'string' ? body.proofUrl.trim() : '';
  const channel = typeof body.channel === 'string' ? body.channel.trim().toLowerCase() : '';
  const contentField = typeof body.contentField === 'string'
    ? body.contentField.trim().toLowerCase()
    : '';

  const approval = {
    ...rawApproval,
    current_you: {
      ...rawCurrentYou,
      authenticated: true,
      source: 'current_authenticated_founder',
    },
  };

  const linkedinStrategy = Object.keys(linkedinStrategyRaw).length > 0
    ? {
        baselineRef: typeof linkedinStrategyRaw.baselineRef === 'string' ? linkedinStrategyRaw.baselineRef : '',
        growthHypothesis: typeof linkedinStrategyRaw.growthHypothesis === 'string' ? linkedinStrategyRaw.growthHypothesis : '',
        gate24h: typeof linkedinStrategyRaw.gate24h === 'string' ? linkedinStrategyRaw.gate24h : '',
        gate48h: typeof linkedinStrategyRaw.gate48h === 'string' ? linkedinStrategyRaw.gate48h : '',
        nextMutation: typeof linkedinStrategyRaw.nextMutation === 'string' ? linkedinStrategyRaw.nextMutation : '',
      }
    : undefined;

  try {
    const result = await reserveAndDispatchFounderContent(
      {
        proposal,
        approval,
        proofUrl,
        channel,
        contentField,
        linkedinStrategy,
      },
      {
        executedBy: req.founder!.email,
      },
    );

    return res.status(202).json({
      ...result,
      state: 'scheduled-review-dispatch-accepted',
      providerExecutionProven: false,
      completionClaimAuthorized: false,
    });
  } catch (error) {
    if (error instanceof FounderContentDispatchError) {
      return res.status(error.httpStatus).json({
        ok: false,
        code: error.code,
        error: error.message,
        providerExecutionProven: false,
        completionClaimAuthorized: false,
      });
    }
    return res.status(500).json({
      ok: false,
      code: 'FOUNDER_CONTENT_INTERNAL_ERROR',
      error: 'Founder-content scheduling failed closed.',
      providerExecutionProven: false,
      completionClaimAuthorized: false,
    });
  }
});
