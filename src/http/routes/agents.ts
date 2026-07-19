/**
 * GET /agents — the founder's own multitool operating contract, as data.
 *
 * Read-only. Backs mission agent assignment, Agent Council participant
 * pickers, and cost attribution in the frontend so those forms are always
 * consistent with GLOBAL_AI.md instead of drifting into free-form strings
 * only a human remembers the meaning of.
 */

import { Router } from 'express';
import { requireFounder } from '../middleware/requireFounder.js';
import { AGENT_REGISTRY } from '../../lib/agentRegistry.js';

export const agentsRouter = Router();
agentsRouter.use(requireFounder);

agentsRouter.get('/', (_req, res) => {
  res.json({ agents: AGENT_REGISTRY });
});
