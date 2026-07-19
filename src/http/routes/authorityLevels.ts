/**
 * GET /authority-levels — the L0-L6 connector authority model as data.
 *
 * Backs the MCP/Connector Hub's authority-level picker so it can't drift
 * from src/lib/authorityLevels.ts, the same reasoning as GET /agents for
 * the multitool registry.
 */

import { Router } from 'express';
import { requireFounder } from '../middleware/requireFounder.js';
import { AUTHORITY_LEVELS } from '../../lib/authorityLevels.js';

export const authorityLevelsRouter = Router();
authorityLevelsRouter.use(requireFounder);

authorityLevelsRouter.get('/', (_req, res) => {
  res.json({ levels: AUTHORITY_LEVELS });
});
