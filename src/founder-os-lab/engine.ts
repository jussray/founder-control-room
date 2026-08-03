import {
  FirstPartySocialPublisherError,
  validateFirstPartySocialPost,
} from '../lib/firstPartySocialPublisher.js';
import {
  FOUNDER_OS_LAB_VERSION,
  type FounderOsLabAction,
  type FounderOsLabEvidenceField,
  type FounderOsLabPlan,
  type FounderOsLabRequest,
} from './contracts.js';
import {
  FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE,
  founderOsLabProviderEvidenceErrors,
} from './providerEvidence.js';
import {
  FOUNDER_OS_LAB_ACTION_ROUTES,
  founderOsLabCommand,
  founderOsLabProvider,
} from './registry.js';

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

function observedEvidenceFields(request: FounderOsLabRequest): FounderOsLabEvidenceField[] {
  const observed: FounderOsLabEvidenceField[] = [];
  const evidence = request.evidence;
  const socialPost = request.socialPost;

  if (evidence?.repository || socialPost?.sourceRepository) observed.push('repository');
  if (evidence?.commitSha || socialPost?.sourceCommitSha) observed.push('commitSha');
  if (evidence?.proofUrls?.length || socialPost?.proofLinks?.length) observed.push('proofUrls');
  if (evidence?.projectId) observed.push('projectId');
  if (evidence?.automationId) observed.push('automationId');
  if (evidence?.workspaceId) observed.push('workspaceId');
  if (evidence?.recordIds?.length) observed.push('recordIds');
  if (evidence?.associationPlan) observed.push('associationPlan');

  return observed;
}

function evidenceUnknowns(
  request: FounderOsLabRequest,
  providerId: string,
  observedEvidence: readonly FounderOsLabEvidenceField[],
): string[] {
  const unknown: string[] = [];

  if (!observedEvidence.includes('repository')) {
    unknown.push('Authoritative repository was not supplied to the lab.');
  }
  if (!observedEvidence.includes('commitSha')) {
    unknown.push('Exact source commit SHA was not supplied to the lab.');
  }
  if (!observedEvidence.includes('proofUrls')) {
    unknown.push('No proof URLs were supplied to the lab.');
  }

  unknown.push(`No live ${providerId} provider call or destination receipt exists in preview mode.`);

  if (request.action === 'queue-social' || request.action === 'publish-social') {
    unknown.push('No live Buffer, Zapier, or destination-platform receipt exists in simulation mode.');
  }
  if (request.action === 'merge-code') {
    unknown.push('No live GitHub mergeability, review-thread, or exact-head check query was executed.');
  }
  if (request.action === 'deploy-code') {
    unknown.push('No Cloudflare, Supabase, or other deployment-provider state was queried.');
  }
  if (request.action === 'send-email') {
    unknown.push('No Gmail, HubSpot, recipient, or delivery state was queried.');
  }

  return [...new Set(unknown)];
}

