import { Router } from 'express';
import { capabilities } from '../../capabilities/workbenchRegistry.js';
import { requireFounder } from '../middleware/requireFounder.js';

export const capabilitiesRouter = Router();

capabilitiesRouter.use(requireFounder);

capabilitiesRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ capabilities });
});
