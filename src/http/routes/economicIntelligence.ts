import { Router } from 'express';
import {
  buildDemo,
  ECONOMIC_INTELLIGENCE_CONTRACT,
  listJurisdictionSlugs,
} from '../../economic-intelligence/contract.js';
import { scoreOpportunity } from '../../economic-intelligence/score.js';
import type { OpportunityInput } from '../../economic-intelligence/types.js';

export const economicIntelligenceRouter = Router();

economicIntelligenceRouter.get('/contract', (_req, res) => {
  res.json(ECONOMIC_INTELLIGENCE_CONTRACT);
});

economicIntelligenceRouter.get('/demo/:jurisdictionSlug', (req, res) => {
  const demo = buildDemo(req.params.jurisdictionSlug);
  if (!demo) {
    return res.status(404).json({
      error: 'Unknown jurisdiction fixture',
      availableJurisdictions: listJurisdictionSlugs(),
    });
  }

  return res.json(demo);
});

economicIntelligenceRouter.post('/score', (req, res) => {
  const candidate = req.body as Partial<OpportunityInput> | undefined;
  const signals = candidate?.signals;

  if (
    !candidate
    || typeof candidate.id !== 'string'
    || typeof candidate.jurisdictionId !== 'string'
    || typeof candidate.title !== 'string'
    || typeof candidate.category !== 'string'
    || !Array.isArray(candidate.sourceIds)
    || !signals
    || ['impact', 'feasibility', 'evidence', 'urgency', 'equity']
      .some((key) => typeof signals[key as keyof typeof signals] !== 'number')
  ) {
    return res.status(400).json({ error: 'Invalid opportunity scoring payload' });
  }

  return res.json(scoreOpportunity(candidate as OpportunityInput));
});
