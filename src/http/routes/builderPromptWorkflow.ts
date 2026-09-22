import { Router } from 'express';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import {
  BUILDER_PROMPT_WORKFLOW_STACKS,
  selectBuilderPromptWorkflow,
  type BuilderPromptIntent,
} from '../../lib/builderPromptWorkflowRouter.js';

export const builderPromptWorkflowRouter = Router();
builderPromptWorkflowRouter.use(requireFounder);

const intents = new Set<string>(Object.keys(BUILDER_PROMPT_WORKFLOW_STACKS));

/**
 * POST /prompt-workflows/select
 * Founder-gated, read-only selection. This returns reasoning/evidence modes only;
 * it never executes the workflow and never grants execution authority.
 */
builderPromptWorkflowRouter.post('/select', (req: FounderRequest, res) => {
  const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim() : '';
  if (!intents.has(intent)) {
    return res.status(400).json({
      error: 'unsupported builder prompt intent',
      supportedIntents: [...intents],
    });
  }

  return res.json({ selection: selectBuilderPromptWorkflow(intent as BuilderPromptIntent) });
});
