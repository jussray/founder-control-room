import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { readProjectShellState } from '../../lib/projectShellState.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const projectShellStateRouter = Router();

projectShellStateRouter.get('/:slug/shell-state', requireFounder, async (req: FounderRequest, res) => {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, slug, name, status')
    .eq('slug', req.params.slug)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug ${req.params.slug}` });

  const canonical = await readProjectShellState(project.id);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    contract: 'fcr/project-shell-state@v1',
    project,
    canonical,
  });
});
