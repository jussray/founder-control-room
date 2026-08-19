import { Router, type Response } from 'express';
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
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
} from '../../lib/n8nProviderNeutralFounderContentOrchestrator.js';
import { FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT } from '../../lib/firstPartyFounderContentExecutor.js';
import {
  founderContentOrchestrationReadiness,
  founderConveyorReadiness,
} from '../../lib/n8nConveyorReadiness.js';
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

function authorityStoreRequired(
  req: FounderRequest,
  res: Response,
  contract: string,
  operation: 'orchestrate' | 'publish',
) {
  return res.status(409).json({
    ok: false,
    code: 'L99_AUTHORITY_REQUIRED',
    contract,
    published: false,
    authorityRequired: 'L99_AUTHORITATIVE_APPROVAL_STORE',
    operation,
    reasons: [
      'External founder-content mutation is disabled until execution rereads an exact founder ApprovalReceipt from authoritative storage.',
      'A structurally valid approval object supplied by the browser, model, queue, or n8n workflow is evidence about authority, not authority itself.',
    ],
    founder: req.founder ? { userId: req.founder.userId } : null,
    finalPublishedTruth: 'fcr-provider-readback-only',
  });
}

n8nConveyorRouter.get('/', (_req: FounderRequest, res) => {
  const readiness = founderConveyorReadiness();
  const founderContentReadiness = founderContentOrchestrationReadiness();
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
      enabled: false,
      blockedBy: 'L99_AUTHORITATIVE_APPROVAL_STORE_REQUIRED',
      inputAuthority: 'canonical-fcr-proposal-approval-firewall-input',
      providerSelection: 'founder-authenticated-bounded-platform-compatible',
      providerContractRoutes: N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
      providerRuntimeConfiguration: {
        env: 'N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS',
        defaultEnabled: ['buffer'],
        rule: 'contract-capable-does-not-imply-runtime-enabled',
      },
      readiness: founderContentReadiness,
      authority: {
        orchestrate: false,
        requestProviderWrite: false,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
        readPrivateEvidence: false,
      },
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      finalPublishedTruth: 'fcr-provider-readback-only',
      directPublish: {
        contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
        route: '/founder-content/publish-now',
        provider: 'linkedin',
        enabled: false,
        blockedBy: 'L99_AUTHORITATIVE_APPROVAL_STORE_REQUIRED',
        exactCurrentYouApprovalRequired: true,
        authoritativeApprovalStoreReadbackRequired: true,
        callerSuppliedApprovalIsAuthority: false,
        temporalClaimTruthRequired: true,
        historicalTruthPreserved: true,
        currentRepoStateRevalidatedAtExecution: true,
        runtimeAndMetricClaimsRequireDedicatedLiveVerifier: true,
        durableOneShotReservationRequired: true,
        providerReadbackRequired: true,
        copyMutationAllowed: false,
        blindRetryAllowed: false,
        productTruthDisplay: {
          current: 'Current · verified as of execution',
          historical: 'Historical · verified at exact version',
          superseded: 'Superseded · no longer current',
          blocked: 'Fresh live evidence required',
        },
      },
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

n8nConveyorRouter.post('/founder-content/publish-now', async (req: FounderRequest, res) => {
  return authorityStoreRequired(req, res, FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT, 'publish');
});

n8nConveyorRouter.post('/founder-content', async (req: FounderRequest, res) => {
  return authorityStoreRequired(req, res, N8N_FOUNDER_CONTENT_CONTRACT, 'orchestrate');
});
