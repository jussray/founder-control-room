import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { readMemberSession, type MemberIdentity } from '../../auth/memberSession.js';
import { supabase } from '../../lib/supabaseClient.js';
import { respondError, respondSuccess } from '../apiResponse.js';
import { requireSameOriginBrowserMutation } from '../middleware/csrf.js';

export const memberProjectsRouter = Router();
const TABLE = 'fcr_member_projects';
const FIELDS = 'id,title,goal,version,created_at,updated_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identities = new WeakMap<Request, MemberIdentity>();

memberProjectsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
// This surface accepts only member cookies; a caller-supplied Bearer header
// cannot opt it out of the browser mutation gate.
memberProjectsRouter.use((req, res, next) => {
  if (req.get('Authorization')) { respondError(res, 400, 'BAD_REQUEST', 'Use your member browser session.'); return; }
  next();
});
memberProjectsRouter.use(requireSameOriginBrowserMutation);
memberProjectsRouter.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
memberProjectsRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await readMemberSession(req);
    if (!member) { respondError(res, 401, 'UNAUTHENTICATED', 'Member sign-in required.'); return; }
    const { data, error } = await supabase.from('founder_users').select('email').eq('email', member.email).maybeSingle();
    if (error) { respondError(res, 503, 'AUTHORIZATION_UNAVAILABLE', 'Member identity check unavailable.'); return; }
    if (data) { respondError(res, 403, 'FORBIDDEN', 'Use the founder workspace.'); return; }
    identities.set(req, member);
    next();
  } catch { respondError(res, 503, 'SESSION_UNAVAILABLE', 'Member session unavailable.'); }
});

function projectInput(value: unknown, update: boolean): { title: string; goal: string; version?: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['title', 'goal', ...(update ? ['version'] : [])].includes(key))) return null;
  if (typeof body.title !== 'string' || typeof body.goal !== 'string') return null;
  const title = body.title.trim();
  if (!title || title.length > 120 || body.goal.length > 4000) return null;
  if (update && (!Number.isSafeInteger(body.version) || Number(body.version) < 1 || Number(body.version) >= 2147483647)) return null;
  return { title, goal: body.goal, ...(update ? { version: Number(body.version) } : {}) };
}

memberProjectsRouter.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from(TABLE).select(FIELDS)
      .eq('owner_user_id', identities.get(req)!.userId).order('updated_at', { ascending: false }).limit(100);
    if (error) throw error;
    return respondSuccess(res, { projects: data ?? [] });
  } catch { return respondError(res, 503, 'PROJECTS_UNAVAILABLE', 'Projects could not be loaded.'); }
});

memberProjectsRouter.post('/', async (req, res) => {
  const input = projectInput(req.body, false);
  if (!input) return respondError(res, 400, 'BAD_REQUEST', 'Provide a title (1–120 characters) and goal (up to 4000 characters).');
  try {
    const { data, error } = await supabase.from(TABLE)
      .insert({ owner_user_id: identities.get(req)!.userId, title: input.title, goal: input.goal })
      .select(FIELDS).single();
    if (error || !data) throw error ?? new Error('Missing project');
    return respondSuccess(res, { project: data }, 201);
  } catch { return respondError(res, 503, 'PROJECT_SAVE_FAILED', 'Project was not confirmed. Reload projects before trying again.'); }
});

memberProjectsRouter.get('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return respondError(res, 404, 'NOT_FOUND', 'Project not found.');
  try {
    const { data, error } = await supabase.from(TABLE).select(FIELDS)
      .eq('owner_user_id', identities.get(req)!.userId).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return respondError(res, 404, 'NOT_FOUND', 'Project not found.');
    return respondSuccess(res, { project: data });
  } catch { return respondError(res, 503, 'PROJECTS_UNAVAILABLE', 'Project could not be loaded.'); }
});

memberProjectsRouter.patch('/:id', async (req, res) => {
  const input = projectInput(req.body, true);
  if (!UUID.test(req.params.id)) return respondError(res, 404, 'NOT_FOUND', 'Project not found.');
  if (!input) return respondError(res, 400, 'BAD_REQUEST', 'A valid title, goal and current project version are required.');
  try {
    const { data, error } = await supabase.from(TABLE)
      .update({ title: input.title, goal: input.goal, version: input.version! + 1, updated_at: new Date().toISOString() })
      .eq('owner_user_id', identities.get(req)!.userId).eq('id', req.params.id).eq('version', input.version!)
      .select(FIELDS).maybeSingle();
    if (error) throw error;
    if (!data) return respondError(res, 409, 'PROJECT_CHANGED', 'Project is unavailable or changed. Reload before saving.');
    return respondSuccess(res, { project: data });
  } catch { return respondError(res, 503, 'PROJECT_SAVE_FAILED', 'Project save could not be confirmed. Reload before saving again.'); }
});
