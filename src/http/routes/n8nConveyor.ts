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
  N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
} from '../../lib/n8nProviderNeutralFounderContentOrchestrator.js';
import { dispatchAuthoritativeN8nFounderContent } from '../../lib/authoritativeN8nFounderContentPublisher.js';
import { FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT } from '../../lib/firstPartyFounderContentExecutor.js';
import { dispatchAuthoritativeFounderContentPublishNow } from '../../lib/authoritativeFounderContentPublisher.js';
import {
  FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
  issueFounderContentApproval,
} from '../../lib/founderContentApprovalStore.js';
import {
  founderContentOrchestrationReadiness,
  resolveFounderConveyorReadiness,
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

function publicationConfirmation(value: unknown) {
  const candidate = record(value);
  const truthContextHash = text(candidate.truth_context_hash);
  return {
    confirm_publication: candidate.confirm_publication === true,
    authorization_hash: text(candidate.authorization_hash),
    public_payload_hash: text(candidate.public_payload_hash),
    ...(truthContextHash ? { truth_context_hash: truthContextHash } : {}),
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

n8nConveyorRouter.get('/', async (_req: FounderRequest, res) => {
  const readiness = await resolveFounderConveyorReadiness();
  const founderContentReadiness = founderContentOrchestrationReadiness();
  const providerRuntimeConfigured =
    founderContentReadiness.enabled
    && founderContentReadiness.configured
    && founderContentReadiness.enabledProviders.length > 0
    && founderContentReadiness.invalidProviders.length === 0;

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
      routeImplemented: true,
      enabled: providerRuntimeConfigured,
      blockedBy: providerRuntimeConfigured ? null : 'N8N_FOUNDER_CONTENT_RUNTIME_CONFIGURATION_REQUIRED',
      inputAuthority: 'fcr-issued-one-shot-approval-id-plus-exact-copy-confirmation',
      providerSelection: 'founder-authenticated-bounded-platform-compatible',
      providerContractRoutes: N8N_FOUNDER_CONTENT_PROVIDER_ROUTES,
      providerRuntimeConfiguration: {
        env: 'N8N_FOUNDER_CONTENT_ENABLED_PROVIDERS',
        defaultEnabled: ['buffer'],
        rule: 'contract-capable-does-not-imply-runtime-enabled',
      },
      readiness: founderContentReadiness,
      controlledProbeAllowed: founderContentReadiness.bufferReadyForProbe,
      authority: {
        orchestrate: true,
        requestProviderWrite: true,
        authorizePublication: false,
        changeCopy: false,
        markPublished: false,
        readPrivateEvidence: false,
      },
      authoritativeApprovalStoreReadbackRequired: true,
      callerSuppliedApprovalIsAuthority: false,
      oneShotApprovalClaimRequired: true,
      providerReadbackRequired: true,
      blindRetryAllowed: false,
      finalPublishedTruth: 'fcr-provider-readback-only',
      nextRuntimeGate: founderContentReadiness.bufferReadyForProbe
        ? 'Run one controlled FCR-authorized Buffer probe and persist provider-native readback bound to the exact runtime SHA.'
        : 'Configure the n8n founder-content transport/provider allowlist before consuming any one-shot approval.',
      directPublish: {
        contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
        route: '/founder-content/publish-now',
        approvalRoute: '/founder-content/approvals',
        approvalStoreContract: FOUNDER_CONTENT_APPROVAL_STORE_CONTRACT,
        provider: 'linkedin',
        routeImplemented: true,
        executionReadiness: 'unknown-until-live-preflight',
        runtimeReadyClaimAllowed: false,
        nextRuntimeGate: 'Verify approval-store migration state, live provider configuration, temporal preflight, and provider readback at the exact use boundary.',
        exactCurrentYouApprovalRequired: true,
        authoritativeApprovalStoreReadbackRequired: true,
        approvalObjectAcceptedFromCaller: false,
        callerSuppliedApprovalIsAuthority: false,
        oneShotApprovalClaimRequired: true,
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
      next_gate: 'Confirm publication of this exact public payload before expiry.',
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

n8nConveyorRouter.post('/founder-content/publish-now', async (req: FounderRequest, res) => {
  const body = (req.body ?? {}) as JsonRecord;
  const founder = req.founder;
  if (!founder) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
  if (Object.hasOwn(body, 'approval')) {
    return res.status(400).json({
      ok: false,
      code: 'CALLER_APPROVAL_OBJECT_FORBIDDEN',
      contract: FIRST_PARTY_FOUNDER_PUBLISH_CONTRACT,
      published: false,
      reasons: ['publish-now accepts only an FCR-issued approval_id, never caller-supplied approval authority'],
    });
  }

  const result = await dispatchAuthoritativeFounderContentPublishNow({
    proposal: record(body.proposal),
    approval_id: text(body.approval_id),
    confirmation: publicationConfirmation(body.confirmation),
  }, {
    founderUserId: founder.userId,
    founderIdentity: founder.email,
  });
  return res.status(result.status).json(result);
});

n8nConveyorRouter.post('/founder-content', async (req: FounderRequest, res) => {
  const body = (req.body ?? {}) as JsonRecord;
  const founder = req.founder;
  if (!founder) return res.status(401).json({ ok: false, code: 'FOUNDER_SESSION_REQUIRED' });
  if (Object.hasOwn(body, 'approval')) {
    return res.status(400).json({
      ok: false,
      code: 'CALLER_APPROVAL_OBJECT_FORBIDDEN',
      contract: N8N_FOUNDER_CONTENT_CONTRACT,
      published: false,
      reasons: ['provider orchestration accepts only an FCR-issued approval_id, never caller-supplied approval authority'],
    });
  }

  const result = await dispatchAuthoritativeN8nFounderContent({
    proposal: record(body.proposal),
    approval_id: text(body.approval_id),
    n8n_provider: text(body.n8n_provider),
    confirmation: publicationConfirmation(body.confirmation),
  }, {
    founderUserId: founder.userId,
    founderIdentity: founder.email,
  });

  return res.status(result.status).json({
    ...result,
    published: false,
    finalPublishedTruth: 'fcr-provider-readback-only',
  });
});
