import { Router } from 'express';
import type { ChiefAiEvidenceServiceBinding } from '../../worker/handler.js';
import { requestPromptOSCommandIntakeFromChief } from '../../lib/promptOsCommandHandoff.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { rateLimitFounderPermissions } from '../middleware/security.js';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createPromptOSCommandIntakeRouter(
  binding?: ChiefAiEvidenceServiceBinding,
): Router {
  const router = Router();

  router.post(
    '/command-intake',
    rateLimitFounderPermissions,
    requireFounder,
    async (req: FounderRequest, res) => {
      res.setHeader('Cache-Control', 'private, no-store');

      if (!binding?.acceptPromptOSCommandIntent) {
        return res.status(503).json({
          error: 'Chief AI PromptOS command intake is unavailable on this runtime.',
          code: 'PROMPTOS_CHIEF_COMMAND_RPC_UNAVAILABLE',
        });
      }

      const body = isRecord(req.body) ? req.body : null;
      if (!body || !isRecord(body.intent)) {
        return res.status(400).json({
          error: 'Request body must contain a PromptOS public command intent object.',
          code: 'PROMPTOS_COMMAND_INTENT_REQUIRED',
        });
      }

      const allowed = new Set(['intent', 'resolvedProject']);
      const unexpected = Object.keys(body).filter((key) => !allowed.has(key)).sort();
      if (unexpected.length > 0) {
        return res.status(400).json({
          error: `Unsupported request fields: ${unexpected.join(', ')}`,
          code: 'PROMPTOS_COMMAND_REQUEST_SHAPE_INVALID',
        });
      }

      const resolvedProject = typeof body.resolvedProject === 'string'
        ? body.resolvedProject.trim().slice(0, 240)
        : undefined;

      try {
        const intake = await requestPromptOSCommandIntakeFromChief(
          binding,
          body.intent,
          resolvedProject || undefined,
        );

        return res.status(200).json({
          intake,
          proposalOnly: true,
          acceptedForAuthorityResolution: false,
          executionAuthorized: false,
          nextRequiredContract: intake.nextRequiredContract,
        });
      } catch (error) {
        return res.status(422).json({
          error: error instanceof Error ? error.message : 'PromptOS command handoff was rejected.',
          code: 'PROMPTOS_COMMAND_HANDOFF_REJECTED',
          executionAuthorized: false,
        });
      }
    },
  );

  return router;
}
