import { Router } from 'express';
import { buildSecurityPostureSnapshot } from '../../security/securityPosture.js';
import { requireFounder } from '../middleware/requireFounder.js';

export const securityPostureRouter = Router();

securityPostureRouter.use(requireFounder);

/**
 * GET /security-posture
 *
 * Founder-only, read-only strategic security posture. Targets describe the
 * required security maturity for each registered project; they are never
 * promoted to current/proven maturity without separate project/provider proof.
 */
securityPostureRouter.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    generatedAt: new Date().toISOString(),
    ...buildSecurityPostureSnapshot(),
  });
});
