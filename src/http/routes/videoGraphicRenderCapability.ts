import { Router, type Response } from 'express';

import {
  dispatchVideoGraphicRender,
  readVideoGraphicRenderStatus,
  VideoGraphicRenderError,
} from '../../capabilities/videoGraphicRender.js';
import { requirePortfolioSwitchOn } from '../middleware/requirePortfolioSwitchOn.js';
import type { FounderRequest } from '../middleware/requireFounder.js';

export const videoGraphicRenderCapabilityRouter = Router();

videoGraphicRenderCapabilityRouter.use(requirePortfolioSwitchOn('fcr-privileged-execution-master'));

function renderError(res: Response, error: unknown) {
  if (error instanceof VideoGraphicRenderError) {
    return res.status(error.status).set('Cache-Control', 'no-store').json({
      error: error.message,
      code: error.code,
    });
  }
  return res.status(500).set('Cache-Control', 'no-store').json({
    error: 'Remote graphic render failed safely.',
    code: 'remote_render_internal_failure',
  });
}

videoGraphicRenderCapabilityRouter.post('/runs', async (req: FounderRequest, res) => {
  try {
    const run = await dispatchVideoGraphicRender(req.body);
    return res.status(202).set('Cache-Control', 'no-store').json({ run });
  } catch (error) {
    return renderError(res, error);
  }
});

videoGraphicRenderCapabilityRouter.get('/runs/:invocationId', async (req: FounderRequest, res) => {
  try {
    const run = await readVideoGraphicRenderStatus(req.params.invocationId);
    return res.status(200).set('Cache-Control', 'no-store').json({ run });
  } catch (error) {
    return renderError(res, error);
  }
});
