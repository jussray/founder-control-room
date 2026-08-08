import { Router } from 'express';
import {
  FOUNDER_CONVEYOR_STAGES,
  dispatchFounderConveyorAdvance,
  type FounderConveyorAdvanceInput,
  type FounderConveyorStage,
} from '../../lib/n8nConveyor.js';
import { founderConveyorReadiness } from '../../lib/n8nConveyorReadiness.js';
import { FOUNDER_CONVEYOR_CONTRACT } from '../../lib/founderConveyorReceipt.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const n8nConveyorRouter = Router();
n8nConveyorRouter.use(requireFounder);

type JsonRecord = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stage(value: unknown): FounderConveyorStage | null {
  const candidate = text(value) as FounderConveyorStage;
  return FOUNDER_CONVEYOR_STAGES.includes(candidate) ? candidate : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return value.map((item) => item.trim());
}

n8nConveyorRouter.get('/', (_req: FounderRequest, res) => {
  const readiness = founderConveyorReadiness();
  return res.json({
    contract: FOUNDER_CONVEYOR_CONTRACT,
    stages: FOUNDER_CONVEYOR_STAGES,
    readiness,
    authority: {
      advanceStage: true,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    },
  });
});

n8nConveyorRouter.post('/advance', async (req: FounderRequest, res) => {
  const body = (req.body ?? {}) as JsonRecord;
  const fromStage = stage(body.fromStage);
  const toStage = stage(body.toStage);
  const evidenceUrls = stringArray(body.evidenceUrls);

  if (!fromStage || !toStage || evidenceUrls === null) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_PAYLOAD',
      reasons: ['fromStage, toStage, and evidenceUrls must use the conveyor contract'],
      contract: FOUNDER_CONVEYOR_CONTRACT,
    });
  }

  const input: FounderConveyorAdvanceInput = {
    runId: text(body.runId),
    projectSlug: text(body.projectSlug),
    goal: text(body.goal),
    fromStage,
    toStage,
    expectedHeadSha: text(body.expectedHeadSha),
    evidenceUrls,
  };

  const result = await dispatchFounderConveyorAdvance(input);
  return res.status(result.status).json({
    ...result,
    contract: FOUNDER_CONVEYOR_CONTRACT,
  });
});
