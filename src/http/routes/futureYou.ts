import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { buildMissionControlBrief } from '../../futureyou/missionControl.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const futureYouRouter = Router();
futureYouRouter.use(requireFounder);

const MISSION_LIMIT = 200;
const ACTIVITY_LIMIT = 100;

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
}

async function projectLabels(projectIds: string[]) {
  const uniqueIds = [...new Set(projectIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map<string, { slug: string; name: string }>();

  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name')
    .in('id', uniqueIds);

  if (error) throw new Error(error.message);
  return new Map((data as ProjectRow[] | null ?? []).map((project) => [project.id, { slug: project.slug, name: project.name }]));
}

futureYouRouter.get('/v8/brief', async (_req: FounderRequest, res) => {
  const [missionResult, activityResult] = await Promise.all([
    supabase
      .from('missions')
      .select('id, project_id, title, description, status, risk_level, updated_at')
      .order('updated_at', { ascending: false })
      .limit(MISSION_LIMIT),
    supabase
      .from('project_events')
      .select('id, project_id, event_type, severity, screen, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);

  if (missionResult.error) return res.status(500).json({ error: missionResult.error.message });
  if (activityResult.error) return res.status(500).json({ error: activityResult.error.message });

  try {
    const missions = missionResult.data ?? [];
    const activity = activityResult.data ?? [];
    const labels = await projectLabels([
      ...missions.map((mission) => mission.project_id),
      ...activity.map((event) => event.project_id),
    ]);

    const brief = buildMissionControlBrief({
      missions: missions.map((mission) => ({ ...mission, project: labels.get(mission.project_id) ?? null })),
      activity: activity.map((event) => ({ ...event, project: labels.get(event.project_id) ?? null })),
    });

    res.set('Cache-Control', 'no-store');
    return res.json(brief);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to build FutureYou V8 brief' });
  }
});
