import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { buildGoalfixReport, type FounderGoal } from '../../goalfix/engine.js';
import { buildGoalfixSkillRuntimeDecision } from '../../goalfix/skillRuntime.js';
import type { GoalfixAttempt } from '../../goalfix/stagnation.js';
import { supabase } from '../../lib/supabaseClient.js';
import { providerForProject } from '../../providers/providerFactory.js';
import type {
  RepositoryProvider,
  RepositoryRef,
  VerificationSignal,
} from '../../providers/RepositoryProvider.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const goalfixRouter = Router();
goalfixRouter.use(requireFounder);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  repo_provider: string;
  repo_identifier: string | null;
}

interface GoalfixAuditInput {
  projectId: string;
  founderUserId: string | null;
  eventType: 'goalfix_inspection_completed' | 'goalfix_inspection_failed';
  severity: 'info' | 'error';
  stage: 'provider_factory' | 'resolve_ref' | 'list_verification_signals' | 'completed';
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
  if (!Array.isArray(value) || value.length > 20) return null;

  const attempts: GoalfixAttempt[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const approach = optionalString(row['approach'], 500);
    const filesTouched = stringList(row['filesTouched'], 20, 300);
    const result = row['result'];
    if (
      !approach
      || !filesTouched
      || (result !== 'passed' && result !== 'failed' && result !== 'blocked')
    ) return null;

    attempts.push({
      approach,
      failureSignature: optionalString(row['failureSignature'], 500),
      filesTouched,
      verificationName: optionalString(row['verificationName'], 200),
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

/**
 * POST /goalfix/inspect
 *
 * Executes the first Goalfix vertical slice: founder goal intake, one bounded
 * repository read, exact-head evidence classification, and a founder-ready
 * report. It never creates a branch, changes a file, merges, deploys, writes to
 * CRM, or mutates provider state. A sanitized internal access-audit event is
 * required for both completed and failed provider-read attempts.
 */
goalfixRouter.post('/inspect', async (req: FounderRequest, res) => {
  const body = req.body as Record<string, unknown>;
  const projectSlug = typeof body['projectSlug'] === 'string' ? body['projectSlug'].trim() : '';
  const desiredOutcome = typeof body['desiredOutcome'] === 'string' ? body['desiredOutcome'].trim() : '';
  const targetRef = safeRef(body['targetRef']);
  const constraints = stringList(body['constraints'], 20, 300);
  const firstFilesOrLogs = stringList(body['firstFilesOrLogs'], 20, 300);
  const expectedVerificationNames = stringList(body['expectedVerificationNames'], 20, 200);
  const intentAssumptions = stringList(body['intentAssumptions'], 20, 300);
  const attempts = attemptList(body['attempts']);

  if (!projectSlug || !SLUG_PATTERN.test(projectSlug)) {
    return res.status(400).json({ error: 'projectSlug must be lowercase alphanumeric segments separated by hyphens' });
  }
  if (!desiredOutcome || desiredOutcome.length > 1_000) {
    return res.status(400).json({ error: 'desiredOutcome is required and must be at most 1000 characters' });
  }
  if (!targetRef) {
    return res.status(400).json({ error: 'targetRef contains an unsupported ref format' });
  }
  if (!constraints || !firstFilesOrLogs || !expectedVerificationNames || !intentAssumptions || !attempts) {
    return res.status(400).json({
      error: 'constraints, firstFilesOrLogs, expectedVerificationNames, intentAssumptions, and attempts must be bounded valid values',
    });
  }
  if (expectedVerificationNames.length === 0) {
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

  const runtimeDecision = buildGoalfixSkillRuntimeDecision({
    intent: {
      raw: desiredOutcome,
      resolved: optionalString(body['resolvedIntent'], 1_000),
      assumptions: intentAssumptions,
    },
    attempts,
    scope: {
      firstFilesOrLogs,
      maxInitialReads,
      stopCondition: optionalString(body['stopCondition'], 500) ?? '',
    },
    provenance: {
      artifactSha256,
      sourceName: optionalString(body['artifactSourceName'], 300),
    },
  });

  if (!runtimeDecision.mayProceed) {
    res.set('Cache-Control', 'no-store');
    return res.status(409).json({
      error: runtimeDecision.nextAction,
      code: 'GOALFIX_RUNTIME_BLOCKED',
      skillRuntime: runtimeDecision,
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

  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, repo_provider, repo_identifier')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  const project = data as ProjectRow | null;
  if (!project) return res.status(404).json({ error: `No project registered with slug "${projectSlug}"` });
  if (!project.repo_identifier) {
    return res.status(503).json({ error: 'Project has no repository configured.', code: 'REPOSITORY_PROVIDER_UNAVAILABLE' });
  }

  const founderUserId = req.founder?.userId ?? null;
  const providerFailure = async (
    stage: GoalfixAuditInput['stage'],
    providerError: unknown,
    target?: RepositoryRef,
  ) => {
    const audited = await persistGoalfixAudit({
      projectId: project.id,
      founderUserId,
      eventType: 'goalfix_inspection_failed',
      severity: 'error',
      stage,
      requestedRef: targetRef,
      target,
      expectedSignalCount: expectedVerificationNames.length,
      errorClass: errorClass(providerError),
    });
    if (!audited) {
      return res.status(500).json({
        error: 'Goalfix access audit persistence failed',
        code: 'AUDIT_PERSISTENCE_FAILED',
      });
    }
    return res.status(502).json({
      error: providerError instanceof Error ? providerError.message : 'Unable to inspect repository evidence',
      code: 'GOALFIX_INSPECTION_FAILED',
    });
  };

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

  let target: RepositoryRef;
  try {
    target = await provider.getRef(project.slug, targetRef);
  } catch (providerError) {
    return providerFailure('resolve_ref', providerError);
  }

  let verificationSignals: VerificationSignal[];
  try {
    verificationSignals = await provider.listVerificationSignals(project.slug, target.commitSha);
  } catch (providerError) {
    return providerFailure('list_verification_signals', providerError, target);
  }

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

  const exactHeadSignalCount = verificationSignals.filter(
    (signal) => signal.commitSha.toLowerCase() === target.commitSha.toLowerCase(),
  ).length;
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
  return res.json({ ...report, skillRuntime: runtimeDecision });
});
