import { Router } from 'express';
import { FCR_BROWSER_PREVIEW_CONTRACT, previewFounderBrowserIntent } from '../../lib/browserOperatorPlan.js';
import { requireFounder } from '../middleware/requireFounder.js';

export const browserOperatorRouter = Router();
browserOperatorRouter.use(requireFounder);

browserOperatorRouter.post('/preview', (req, res) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
  });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || typeof req.body.request !== 'string') {
    return res.status(400).json({
      contract: FCR_BROWSER_PREVIEW_CONTRACT,
      status: 'REJECTED',
      reason: 'INVALID_REQUEST',
      browserExecuted: false,
    });
  }
  const preview = previewFounderBrowserIntent(req.body.request);
  return res.status(preview.status === 'REJECTED' ? 422 : 200).json(preview);
});
