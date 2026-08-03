import {
  FirstPartySocialPublisherError,
  validateFirstPartySocialPost,
} from '../lib/firstPartySocialPublisher.js';
import {
  FOUNDER_OS_LAB_VERSION,
  type FounderOsLabAction,
  type FounderOsLabAdapterId,
  type FounderOsLabCapabilityId,
  type FounderOsLabEvidenceField,
  type FounderOsLabPlan,
  type FounderOsLabRequest,
} from './contracts.js';
import {
  FOUNDER_OS_LAB_PROVIDER_PREFLIGHT_EVIDENCE,
  founderOsLabObservedEvidenceFields,
  founderOsLabProviderEvidenceErrors,
} from './providerEvidence.js';
import { resolveFounderOsLabProject } from './projectAdapters.js';
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

const EXECUTOR_READY_ACTIONS: ReadonlySet<FounderOsLabAction> = new Set([
  'queue-social',
  'publish-social',
  'merge-code',
  'deploy-code',
]);

const SOCIAL_ACTIONS: ReadonlySet<FounderOsLabAction> = new Set([
  'draft-social',
  'queue-social',
  'publish-social',
]);

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

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

  if (request.project) {
    unknown.push(`No live read of ${request.project.sourceRepository} occurred; project truth came only from submitted exact-head contract URLs and the checked-in adapter.`);
  }
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
    unknown.push('No Gmail, HubSpot, recipient, consent, suppression, approved-content, or delivery state was queried.');
  }

  return unique(unknown);
}

