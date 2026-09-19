import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  GOALFIX_AUTO_STOP_CONDITION,
  GoalfixContextResolutionError,
  parseGoalfixVerificationManifest,
  repositoryIdentityMatches,
  resolveGoalfixProjectHint,
  type GoalfixProjectCandidate,
} from '../../goalfix/contextResolution.js';
import { buildGoalfixReport, type FounderGoal } from '../../goalfix/engine.js';
import { buildGoalfixSkillRuntimeDecision } from '../../goalfix/skillRuntime.js';
import type { GoalfixAttempt } from '../../goalfix/stagnation.js';
import { supabase } from '../../lib/supabaseClient.js';
import { providerForProject } from '../../providers/providerFactory.js';
import type {
  ProjectRepo,
  RepositoryProvider,
  RepositoryRef,
  VerificationSignal,
} from '../../providers/RepositoryProvider.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const goalfixRouter = Router();
goalfixRouter.use(requireFounder);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const VERIFICATION_MANIFEST_PATH = 'control-room.manifest.json';
const VERIFICATION_LEDGER_PATH = '.control-room/test-ledger.manifest.json';

interface ProjectRow extends GoalfixProjectCandidate {}

interface GoalfixAuditInput {
  projectId: string;
  founderUserId: string | null;
  eventType: 'goalfix_inspection_completed' | 'goalfix_inspection_failed';
  severity: 'info' | 'error';
  stage:
    | 'provider_factory'
    | 'get_project'
    | 'verify_repository_identity'
    | 'resolve_ref'
    | 'resolve_verification_contract'
    | 'list_verification_signals'
    | 'completed';
  requestedRef: string;
  target?: RepositoryRef;
  readiness?: string;
  exactHeadSignalCount?: number;
  expectedSignalCount: number;
  errorClass?: string;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function stringList(value: unknown, maxItems: number, maxItemLength: number): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => typeof item === 'string' ? item.trim() : null);
  if (items.some((item) => item === null || item.length === 0 || item.length > maxItemLength)) return null;
  return items as string[];
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < minimum || value > maximum) return null;
  return value;
}

function attemptList(value: unknown): GoalfixAttempt[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 60) return null;

  const attempts: GoalfixAttempt[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const approach = optionalString(row['approach'], 500);
    const filesTouched = stringList(row['filesTouched'], 20, 300);
    const result = row['result'];
    const commitSha = optionalString(row['commitSha'], 40);
    if (
      !approach
      || !filesTouched
      || (
        result !== 'passed'
        && result !== 'failed'
        && result !== 'blocked'
        && result !== 'incomplete'
      )
      || (
        row['commitSha'] !== undefined
        && row['commitSha'] !== null
        && row['commitSha'] !== ''
        && (!commitSha || !COMMIT_SHA_PATTERN.test(commitSha))
      )
    ) return null;

    attempts.push({
      approach,
      failureSignature: optionalString(row['failureSignature'], 500),
      filesTouched,
      verificationName: optionalString(row['verificationName'], 200),
      commitSha: commitSha?.toLowerCase(),
      result,
    });
  }

  return attempts;
}

function safeRef(value: unknown): string | null {
  const ref = value === undefined || value === null || value === '' ? 'main' : value;
  if (typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (
    !SAFE_REF_PATTERN.test(trimmed)
    || trimmed.includes('..')
    || trimmed.includes('//')
    || trimmed.startsWith('/')
    || trimmed.endsWith('/')
  ) return null;
  return trimmed;
}

function safeOptionalRef(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    !SAFE_REF_PATTERN.test(trimmed)
    || trimmed.includes('..')
    || trimmed.includes('//')
    || trimmed.startsWith('/')
    || trimmed.endsWith('/')
  ) return null;
  return trimmed;
}