export function planFounderOsLab(request: FounderOsLabRequest): FounderOsLabPlan {
  const goal = request.goal.trim();
  const actionRoute = FOUNDER_OS_LAB_ACTION_ROUTES[request.action];
  const command = founderOsLabCommand(request.command ?? actionRoute.defaultCommand);
  const provider = founderOsLabProvider(request.provider ?? actionRoute.defaultProvider);
  const providerSupported = provider.supportedActions.includes(request.action);
  const approvalRequired = actionRoute.approvalRequired;
  const approvalObserved = approvalCoversAction(request);
  const mutatingAction = MUTATING_ACTIONS.has(request.action);
  const observedEvidence = observedEvidenceFields(request);
  const requiredPreflightEvidence = mutatingAction
    ? [...FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE[provider.id]]
    : [];
  const missingPreflightEvidence = requiredPreflightEvidence.filter(
    (field) => !observedEvidence.includes(field),
  );
  const semanticEvidenceErrors = mutatingAction && providerSupported
    ? founderOsLabProviderEvidenceErrors(request, provider.id)
    : [];
  const socialErrors = socialValidationErrors(request);
  const validationErrors: string[] = [];

  if (!goal) validationErrors.push('goal is required.');
  if (goal.length > 2_000) validationErrors.push('goal must be at most 2000 characters.');
  if (!providerSupported) {
    validationErrors.push(`${provider.id} does not support a ${request.action} preview in the checked-in registry.`);
  }
  if (providerSupported && missingPreflightEvidence.length > 0) {
    validationErrors.push(
      `Missing required ${provider.id} preflight evidence: ${missingPreflightEvidence.join(', ')}.`,
    );
  }
  validationErrors.push(...semanticEvidenceErrors, ...socialErrors);

  const blocked: string[] = [...validationErrors];
  if (approvalRequired && !approvalObserved) {
    blocked.push(`Explicit founder approval covering ${request.action} is required before an external executor may act.`);
  }

  const readiness = validationErrors.length > 0
    ? 'blocked'
    : approvalRequired && !approvalObserved
      ? 'approval_required'
      : mutatingAction
        ? 'ready_for_external_executor'
        : 'ready_for_review';

  const socialValidated = SOCIAL_ACTIONS.has(request.action) && socialErrors.length === 0;
  const verified = [
    'The plan was produced by a deterministic, in-process simulation.',
    'The lab performed no external call, provider call, database write, filesystem write, or environment read.',
    'Execution authority remains disabled even when an approval reference is supplied.',
    `The ${command.id} command lens and ${provider.id} provider preview were resolved from the checked-in registry.`,
  ];
  if (socialValidated) {
    verified.push('The supplied social payload passed the existing first-party proof and content validator.');
  }
  if (
    mutatingAction
    && missingPreflightEvidence.length === 0
    && semanticEvidenceErrors.length === 0
  ) {
    verified.push(
      `Required ${provider.id} preflight evidence is present and semantically valid.`,
    );
  }

  const nextGate = missingPreflightEvidence.length > 0
    ? `Supply the missing ${provider.id} preflight evidence (${missingPreflightEvidence.join(', ')}) and rerun the preview. No provider action will occur.`
    : semanticEvidenceErrors.length > 0
      ? `Correct the ${provider.id} evidence semantics and rerun the preview: ${semanticEvidenceErrors.join(' ')} No provider action will occur.`
      : readiness === 'blocked'
        ? 'Correct the rejected registry or payload input and rerun the pure preview path.'
        : readiness === 'approval_required'
          ? `Attach one explicit founder approval scoped to ${request.action}, then rerun the preview. No ${provider.id} action will occur.`
          : readiness === 'ready_for_external_executor'
            ? `Review the ${command.id} plan and evidence requirements, then separately authorize one named external adapter for ${provider.id} in a new change.`
            : `Review the ${command.id} preview and promote only one ${provider.id} capability through a separately governed adapter experiment.`;

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
      specialistSkill: actionRoute.specialistSkill,
      command: {
        id: command.id,
        specialistSkill: command.specialistSkill,
        role: command.role,
      },
      provider: {
        id: provider.id,
        mode: provider.mode,
        supported: providerSupported,
        executionAllowed: false,
        approvalRequired,
        credentialBoundary: provider.credentialBoundary,
        evidenceRequired: [...provider.evidenceRequired],
        preflightEvidenceRequired: requiredPreflightEvidence,
        preflightEvidenceObserved: observedEvidence.filter((field) => (
          requiredPreflightEvidence.includes(field)
        )),
        preflightEvidenceMissing: missingPreflightEvidence,
        rollback: provider.rollback,
      },
      capabilities: [...actionRoute.capabilities],
      adapters: [...actionRoute.adapters],
    },
    truth: {
      verified,
      inferred: [
        'The selected specialist is the narrowest match from the checked-in lab registry.',
        `The ${command.id} command is a reasoning lens, not executable authority.`,
        `The ${provider.id} entry is a provider preview contract, not proof of a live connection.`,
      ],
      unknown: evidenceUnknowns(request, provider.id, observedEvidence),
      blocked,
    },
    redteam: {
      shouldExist: true,
      premiseRisk: 'A broad autonomous-company runtime would compound authority mistakes faster than it compounds value.',
      failureModes: [
        'A prompt or command alias could be mistaken for executable authority.',
        'A provider preview could be mistaken for a connected or authenticated provider.',
        'A preview adapter could accidentally import a live provider client.',
        'An approval identifier could be mistaken for proof that an action executed.',
        'An approval could be mistaken for a substitute for exact-head or provider preflight evidence.',
        'Unrelated evidence could be relabeled as proof for a different provider target.',
        'A successful draft validation could be mislabeled as publication success.',
      ],
    },
    l99: {
      authority: 'L0 simulation only. No mutation authority is present.',
      state: readiness,
      evidence: socialValidated
        ? 'Existing first-party social validation passed in memory.'
        : `Only the deterministic ${command.id} and ${provider.id} registry contracts were evaluated.`,
      rollback: provider.rollback,
      compoundingValue: 'One provider-neutral registry can safely train and test future specialist adapters without copying platform prompts.',
    },
    ooda: {
      observe: ['Read the founder goal and supplied evidence fields only.'],
      orient: [
        `Route through juss-chief-ai to ${actionRoute.specialistSkill}.`,
        `Apply the ${command.id} reasoning lens to the ${provider.id} preview target.`,
      ],
      decide: [`Select ${actionRoute.capabilities.join(', ')} without granting execution authority.`],
      act: ['Produce an in-memory preview only.'],
      verify: [
        'Assert all isolation flags remain false for side effects.',
        'Assert executionAllowed remains false for every action and provider.',
        `Assert ${provider.id} supports ${request.action} before presenting a proceedable preview.`,
        ...(mutatingAction
          ? [`Assert required ${provider.id} preflight evidence is present and semantically bound before executor readiness.`]
          : []),
        ...(socialValidated ? ['Assert the existing social validator accepts the supplied payload.'] : []),
      ],
      loop: [nextGate],
    },
    nextGate,
  };
}
