import { Router, type Response } from 'express';
import { buildCurrentTruthProjection } from '../../buildEvents/currentTruth.js';
import { supabase } from '../../lib/supabaseClient.js';
import { loadBuildEvents } from '../../services/buildEventStore.js';
import { requireFounder } from '../middleware/requireFounder.js';
import { requireProjectReadAudit } from '../middleware/projectReadAudit.js';

export const buildEventsRouter = Router();
buildEventsRouter.use(requireFounder);
buildEventsRouter.use(requireProjectReadAudit);

function noStore(res: Response) {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
}

buildEventsRouter.get('/:slug/current-truth', async (req, res) => {
  noStore(res);
  const slug = req.params.slug?.trim();
  if (!slug) return res.status(400).json({ error: 'project slug is required' });

  try {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, name, repo_identifier')
      .eq('slug', slug)
      .maybeSingle();

    if (projectError) throw new Error('project_lookup_failed');
    if (!project) return res.status(404).json({ error: 'project not registered' });

    const read = await loadBuildEvents(project.id);
    const snapshot = buildCurrentTruthProjection(project.slug, read.events);

    return res.status(200).json({
      project: {
        slug: project.slug,
        name: project.name,
        repository: project.repo_identifier ?? null,
      },
      snapshot,
      dataQuality: {
        invalidStoredEvents: read.invalidStoredEvents,
        boundedEventWindow: 500,
      },
    });
  } catch {
    return res.status(503).json({ error: 'current truth unavailable' });
  }
});
