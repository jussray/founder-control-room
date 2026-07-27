import { Router } from 'express';
import { buildGoalfixReport, type FounderGoal } from '../../goalfix/engine.js';
import { supabase } from '../../lib/supabaseClient.js';
import { providerForProject } from '../../providers/providerFactory.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const goalfixRouter = Router();
goalfixRouter.use(requireFounder);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  repo_provider: string;
  repo_identifier: string | null;
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

/**
 * POST /goalfix/inspect
 *
 * Executes the first Goalfix vertical slice: founder goal intake, one bounded
 * repository read, exact-head evidence classification, and a founder-ready
 * report. It never creates a branch, changes a file, merges, deploys, writes to
 * CRM, or mutates provider state.
 */
goalfixRouter.post('/inspect', async (req: FounderRequest, res) => {
  const body = req.body as Record<string, unknown>;
  const projectSlug = typeof body['projectSlug'] === 'string' ? body['projectSlug'].trim() : '';
  const desiredOutcome = typeof body['desiredOutcome'] === 'string' ? body['desiredOutcome'].trim() : '';
  const targetRef = safeRef(body['targetRef']);
  const constraints = stringList(body['constraints'], 20, 300);
  const firstFilesOrLogs = stringList(body['firstFilesOrLogs'], 20, 300);

  if (!projectSlug || !SLUG_PATTERN.test(projectSlug)) {
    return res.status(400).json({ error: 'projectSlug must be lowercase alphanumeric segments separated by hyphens' });
  }
  if (!desiredOutcome || desiredOutcome.length > 1_000) {
    return res.status(400).json({ error: 'desiredOutcome is required and must be at most 1000 characters' });
  }
  if (!targetRef) {
    return res.status(400).json({ error: 'targetRef contains an unsupported ref format' });
  }
  if (!constraints || !firstFilesOrLogs) {
    return res.status(400).json({ error: 'constraints and firstFilesOrLogs must be bounded arrays of non-empty strings' });
  }

  const goal: FounderGoal = {
    desiredOutcome,
    reason: optionalString(body['reason'], 2_000),
    constraints,
    suspectedFailureArea: optionalString(body['suspectedFailureArea'], 500),
    firstFilesOrLogs,
    stopCondition: optionalString(body['stopCondition'], 500),
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

  try {
    const provider = providerForProject({
      repo_provider: project.repo_provider,
      slug: project.slug,
      repo_identifier: project.repo_identifier,
    });
    const target = await provider.getRef(project.slug, targetRef);
    const verificationSignals = await provider.listVerificationSignals(project.slug, target.commitSha);
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

    res.set('Cache-Control', 'no-store');
    return res.json(report);
  } catch (providerError) {
    return res.status(502).json({
      error: providerError instanceof Error ? providerError.message : 'Unable to inspect repository evidence',
      code: 'GOALFIX_INSPECTION_FAILED',
    });
  }
});
