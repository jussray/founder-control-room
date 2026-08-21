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
import { N8N_FOUNDER_CONTENT_CONTRACT } from '../../lib/n8nProviderNeutralFounderContentOrchestrator.js';
import {
  AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT,
  dispatchAuthoritativeBufferFounderContentSchedule,
} from '../../lib/authoritativeBufferFounderContentScheduler.js';
import {
  FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
  issueFounderContentApproval,
} from '../../lib/founderContentApprovalStore.js';
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

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function scheduleConfirmation(value: unknown) {
  const candidate = record(value);
  return {
    confirm_schedule: candidate.confirm_schedule === true,
    authorization_hash: text(candidate.authorization_hash),
    public_payload_hash: text(candidate.public_payload_hash),
  };
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

function directLinkedInInactive(req: FounderRequest, res: Response) {
  return res.status(409).json({
    ok: false,
    code: 'DIRECT_LINKEDIN_TRANSPORT_INACTIVE',
    published: false,
    activeTransport: 'buffer',
    reasons: [
      'Direct LinkedIn execution is not an active founder-content transport in the current product contract.',
      'Use the FCR-owned /founder-content schedule route; Buffer is the only active downstream transport for this phase.',
    ],
    founder: req.founder ? { userId: req.founder.userId } : null,
    finalPublishedTruth: 'buffer-provider-readback-only',
  });
}

n8nConveyorRouter.get('/', (_req: FounderRequest, res) => {
  const readiness = founderConveyorReadiness();
  const founderContentReadiness = founderContentOrchestrationReadiness();
  const bufferOnlyPolicySatisfied =
    founderContentReadiness.invalidProviders.length === 0 &&
    founderContentReadiness.enabledProviders.length === 1 &&
    founderContentReadiness.enabledProviders[0] === 'buffer';

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
      contract: AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT,
      underlyingScheduleContract: N8N_FOUNDER_CONTENT_CONTRACT,
      route: '/founder-content',
      approvalRoute: '/founder-content/approvals',
      routeImplemented: true,
      canonicalAuthority: 'founder-control-room',
      storyBrain: 'chief-ai-machine',
      activeTransport: 'buffer',
      transportPolicy: 'buffer-only',
      bufferOnlyPolicySatisfied,
      inputAuthority: 'canonical-fcr-proposal-plus-stored-one-shot-approval',
      providerRuntimeConfiguration: {
        env: 'N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS',
        defaultEnabled: ['buffer'],
        permitted: ['buffer'],
        rejected: ['cambiante', 'linkedin-direct', 'meta', 'tiktok', 'x', 'youtube', 'pinterest', 'bluesky', 'mastodon', 'google_business'],
        rule: 'Buffer must be the only runtime-enabled founder-content transport before FCR consumes approval',
      },
      readiness: founderContentReadiness,
      authority: {
        orchestrate: true,
        requestProviderWrite: true,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
        readPrivateEvidence: false,
      },
      approvalStoreContract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      exactCopyConfirmationRequired: true,
      oneShotApprovalClaimRequired: true,
      blindRetryAllowed: false,
      providerReadbackRequired: true,
      finalPublishedTruth: 'buffer-provider-readback-only',
      directLinkedIn: {
        route: '/founder-content/publish-now',
        active: false,
        code: 'DIRECT_LINKEDIN_TRANSPORT_INACTIVE',
        activationRequiresSeparateFounderDecisionAndProviderProof: true,
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

n8nConveyorRouter.post('/founder-content/approvals', async (req: FounderRequest, res) => {
  const body = (req.body ?? {}) as JsonRecord;
  const founder = req.founder;
  if (!founder) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
  if (body.confirm_exact_copy !== true) {
    return res.status(400).json({
      ok: false,
      code: 'EXACT_COPY_CONFIRMATION_REQUIRED',
      contract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
      reasons: ['confirm_exact_copy must be true before FCR issues publication authority'],
    });
  }
  if (Object.hasOwn(body, 'approval')) {
    return res.status(400).json({
      ok: false,
      code: 'CALLER_APPROVAL_OBJECT_FORBIDDEN',
      contract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
      reasons: ['FCR issues the approval object; callers may not submit or override it'],
    });
  }

  try {
    const issued = await issueFounderContentApproval({
      proposal: record(body.proposal),
      founderUserId: founder.userId,
    });
    return res.status(201).json({
      ok: true,
      contract: issued.contract,
      approval_id: issued.approvalId,
      proposal_hash: issued.proposalHash,
      public_payload_hash: issued.publicPayloadHash,
      authorization_hash: issued.authorizationHash,
      platform: issued.platform,
      source: { repo: issued.sourceRepo, commit_sha: issued.sourceCommitSha },
      approved_at: issued.approvedAt,
      expires_at: issued.expiresAt,
      one_shot: true,
      caller_supplied_approval_is_authority: false,
      active_transport: 'buffer',
      next_gate: 'Confirm scheduling of this exact public payload before expiry; FCR will preflight Buffer before consuming the approval.',
    });
  } catch (error) {
    return res.status(409).json({
      ok: false,
      code: 'APPROVAL_NOT_ISSUED',
      contract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
      reasons: [error instanceof Error ? error.message : 'authoritative approval issuance failed'],
    });
  }
});

n8nConveyorRouter.post('/founder-content', async (req: FounderRequest, res) => {
  const body = (req.body ?? {}) as JsonRecord;
  const founder = req.founder;
  if (!founder) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
  if (Object.hasOwn(body, 'approval')) {
    return res.status(400).json({
      ok: false,
      code: 'CALLER_APPROVAL_OBJECT_FORBIDDEN',
      contract: AUTHORITATIVE_BUFFER_FOUNDER_CONTENT_CONTRACT,
      published: false,
      reasons: ['Buffer scheduling accepts only an FCR-issued approval_id, never caller-supplied approval authority'],
    });
  }

  const result = await dispatchAuthoritativeBufferFounderContentSchedule({
    proposal: record(body.proposal),
    approval_id: text(body.approval_id),
    confirmation: scheduleConfirmation(body.confirmation),
  }, {
    founderUserId: founder.userId,
    founderIdentity: founder.email,
  });
  return res.status(result.status).json(result);
});

n8nConveyorRouter.post('/founder-content/publish-now', async (req: FounderRequest, res) => {
  return directLinkedInInactive(req, res);
});
