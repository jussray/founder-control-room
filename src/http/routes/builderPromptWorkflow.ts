import { Router } from 'express';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { rateLimitFounderPermissions } from '../middleware/security.js';
import {
  BUILDER_PROMPT_WORKFLOW_STACKS,
  selectBuilderPromptWorkflow,
  type BuilderPromptIntent,
  type BuilderPromptIntensity,
} from '../../lib/builderPromptWorkflowRouter.js';
import {
  ProjectEvidenceAgentError,
  runProjectEvidenceAudit,
} from '../../lib/projectEvidenceAgent.js';
import { readN8nInstanceMcpPolicy } from '../../lib/n8nInstanceMcp.js';

export const builderPromptWorkflowRouter = Router();

const intents = new Set<string>(Object.keys(BUILDER_PROMPT_WORKFLOW_STACKS));

/**
 * GET /prompt-workflows/execution-spine
 * Founder-gated declaration of the governed n8n instance-level MCP boundary.
 * This reports FCR policy intent only and never claims the remote n8n provider
 * has been enabled or verified without provider-native readback.
 */
builderPromptWorkflowRouter.get('/execution-spine', requireFounder, (_req: FounderRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    controlPlane: 'founder-control-room',
    reasoningRouter: 'promptos-chief-ai-machine',
    executionSpine: 'n8n-instance-mcp',
    policy: readN8nInstanceMcpPolicy(),
    proof: {
      providerStateVerified: false,
      providerNativeReadbackRequired: true,
      exactRuntimeProofRequired: true,
      playwrightRequiredForUiOrBrowserClaims: true,
    },
  });
});

/**
 * POST /prompt-workflows/select
 * Founder-gated, rate-limited workflow selection. Selection is still non-executing.
 * It may request a separately founder-approved authority escalation, but cannot
 * widen authority by itself.
 */
builderPromptWorkflowRouter.post('/select', rateLimitFounderPermissions, requireFounder, (req: FounderRequest, res) => {
  const intent = typeof req.body?.intent === 'string' ? req.body.intent.trim() : '';
  if (!intents.has(intent)) {
    return res.status(400).json({
      error: 'unsupported builder prompt intent',
      supportedIntents: [...intents],
    });
  }

  try {
    const rawIntensity = req.body?.intensity;
    const intensity = rawIntensity === undefined
      ? undefined
      : Number(rawIntensity) as BuilderPromptIntensity;
    return res.json({
      selection: selectBuilderPromptWorkflow(intent as BuilderPromptIntent, intensity),
    });
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
 * capability is exposed through this route.
 */
builderPromptWorkflowRouter.post('/audit', rateLimitFounderPermissions, requireFounder, async (req: FounderRequest, res, next) => {
  const goal = typeof req.body?.goal === 'string' ? req.body.goal.trim() : '';
  const repository = typeof req.body?.repository === 'string' ? req.body.repository.trim() : '';
  const ref = typeof req.body?.ref === 'string' ? req.body.ref.trim() : '';
  const environment = typeof req.body?.environment === 'string' ? req.body.environment.trim() : '';

  if (!goal || !repository || !ref || !environment) {
    return res.status(400).json({ error: 'goal, repository, ref, and environment are required' });
  }

  try {
    const audit = await runProjectEvidenceAudit({ goal, repository, ref, environment });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ audit });
  } catch (error) {
    if (error instanceof ProjectEvidenceAgentError) {
      const status = error.code === 'OPENAI_NOT_CONFIGURED' ? 503 : 502;
      return res.status(status).json({ error: error.message, code: error.code });
    }
    return next(error);
  }
});
