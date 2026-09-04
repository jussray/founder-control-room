import { Router } from 'express';
import {
  isV10CapabilityPlan,
  validateV10CapabilityPlan,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  createProductBuildDirective,
  PRODUCT_BUILD_DIRECTIVE_CONTRACT,
} from '../../lib/productBuildDirective.js';
import {
  validateFounderControlDecision,
  type FounderControlDecision,
  type FounderControlProposalBinding,
} from '../../lib/founderControlDecision.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';
import { requirePortfolioSwitchOn } from '../middleware/requirePortfolioSwitchOn.js';

export const productBuildRouter = Router();

const STORYENGINE_PROJECT = 'l99';
const STORYENGINE_REPOSITORY = 'jussray/StoryEngine';
const STORYENGINE_CONTROL_ROOM = 'storyengine-control-room';
const FEDERATION_CAPABILITY = 'founder-control-room-federation';
const FIRST_ACTUATOR_SCOPE = 'control-room:event-log';
const BUILD_ACTION = 'build-product-control-room-loop';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function proposal(value: unknown): FounderControlProposalBinding | null {
  const candidate = record(value);
  const expectedHeadSha = text(candidate.expectedHeadSha);
  const capabilityPlanHash = text(candidate.capabilityPlanHash);
  const result: FounderControlProposalBinding = {
    proposalId: text(candidate.proposalId),
    proposalHash: text(candidate.proposalHash),
    projectSlug: text(candidate.projectSlug),
    actionType: text(candidate.actionType),
    expectedHeadSha: expectedHeadSha || null,
    capabilityPlanHash: capabilityPlanHash || null,
  };
  return result.proposalId && result.proposalHash && result.projectSlug && result.actionType ? result : null;
}

function founderDecision(value: unknown): FounderControlDecision | null {
  const candidate = record(value);
  const boundProposal = proposal(candidate.proposal);
  if (!boundProposal) return null;
  return {
    contract: candidate.contract as FounderControlDecision['contract'],
    proposal: boundProposal,
    surface: candidate.surface as FounderControlDecision['surface'],
    decision: candidate.decision as FounderControlDecision['decision'],
    founderExplicit: candidate.founderExplicit as true,
    scopeLocked: candidate.scopeLocked as true,
    changesAllowed: candidate.changesAllowed as false,
    executionAuthorized: candidate.executionAuthorized === true,
    decisionHash: text(candidate.decisionHash),
  };
}

function capabilityIds(plan: V10CapabilityPlan): string[] {
  return [...new Set(plan.capabilities.map((capability) => capability.id.trim()).filter(Boolean))].sort();
}

productBuildRouter.use(requireFounder);

productBuildRouter.post(
  '/storyengine/directive',
  requirePortfolioSwitchOn('fcr-privileged-execution-master'),
  (req: FounderRequest, res) => {
    const body = record(req.body);
    const selectedPlan = isV10CapabilityPlan(body.capabilityPlan)
      ? body.capabilityPlan
      : null;
    const boundProposal = proposal(body.proposal);
    const decision = founderDecision(body.founderDecision);
    const directiveId = text(body.directiveId);

    if (!selectedPlan || !boundProposal || !decision || !directiveId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_PRODUCT_BUILD_INPUT',
        reasons: ['directiveId, Chief capabilityPlan, exact proposal, and founderDecision are required'],
      });
    }

    const planErrors = validateV10CapabilityPlan(selectedPlan);
    if (planErrors.length > 0) {
      return res.status(400).json({ ok: false, code: 'INVALID_CHIEF_CAPABILITY_PLAN', reasons: planErrors });
    }

    const ids = capabilityIds(selectedPlan);
    const bindingErrors: string[] = [];
    if (selectedPlan.projectSlug !== STORYENGINE_PROJECT) bindingErrors.push('Chief capability plan must target StoryEngine project l99');
    if (!ids.includes(FEDERATION_CAPABILITY)) bindingErrors.push('Chief capability plan must select founder-control-room-federation');
    if (boundProposal.projectSlug !== selectedPlan.projectSlug) bindingErrors.push('proposal project must match Chief capability plan project');
    if (boundProposal.actionType !== BUILD_ACTION) bindingErrors.push('proposal actionType is not the bounded product-build action');
    if (boundProposal.expectedHeadSha !== selectedPlan.expectedHeadSha) bindingErrors.push('proposal head must match Chief capability plan head');
    if (boundProposal.capabilityPlanHash !== selectedPlan.planHash) bindingErrors.push('proposal capabilityPlanHash must match the exact Chief plan hash');
    bindingErrors.push(...validateFounderControlDecision(decision, boundProposal));

    if (bindingErrors.length > 0) {
      return res.status(409).json({
        ok: false,
        code: 'PRODUCT_BUILD_BINDING_MISMATCH',
        reasons: [...new Set(bindingErrors)],
      });
    }

    try {
      const directive = createProductBuildDirective({
        directiveId,
        founderDecision: decision,
        proposal: boundProposal,
        productControlRoomId: STORYENGINE_CONTROL_ROOM,
        repository: STORYENGINE_REPOSITORY,
        objective: 'Prove one bounded FCR to StoryEngine Control Room execution and receipt loop.',
        allowedCapabilities: [FEDERATION_CAPABILITY],
        allowedMutationScope: [FIRST_ACTUATOR_SCOPE],
        requiredProof: ['node-test', 'playwright'],
        stopConditions: ['one-successful-receipt', 'any-authority-drift'],
        rollback: 'Delete the single product-build audit event and revert the focused product-control-room adapter commit.',
      });

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        contract: PRODUCT_BUILD_DIRECTIVE_CONTRACT,
        directive,
        founder: req.founder ? { userId: req.founder.userId } : null,
        authority: {
          issuedBy: 'founder-control-room',
          chiefPlanValidated: true,
          founderDecisionValidated: true,
          crossProductDispatchPerformed: false,
          productControlRoomMustRevalidateExactHead: true,
          receiptRequired: true,
          mergeAuthorized: false,
          deployAuthorized: false,
          providerMutationAuthorized: false,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        code: 'PRODUCT_BUILD_DIRECTIVE_REJECTED',
        reasons: [error instanceof Error ? error.message : 'Product build directive could not be created'],
      });
    }
  },
);