function normalizeSignalName(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function uniqueVerificationNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizeSignalName(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function liveAttemptResult(status: VerificationSignal['status']): GoalfixAttempt['result'] {
  if (status === 'passed') return 'passed';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'incomplete';
}

function signalTime(signal: VerificationSignal): number {
  return Date.parse(signal.completedAt ?? signal.startedAt ?? '') || 0;
}

function currentRequiredCheckResults(
  signals: VerificationSignal[],
  targetSha: string,
  expectedVerificationNames: string[],
): Map<string, GoalfixAttempt['result']> {
  const results = new Map<string, GoalfixAttempt['result']>();
  const latest = new Map<string, VerificationSignal>();

  for (const name of expectedVerificationNames) {
    results.set(normalizeSignalName(name), 'incomplete');
  }

  for (const signal of signals) {
    if (signal.commitSha.toLowerCase() !== targetSha.toLowerCase()) continue;
    const key = normalizeSignalName(signal.name);
    if (!results.has(key)) continue;
    const current = latest.get(key);
    if (!current || signalTime(signal) >= signalTime(current)) latest.set(key, signal);
  }

  for (const [key, signal] of latest) {
    results.set(key, liveAttemptResult(signal.status));
  }

  return results;
}

function refreshAttemptHistory(
  attempts: GoalfixAttempt[],
  currentResults: Map<string, GoalfixAttempt['result']>,
): GoalfixAttempt[] {
  return attempts.filter((attempt) => {
    const current = currentResults.get(normalizeSignalName(attempt.verificationName));
    return current === 'failed' || current === 'blocked';
  });
}

function errorClass(error: unknown): string {
  if (error instanceof Error) return error.name || 'Error';
  return typeof error;
}

async function persistGoalfixAudit(input: GoalfixAuditInput): Promise<boolean> {
  const { error } = await supabase.from('project_events').insert({
    project_id: input.projectId,
    source_event_id: randomUUID(),
    event_type: input.eventType,
    severity: input.severity,
    screen: 'control-room-goalfix',
    metadata: {
      route: 'POST /goalfix/inspect',
      actor: 'founder',
      founder_user_id: input.founderUserId,
      stage: input.stage,
      requested_ref: input.requestedRef,
      target_ref: input.target?.name ?? null,
      target_sha: input.target?.commitSha ?? null,
      readiness: input.readiness ?? null,
      exact_head_signal_count: input.exactHeadSignalCount ?? null,
      expected_signal_count: input.expectedSignalCount,
      error_class: input.errorClass ?? null,
      skill: 'goalfix',
      skill_runtime: 'goalfix-skill-runtime-v1',
    },
  });
  return !error;
}

async function loadAutomaticProject(projectHint: string): Promise<{
  project?: ProjectRow;
  error?: string;
  code?: string;
  candidates?: Array<{ slug: string; name: string }>;
}> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, repo_provider, repo_identifier')
    .eq('status', 'active')
    .eq('verification_enabled', true);

  if (error) return { error: error.message, code: 'PROJECT_REGISTRY_UNAVAILABLE' };
  const projects = Array.isArray(data) ? data as ProjectRow[] : [];
  const resolution = resolveGoalfixProjectHint(projects, projectHint);
  if (resolution.status === 'not_found') {
    return {
      error: `No active registered project matches "${projectHint}".`,
      code: 'PROJECT_CONTEXT_UNRESOLVED',
    };
  }
  if (resolution.status === 'ambiguous') {
    return {
      error: `Project shorthand "${projectHint}" is ambiguous.`,
      code: 'PROJECT_CONTEXT_AMBIGUOUS',
      candidates: resolution.candidates.map(({ slug, name }) => ({ slug, name })),
    };
  }
  return { project: resolution.project as ProjectRow };
}

/**
 * POST /goalfix/inspect
 *
 * Executes the first Goalfix vertical slice: founder goal intake, bounded
 * repository reads, exact-head evidence classification, and a founder-ready
 * report. It never creates a branch, changes a file, merges, deploys, writes to
 * CRM, or mutates provider state. A sanitized internal access-audit event is
 * required for both completed and failed provider-read attempts.
 *
 * Two compatible intake modes exist:
 * - `project`: founder-facing automatic context resolution. Project identity,
 *   default branch, repository identity, and required proof are resolved from
 *   authoritative registry/provider/repository state.
 * - `projectSlug`: legacy exact-input mode retained for existing callers.
 */
goalfixRouter.post('/inspect', async (req: FounderRequest, res) => {
  const body = req.body as Record<string, unknown>;
  const automaticProjectHint = optionalString(body['project'], 200);
  const legacyProjectSlug = typeof body['projectSlug'] === 'string' ? body['projectSlug'].trim() : '';
  const automaticContext = Boolean(automaticProjectHint);
  const desiredOutcome = typeof body['desiredOutcome'] === 'string' ? body['desiredOutcome'].trim() : '';
  const targetRefOverride = automaticContext ? safeOptionalRef(body['targetRef']) : undefined;
  const legacyTargetRef = automaticContext ? undefined : safeRef(body['targetRef']);
  const constraints = stringList(body['constraints'], 20, 300);
  const firstFilesOrLogs = stringList(body['firstFilesOrLogs'], 20, 300);
  const suppliedVerificationNames = stringList(body['expectedVerificationNames'], 20, 200);
  const intentAssumptions = stringList(body['intentAssumptions'], 20, 300);
  const attempts = attemptList(body['attempts']);

  if (automaticContext) {
    if (!automaticProjectHint) {
      return res.status(400).json({ error: 'project is required for automatic GoalFix context resolution' });
    }
  } else if (!legacyProjectSlug || !SLUG_PATTERN.test(legacyProjectSlug)) {
    return res.status(400).json({ error: 'projectSlug must be lowercase alphanumeric segments separated by hyphens' });
  }
  if (!desiredOutcome || desiredOutcome.length > 1_000) {
    return res.status(400).json({ error: 'desiredOutcome is required and must be at most 1000 characters' });
  }
  if ((automaticContext && targetRefOverride === null) || (!automaticContext && !legacyTargetRef)) {
    return res.status(400).json({ error: 'targetRef contains an unsupported ref format' });
  }
  if (!constraints || !firstFilesOrLogs || !suppliedVerificationNames || !intentAssumptions || !attempts) {
    return res.status(400).json({
      error: 'constraints, firstFilesOrLogs, expectedVerificationNames, intentAssumptions, and attempts must be bounded valid values',
    });
  }
  if (!automaticContext && suppliedVerificationNames.length === 0) {
    return res.status(400).json({ error: 'expectedVerificationNames must contain at least one required check name' });
  }

  const maxInitialReads = boundedInteger(
    body['maxInitialReads'],
    1,
    20,
    Math.max(1, Math.min(firstFilesOrLogs.length || 1, 5)),
  );
  if (maxInitialReads === null) {
    return res.status(400).json({ error: 'maxInitialReads must be an integer between 1 and 20' });
  }

  const artifactSha256 = optionalString(body['artifactSha256'], 64);
  if (
    body['artifactSha256'] !== undefined
    && body['artifactSha256'] !== null
    && body['artifactSha256'] !== ''
    && (!artifactSha256 || !SHA256_PATTERN.test(artifactSha256))
  ) {
    return res.status(400).json({ error: 'artifactSha256 must be a 64-character hexadecimal SHA-256 value' });
  }

  const runtimeInput = {
    intent: {
      raw: desiredOutcome,
      resolved: optionalString(body['resolvedIntent'], 1_000),
      assumptions: intentAssumptions,
      confirmed: automaticContext && intentAssumptions.length === 0 ? true : undefined,
    },
    scope: {
      firstFilesOrLogs,
      maxInitialReads,
      stopCondition: optionalString(body['stopCondition'], 500)
        ?? (automaticContext ? GOALFIX_AUTO_STOP_CONDITION : ''),
    },
    provenance: {
      artifactSha256,
      sourceName: optionalString(body['artifactSourceName'], 300),
    },
  };

  const preflightDecision = buildGoalfixSkillRuntimeDecision({
    ...runtimeInput,
    attempts: [],
  });

  if (!preflightDecision.mayProceed) {
    res.set('Cache-Control', 'no-store');
    return res.status(409).json({
      error: preflightDecision.nextAction,
      code: 'GOALFIX_RUNTIME_BLOCKED',
      skillRuntime: preflightDecision,
    });
  }

  let project: ProjectRow | null = null;
  if (automaticContext && automaticProjectHint) {
    const resolved = await loadAutomaticProject(automaticProjectHint);
    if (!resolved.project) {
      res.set('Cache-Control', 'no-store');
      return res.status(resolved.code === 'PROJECT_REGISTRY_UNAVAILABLE' ? 500 : 409).json({
        error: resolved.error,
        code: resolved.code,
        candidates: resolved.candidates,
      });
    }
    project = resolved.project;
  } else {
    const { data, error } = await supabase
      .from('projects')
      .select('id, slug, name, repo_provider, repo_identifier')
      .eq('slug', legacyProjectSlug)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    project = data as ProjectRow | null;
    if (!project) return res.status(404).json({ error: `No project registered with slug "${legacyProjectSlug}"` });
  }

  if (!project.repo_identifier) {
    return res.status(503).json({ error: 'Project has no repository configured.', code: 'REPOSITORY_PROVIDER_UNAVAILABLE' });
  }

  const founderUserId = req.founder?.userId ?? null;
  let expectedVerificationNames = suppliedVerificationNames;
  let targetRef = automaticContext ? (targetRefOverride ?? '(default)') : legacyTargetRef!;

  const failedContext = async (
    stage: GoalfixAuditInput['stage'],
    code: string,
    message: string,
    target?: RepositoryRef,
    failure?: unknown,
    status = 409,
  ) => {
    const audited = await persistGoalfixAudit({
      projectId: project!.id,
      founderUserId,
      eventType: 'goalfix_inspection_failed',
      severity: 'error',
      stage,
      requestedRef: targetRef,
      target,
      expectedSignalCount: expectedVerificationNames.length,
      errorClass: failure ? errorClass(failure) : code,
    });
    if (!audited) {
      return res.status(500).json({
        error: 'Goalfix access audit persistence failed',
        code: 'AUDIT_PERSISTENCE_FAILED',
      });
    }
    res.set('Cache-Control', 'no-store');
    return res.status(status).json({ error: message, code, target });
  };

  const providerFailure = async (
    stage: GoalfixAuditInput['stage'],
    providerError: unknown,
    target?: RepositoryRef,
  ) => failedContext(
    stage,
    'GOALFIX_INSPECTION_FAILED',
    providerError instanceof Error ? providerError.message : 'Unable to inspect repository evidence',
    target,
    providerError,
    502,
  );

  let provider: RepositoryProvider;
  try {
    provider = providerForProject({
      repo_provider: project.repo_provider,
      slug: project.slug,
      repo_identifier: project.repo_identifier,
    });
  } catch (providerError) {
    return providerFailure('provider_factory', providerError);
  }

  let providerProject: ProjectRepo | undefined;
  if (automaticContext) {
    try {
      providerProject = await provider.getProject(project.slug);
    } catch (providerError) {
      return providerFailure('get_project', providerError);
    }
    if (!providerProject.isActive) {
      return failedContext(
        'verify_repository_identity',
        'GOALFIX_REPOSITORY_INACTIVE',
        'The registered project repository is not active at the provider.',
      );
    }
    if (!repositoryIdentityMatches(project.repo_identifier, providerProject.locator)) {
      return failedContext(
        'verify_repository_identity',
        'GOALFIX_REPOSITORY_IDENTITY_MISMATCH',
        'Live provider repository identity does not match the registered project repository.',
      );
    }
    const defaultRef = safeOptionalRef(providerProject.defaultBranch);
    if (!defaultRef) {
      return failedContext(
        'verify_repository_identity',
        'GOALFIX_DEFAULT_BRANCH_INVALID',
        'The live provider did not expose a usable default branch.',
      );
    }
    targetRef = targetRefOverride ?? defaultRef;
  }

  let target: RepositoryRef;
  try {
    target = await provider.getRef(project.slug, targetRef);
  } catch (providerError) {
    return providerFailure('resolve_ref', providerError);
  }

  if (automaticContext && providerProject) {
    let manifestText: string;
    try {
      manifestText = await provider.readFile(project.slug, target.commitSha, VERIFICATION_MANIFEST_PATH);
    } catch (providerError) {
      return failedContext(
        'resolve_verification_contract',
        'GOALFIX_VERIFICATION_CONTRACT_UNAVAILABLE',
        'Repository-owned verification contract could not be read at the exact target head.',
        target,
        providerError,
      );
    }

    try {
      let contract;
      try {
        contract = parseGoalfixVerificationManifest(
          manifestText,
          project.repo_identifier,
          target.name,
          providerProject.defaultBranch,
        );
      } catch (contextError) {
        if (
          !(contextError instanceof GoalfixContextResolutionError)
          || contextError.code !== 'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE'
        ) throw contextError;

        let providerPolicyText: string;
        try {
          providerPolicyText = await provider.readFile(
            project.slug,
            target.commitSha,
            VERIFICATION_LEDGER_PATH,
          );
        } catch (providerError) {
          return failedContext(
            'resolve_verification_contract',
            'GOALFIX_PROVIDER_CHECK_POLICY_UNAVAILABLE',
            'Repository catalog is inventory only and its exact provider required-check policy could not be read at the target head.',
            target,
            providerError,
          );
        }

        contract = parseGoalfixVerificationManifest(
          manifestText,
          project.repo_identifier,
          target.name,
          providerProject.defaultBranch,
          providerPolicyText,
        );
      }

      expectedVerificationNames = uniqueVerificationNames([
        ...contract.requiredVerificationNames,
        ...suppliedVerificationNames,
      ]);
    } catch (contextError) {
      const code = contextError instanceof GoalfixContextResolutionError
        ? contextError.code
        : 'GOALFIX_VERIFICATION_CONTRACT_INVALID';
      const message = contextError instanceof Error
        ? contextError.message
        : 'Repository-owned verification contract is invalid.';
      return failedContext('resolve_verification_contract', code, message, target, contextError);
    }
  }

  let verificationSignals: VerificationSignal[];
  try {
    verificationSignals = await provider.listVerificationSignals(project.slug, target.commitSha);
  } catch (providerError) {
    return providerFailure('list_verification_signals', providerError, target);
  }

  const expectedNameKeys = new Set(expectedVerificationNames.map(normalizeSignalName));
  const exactHeadAttempts = attempts.filter((attempt) => (
    attempt.commitSha?.toLowerCase() === target.commitSha.toLowerCase()
    && expectedNameKeys.has(normalizeSignalName(attempt.verificationName))
  ));
  const currentResults = currentRequiredCheckResults(
    verificationSignals,
    target.commitSha,
    expectedVerificationNames,
  );
  const runtimeDecision = buildGoalfixSkillRuntimeDecision({
    ...runtimeInput,
    attempts: refreshAttemptHistory(exactHeadAttempts, currentResults),
  });
  const exactHeadSignalCount = verificationSignals.filter(
    (signal) => signal.commitSha.toLowerCase() === target.commitSha.toLowerCase(),
  ).length;

  if (!runtimeDecision.mayProceed) {
    const audited = await persistGoalfixAudit({
      projectId: project.id,
      founderUserId,
      eventType: 'goalfix_inspection_failed',
      severity: 'error',
      stage: 'completed',
      requestedRef: targetRef,
      target,
      readiness: 'blocked',
      exactHeadSignalCount,
      expectedSignalCount: expectedVerificationNames.length,
    });
    if (!audited) {
      return res.status(500).json({
        error: 'Goalfix access audit persistence failed',
        code: 'AUDIT_PERSISTENCE_FAILED',
      });
    }

    res.set('Cache-Control', 'no-store');
    return res.status(409).json({
      error: runtimeDecision.nextAction,
      code: 'GOALFIX_RUNTIME_BLOCKED',
      skillRuntime: runtimeDecision,
      target,
    });
  }

  const goal: FounderGoal = {
    desiredOutcome: runtimeDecision.intent.resolved,
    reason: optionalString(body['reason'], 2_000),
    constraints,
    suspectedFailureArea: optionalString(body['suspectedFailureArea'], 500),
    firstFilesOrLogs: runtimeDecision.scope.firstFilesOrLogs,
    expectedVerificationNames,
    stopCondition: runtimeDecision.scope.stopCondition,
  };

  const report = buildGoalfixReport({
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
      repository: project.repo_identifier,
      provider: project.repo_provider,
    },
    target,
    goal,
    verificationSignals,
  });

  const audited = await persistGoalfixAudit({
    projectId: project.id,
    founderUserId,
    eventType: 'goalfix_inspection_completed',
    severity: report.readiness === 'blocked' ? 'error' : 'info',
    stage: 'completed',
    requestedRef: targetRef,
    target,
    readiness: report.readiness,
    exactHeadSignalCount,
    expectedSignalCount: expectedVerificationNames.length,
  });

  if (!audited) {
    return res.status(500).json({
      error: 'Goalfix access audit persistence failed',
      code: 'AUDIT_PERSISTENCE_FAILED',
    });
  }

  res.set('Cache-Control', 'no-store');
  return res.json({
    ...report,
    skillRuntime: runtimeDecision,
    contextResolution: automaticContext ? {
      mode: 'automatic',
      requestedProject: automaticProjectHint,
      resolvedProjectSlug: project.slug,
      repository: project.repo_identifier,
      defaultBranch: providerProject?.defaultBranch,
      requestedRef: targetRefOverride ?? null,
      resolvedRef: target.name,
      verificationContract: `${VERIFICATION_MANIFEST_PATH}@${target.commitSha}`,
      requiredVerificationNames: expectedVerificationNames,
    } : {
      mode: 'legacy-explicit',
    },
  });
});
