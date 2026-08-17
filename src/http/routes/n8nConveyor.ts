import { Router } from 'express';
import {
  isV10CapabilityPlan,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  FOUNDER_CONVEYOR_STAGES,
  dispatchFounderConveyorAdvance,
  type FounderConveyorAdvanceInput,
  type FounderConveyorStage,
} from '../../lib/n8nConveyor.js';
import {
  N8N_FOUNDER_CONTENT_CONTRACT,
  dispatchN8nFounderContent,
} from '../../lib/n8nFounderContentOrchestrator.js';
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

function capabilityPlan(value: unknown): V10CapabilityPlan | null {
  return isV10CapabilityPlan(value) ? value : null;
}

n8nConveyorRouter.get('/', (_req: FounderRequest, res) => {
  const readiness = founderConveyorReadiness();
  return res.json({
    contract: FOUNDER_CONVEYOR_CONTRACT,
    capabilityPlanContract: 'juss-v10/capability-plan@v1',
    capabilitySelector: 'chief-ai-machine',
    stages: FOUNDER_CONVEYOR_STAGES,
    readiness,
    authority: {
      advanceStage: true,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    },
    founderContent: {
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      inputAuthority: 'canonical-fcr-proposal-approval-firewall-input',
      authority: {
        orchestrate: true,
        requestProviderWrite: true,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
        readPrivateEvidence: false,
      },
      finalPublishedTruth: 'fcr-provider-readback-only',
    },
  });
});

n8nConveyorRouter.post('/advance', async (req: FounderRequest, res) => {
  const body = (req.body ?? {}) as JsonRecord;
  const fromStage = stage(body.fromStage);
  const toStage = stage(body.toStage);
  const evidenceUrls = stringArray(body.evidenceUrls);
  const selectedCapabilityPlan = capabilityPlan(body.capabilityPlan);

  if (!fromStage || !toStage || evidenceUrls === null || !selectedCapabilityPlan) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_PAYLOAD',
      reasons: ['fromStage, toStage, evidenceUrls, and a Chief AI capabilityPlan must use the V10 conveyor contract'],
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
    capabilityPlan: selectedCapabilityPlan,
    evidenceUrls,
  };

  const result = await dispatchFounderConveyorAdvance(input);
  return res.status(result.status).json({
    ...result,
    contract: FOUNDER_CONVEYOR_CONTRACT,
  });
});

n8nConveyorRouter.post('/founder-content', async (req: FounderRequest, res) => {
  const input = (req.body ?? {}) as JsonRecord;
  const result = await dispatchN8nFounderContent(input, {
    executedBy: req.founder!.email,
  });

  return res.status(result.status).json({
    ...result,
    contract: N8N_FOUNDER_CONTENT_CONTRACT,
    founder: req.founder ? { userId: req.founder.userId } : null,
    finalPublishedTruth: 'fcr-provider-readback-only',
  });
});
