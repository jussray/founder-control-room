import {
  FirstPartySocialPublisherError,
  validateFirstPartySocialPost,
} from '../lib/firstPartySocialPublisher.js';
import {
  FOUNDER_OS_LAB_VERSION,
  type FounderOsLabAction,
  type FounderOsLabPlan,
  type FounderOsLabRequest,
} from './contracts.js';
import { FOUNDER_OS_LAB_ACTION_ROUTES } from './registry.js';

const MUTATING_ACTIONS: ReadonlySet<FounderOsLabAction> = new Set([
  'queue-social',
  'publish-social',
  'merge-code',
  'deploy-code',
  'send-email',
]);

const SOCIAL_ACTIONS: ReadonlySet<FounderOsLabAction> = new Set([
  'draft-social',
  'queue-social',
  'publish-social',
]);

function approvalCoversAction(request: FounderOsLabRequest): boolean {
  const approval = request.approval;
  return Boolean(
    approval
    && approval.id.trim()
    && approval.actions.includes(request.action),
  );
}

function expectedSocialMode(action: FounderOsLabAction): 'draft' | 'queue' | 'publish' | null {
  if (action === 'draft-social') return 'draft';
  if (action === 'queue-social') return 'queue';
  if (action === 'publish-social') return 'publish';
  return null;
}

function socialValidationErrors(request: FounderOsLabRequest): string[] {
  if (!SOCIAL_ACTIONS.has(request.action)) return [];
  if (!request.socialPost) return ['A socialPost payload is required for social actions.'];

  const expectedMode = expectedSocialMode(request.action);
  if (request.socialPost.mode !== expectedMode) {
    return [`${request.action} requires socialPost.mode=${expectedMode}.`];
  }

  try {
    validateFirstPartySocialPost(request.socialPost);
    return [];
  } catch (error) {
    if (error instanceof FirstPartySocialPublisherError) return [...error.details];
    return [error instanceof Error ? error.message : 'Unknown social validation failure.'];
  }
}

function evidenceUnknowns(request: FounderOsLabRequest): string[] {
  const unknown: string[] = [];
  const evidence = request.evidence;

  if (!evidence?.repository) unknown.push('Authoritative repository was not supplied to the lab.');
  if (!evidence?.commitSha) unknown.push('Exact source commit SHA was not supplied to the lab.');
  if (!evidence?.proofUrls?.length) unknown.push('No proof URLs were supplied to the lab.');

  if (request.action === 'queue-social' || request.action === 'publish-social') {
    unknown.push('No live Buffer, Zapier, or destination-platform receipt exists in simulation mode.');
  }
  if (request.action === 'merge-code') {
    unknown.push('No live GitHub mergeability, review-thread, or exact-head check query was executed.');
  }
  if (request.action === 'deploy-code') {
    unknown.push('No Cloudflare or other deployment-provider state was queried.');
  }
  if (request.action === 'send-email') {
    unknown.push('No Gmail, HubSpot, recipient, or delivery state was queried.');
  }

  return unknown;
}

export function planFounderOsLab(request: FounderOsLabRequest): FounderOsLabPlan {
  const goal = request.goal.trim();
  const route = FOUNDER_OS_LAB_ACTION_ROUTES[request.action];
  const approvalRequired = route.approvalRequired;
  const approvalObserved = approvalCoversAction(request);
  const validationErrors: string[] = [];

  if (!goal) validationErrors.push('goal is required.');
  if (goal.length > 2_000) validationErrors.push('goal must be at most 2000 characters.');
  validationErrors.push(...socialValidationErrors(request));

  const blocked: string[] = [...validationErrors];
  if (approvalRequired && !approvalObserved) {
    blocked.push(`Explicit founder approval covering ${request.action} is required before an external executor may act.`);
  }

  const readiness = validationErrors.length > 0
    ? 'blocked'
    : approvalRequired && !approvalObserved
      ? 'approval_required'
      : MUTATING_ACTIONS.has(request.action)
        ? 'ready_for_external_executor'
        : 'ready_for_review';

  const socialValidated = SOCIAL_ACTIONS.has(request.action) && validationErrors.length === 0;
  const verified = [
    'The plan was produced by a deterministic, in-process simulation.',
    'The lab performed no external call, provider call, database write, filesystem write, or environment read.',
    'Execution authority remains disabled even when an approval reference is supplied.',
  ];
  if (socialValidated) {
    verified.push('The supplied social payload passed the existing first-party proof and content validator.');
  }

  const nextGate = readiness === 'blocked'
    ? 'Correct the rejected lab input and rerun the pure test path.'
    : readiness === 'approval_required'
      ? `Attach one explicit founder approval scoped to ${request.action}, then rerun the lab. No provider action will occur.`
      : readiness === 'ready_for_external_executor'
        ? 'Review the generated plan and receipts, then separately authorize one named external adapter in a new change.'
        : 'Review the simulated route and promote only one capability to a separately governed adapter experiment.';

  return {
    version: FOUNDER_OS_LAB_VERSION,
    goal,
    action: request.action,
    readiness,
    isolation: {
      externalCalls: false,
      providerCalls: false,
      databaseWrites: false,
      filesystemWrites: false,
      environmentReads: false,
    },
    authority: {
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired,
      approvalObserved,
    },
    route: {
      chiefSkill: 'juss-chief-ai',
      specialistSkill: route.specialistSkill,
      capabilities: [...route.capabilities],
      adapters: [...route.adapters],
    },
    truth: {
      verified,
      inferred: [
        'The selected specialist is the narrowest match from the checked-in lab registry.',
      ],
      unknown: evidenceUnknowns(request),
      blocked,
    },
    redteam: {
      shouldExist: true,
      premiseRisk: 'A broad autonomous-company runtime would compound authority mistakes faster than it compounds value.',
      failureModes: [
        'A prompt could be mistaken for executable authority.',
        'A preview adapter could accidentally import a live provider client.',
        'An approval identifier could be mistaken for proof that an action executed.',
        'A successful draft validation could be mislabeled as publication success.',
      ],
    },
    l99: {
      authority: 'L0 simulation only. No mutation authority is present.',
      state: readiness,
      evidence: socialValidated
        ? 'Existing first-party social validation passed in memory.'
        : 'Only the deterministic routing contract was evaluated.',
      rollback: 'Delete or revert src/founder-os-lab; no external cleanup is required.',
      compoundingValue: 'One provider-neutral contract can safely train and test future specialist adapters.',
    },
    ooda: {
      observe: ['Read the founder goal and supplied evidence fields only.'],
      orient: [`Route through juss-chief-ai to ${route.specialistSkill}.`],
      decide: [`Select ${route.capabilities.join(', ')} without granting execution authority.`],
      act: ['Produce an in-memory plan only.'],
      verify: [
        'Assert all isolation flags remain false for side effects.',
        'Assert executionAllowed remains false for every action.',
        ...(socialValidated ? ['Assert the existing social validator accepts the supplied payload.'] : []),
      ],
      loop: [nextGate],
    },
    nextGate,
  };
}