export function planFounderOsLab(request: FounderOsLabRequest): FounderOsLabPlan {
  const goal = request.goal.trim();
  const actionRoute = FOUNDER_OS_LAB_ACTION_ROUTES[request.action];
  const command = founderOsLabCommand(request.command ?? actionRoute.defaultCommand);
  const provider = founderOsLabProvider(request.provider ?? actionRoute.defaultProvider);
  const projectResolution = resolveFounderOsLabProject(request, provider.id, command.id);
  const providerSupported = provider.supportedActions.includes(request.action);
  const approvalRequired = actionRoute.approvalRequired;
  const approvalObserved = approvalCoversAction(request);
  const mutatingAction = MUTATING_ACTIONS.has(request.action);
  const executorReadyAction = EXECUTOR_READY_ACTIONS.has(request.action);
  const observedEvidence = founderOsLabObservedEvidenceFields(request);
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
  validationErrors.push(
    ...semanticEvidenceErrors,
    ...projectResolution.errors,
    ...socialErrors,
  );

  const blocked: string[] = [...validationErrors];
  if (approvalRequired && !approvalObserved) {
    blocked.push(`Explicit founder approval covering ${request.action} is required before an external executor may act.`);
  }

  const readiness = validationErrors.length > 0
    ? 'blocked'
    : approvalRequired && !approvalObserved
      ? 'approval_required'
      : executorReadyAction
        ? 'ready_for_external_executor'
        : 'ready_for_review';

  const socialValidated = SOCIAL_ACTIONS.has(request.action) && socialErrors.length === 0;
  const projectValidated = Boolean(request.project)
    && projectResolution.errors.length === 0
    && projectResolution.route !== null;
  const verified = [
    'The plan was produced by a deterministic, in-process simulation.',
    'The lab performed no external call, provider call, database write, filesystem write, or environment read.',
    'Execution authority remains disabled even when an approval reference is supplied.',
    `The ${command.id} command lens and ${provider.id} provider preview were resolved from the checked-in registry.`,
  ];
  if (socialValidated) {
    verified.push('The supplied social payload passed the existing first-party proof and content validator.');
  }
  if (projectValidated && projectResolution.route) {
    verified.push(
      `${projectResolution.route.name} is bound to ${projectResolution.route.repository} at audited source head ${projectResolution.route.auditedSourceHead}.`,
      `All required ${projectResolution.route.id} canon contracts were supplied as exact-head GitHub blob URLs.`,
      'Se’kret Bip display canon, legacy internal-id compatibility, audience separation, editable output, source trace, and factual AI identity boundaries remain required.',
    );
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
  if (request.action === 'send-email' && validationErrors.length === 0) {
    verified.push(
      `${provider.id} identity evidence is reviewable, but it is not outbound dispatch authorization.`,
    );
  }

  const nextGate = projectResolution.errors.length > 0
    ? `Correct the project adapter evidence and rerun the preview: ${projectResolution.errors.join(' ')} No repository, design, or provider action will occur.`
    : missingPreflightEvidence.length > 0
      ? `Supply the missing ${provider.id} preflight evidence (${missingPreflightEvidence.join(', ')}) and rerun the preview. No provider action will occur.`
      : semanticEvidenceErrors.length > 0
        ? `Correct the ${provider.id} evidence semantics and rerun the preview: ${semanticEvidenceErrors.join(' ')} No provider action will occur.`
        : readiness === 'blocked'
          ? 'Correct the rejected registry or payload input and rerun the pure preview path.'
          : readiness === 'approval_required'
            ? `Attach one explicit founder approval scoped to ${request.action}, then rerun the preview. No ${provider.id} action will occur.`
            : readiness === 'ready_for_external_executor'
              ? `Review the ${command.id} plan and evidence requirements, then separately authorize one named external adapter for ${provider.id} in a new change.`
              : request.action === 'send-email'
                ? 'Keep this outreach at review-only until a canonical allowed DispatchDecision, recipient identity, approved content, consent, suppression, and content-approval evidence are supplied through a separately governed adapter change. No email will be sent.'
                : request.project
                  ? `Review the ${request.project.id} preview against its exact source contracts. Any implementation requires a separate change in the authoritative project repository with exact-head proof.`
                  : `Review the ${command.id} preview and promote only one ${provider.id} capability through a separately governed adapter experiment.`;

  const capabilities = unique<FounderOsLabCapabilityId>([
    ...actionRoute.capabilities,
    ...projectResolution.capabilities,
  ]);
  const adapters = unique<FounderOsLabAdapterId>([
    ...actionRoute.adapters,
    ...projectResolution.adapters,
  ]);

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
      project: projectResolution.route,
      capabilities,
      adapters,
    },
    truth: {
      verified,
      inferred: [
        'The selected specialist is the narrowest match from the checked-in lab registry.',
        `The ${command.id} command is a reasoning lens, not executable authority.`,
        `The ${provider.id} entry is a provider preview contract, not proof of a live connection.`,
        ...(request.project
          ? ['The project adapter constrains a future project change; it does not copy project code or grant cross-repository authority.']
          : []),
        ...(request.action === 'send-email'
          ? ['Provider identity evidence is not proof of recipient permission, suppression clearance, approved content, or dispatch eligibility.']
          : []),
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
        'A project adapter could drift from the authoritative project head or copy project authority into Founder Control Room.',
        'Teen and Bip Jr presentation audiences could be confused with account roles.',
        'Legacy companion identifiers could be renamed without a compatibility migration.',
        'CRM record identity could be mistaken for consent or outbound dispatch authorization.',
        'A successful draft validation could be mislabeled as publication success.',
      ],
    },
    l99: {
      authority: 'L0 simulation only. No mutation authority is present.',
      state: readiness,
      evidence: projectValidated && projectResolution.route
        ? `The checked-in ${projectResolution.route.id} adapter and exact-head canon contract URLs were evaluated in memory.`
        : socialValidated
          ? 'Existing first-party social validation passed in memory.'
          : `Only the deterministic ${command.id} and ${provider.id} registry contracts were evaluated.`,
      rollback: projectResolution.route?.rollback ?? provider.rollback,
      compoundingValue: request.project
        ? 'One canon-bound project adapter can constrain future design and implementation handoffs without copying project code or provider authority.'
        : 'One provider-neutral registry can safely train and test future specialist adapters without copying platform prompts.',
    },
    ooda: {
      observe: [
        'Read the founder goal and supplied evidence fields only.',
        ...(request.project ? ['Read the submitted project identity, exact head, audience, and canon contract URLs.'] : []),
      ],
      orient: [
        `Route through juss-chief-ai to ${actionRoute.specialistSkill}.`,
        `Apply the ${command.id} reasoning lens to the ${provider.id} preview target.`,
        ...(request.project ? [`Apply the ${request.project.id} project adapter without transferring repository authority.`] : []),
      ],
      decide: [`Select ${capabilities.join(', ')} without granting execution authority.`],
      act: ['Produce an in-memory preview only.'],
      verify: [
        'Assert all isolation flags remain false for side effects.',
        'Assert executionAllowed remains false for every action and provider.',
        `Assert ${provider.id} supports ${request.action} before presenting a proceedable preview.`,
        ...(request.project
          ? ['Assert project repository, audited head, required canon contracts, audience rules, editable output, source trace, and AI identity boundaries.']
          : []),
        ...(mutatingAction
          ? [`Assert required ${provider.id} preflight evidence is present and semantically bound before executor readiness.`]
          : []),
        ...(request.action === 'send-email'
          ? ['Assert provider identity proof is never treated as an allowed outbound DispatchDecision.']
          : []),
        ...(socialValidated ? ['Assert the existing social validator accepts the supplied payload.'] : []),
      ],
      loop: [nextGate],
    },
    nextGate,
  };
}
