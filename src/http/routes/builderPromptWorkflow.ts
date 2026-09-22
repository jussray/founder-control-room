import { Router } from 'express';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { rateLimitFounderPermissions } from '../middleware/security.js';
import {
  BUILDER_PROMPT_WORKFLOW_STACKS,
  buildBuilderAttackProfile,
  builderAttackAuditInstruction,
  isBuilderPromptIntent,
  parseBuilderAttackScale,
  selectBuilderPromptWorkflow,
  type BuilderAttackScale,
} from '../../lib/builderPromptWorkflowRouter.js';
import {
  ProjectEvidenceAgentError,
  runProjectEvidenceAudit,
} from '../../lib/projectEvidenceAgent.js';

export const builderPromptWorkflowRouter = Router();

const intents = new Set<string>(Object.keys(BUILDER_PROMPT_WORKFLOW_STACKS));

function optionalAttackScale(value: unknown): BuilderAttackScale | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return parseBuilderAttackScale(value);
}

/**
 * POST /prompt-workflows/select
 * Founder-gated, rate-limited, read-only selection. This returns reasoning/evidence modes only;
 * it never executes the workflow and never grants execution authority.
 */
builderPromptWorkflowRouter.post('/select', rateLimitFounderPermissions, requireFounder, (req: FounderRequest, res) => {
  const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim() : '';
  if (!isBuilderPromptIntent(intent)) {
    return res.status(400).json({
      error: 'unsupported builder prompt intent',
      supportedIntents: [...intents],
    });
  }

  try {
    const attackScale = optionalAttackScale(req.body?.attackScale);
    return res.json({ selection: selectBuilderPromptWorkflow(intent, { attackScale }) });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'invalid builder prompt workflow selection',
    });
  }
});

/**
 * POST /prompt-workflows/audit
 * Founder-gated, rate-limited OpenAI Responses audit. The only callable tool is the bounded,
 * read-only get_project_evidence function; no merge/deploy/provider mutation
 * capability is exposed through this route. Optional progressive attack profiles increase
 * adversarial coverage pressure without increasing execution authority.
 */
builderPromptWorkflowRouter.post('/audit', rateLimitFounderPermissions, requireFounder, async (req: FounderRequest, res, next) => {
  const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
  const repository = typeof req.body?.repository === 'string' ? req.body.repository.trim() : '';
  const ref = typeof req.body?.ref === 'string' ? req.body.ref.trim() : '';
  const environment = typeof req.body?.environment === 'string' ? req.body.environment.trim() : '';

  if (!goal || !repository || !ref || !environment) {
    return res.status(400).json({ error: 'goal, repository, ref, and environment are required' });
  }

  let attackProfile;
  let auditGoal = goal;
  try {
    const attackScale = optionalAttackScale(req.body?.attackScale);
    if (attackScale !== undefined) {
      attackProfile = buildBuilderAttackProfile(attackScale);
      const instruction = builderAttackAuditInstruction(attackProfile);
      if (goal.length + instruction.length + 2 > 4_000) {
        return res.status(400).json({ error: 'goal is too long for the selected attack profile' });
      }
      auditGoal = `${goal}\n\n${instruction}`;
    }
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'invalid attack scale',
    });
  }

  try {
    const audit = await runProjectEvidenceAudit({ goal: auditGoal, repository, ref, environment });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      audit,
      ...(attackProfile ? { attackProfile } : {}),
    });
  } catch (error) {
    if (error instanceof ProjectEvidenceAgentError) {
      const status = error.code === 'OPENAI_NOT_CONFIGURED' ? 503 : 502;
      return res.status(status).json({ error: error.message, code: error.code });
    }
    return next(error);
  }
});
