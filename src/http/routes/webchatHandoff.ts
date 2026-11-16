import { Router, type Request, type RequestHandler, type Response } from 'express';
import { observeFirstPartyWebchat } from '../../growth/webchatObserve.js';
import { buildWebchatHumanHandoff, HUMAN_HANDOFF_ACKNOWLEDGEMENT } from '../../growth/webchatHumanHandoff.js';
import type { WebchatHandoffStore } from '../../growth/webchatHandoffStore.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

/**
 * Webchat `/human` wiring.
 *
 * Public: POST /webchat/messages — disabled (404) unless the request's project
 * is listed in FCR_WEBCHAT_HUMAN_HANDOFF_PROJECTS. It never generates a bot
 * reply and never dispatches anything; it records `/human` handoffs and tells
 * the widget whether the bot may reply in that conversation.
 *
 * Founder-only: GET /webchat/handoffs, POST /webchat/handoffs/:key/release.
 */
const SAFE_KEY = /^webchat-handoff:[a-f0-9]{64}$/;
const PURPOSES = new Set(['support', 'updates', 'marketing']);

export function enabledWebchatProjects(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    String(env.FCR_WEBCHAT_HUMAN_HANDOFF_PROJECTS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ ok: false, error });
}

export function createWebchatMessageHandler(
  store: WebchatHandoffStore,
  options: { now?: () => Date; env?: NodeJS.ProcessEnv } = {},
): RequestHandler {
  const now = options.now ?? (() => new Date());
  return async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    if (!enabledWebchatProjects(options.env).has(projectId)) {
      fail(res, 404, 'Webchat is not enabled for this project.');
      return;
    }

    let observation;
    try {
      observation = observeFirstPartyWebchat({
        projectId,
        brandId: typeof body.brandId === 'string' ? body.brandId : projectId,
        entryFlowFingerprintId: String(body.entryFlowFingerprintId ?? ''),
        conversationId: String(body.conversationId ?? ''),
        anonymousVisitorId: String(body.anonymousVisitorId ?? ''),
        text: typeof body.text === 'string' ? body.text : undefined,
        purpose: (PURPOSES.has(String(body.purpose)) ? body.purpose : 'support') as 'support',
        occurredAt: now().toISOString(),
      });
    } catch (error) {
      fail(res, 400, error instanceof Error ? error.message : 'Invalid webchat message.');
      return;
    }

    try {
      const handoff = buildWebchatHumanHandoff(observation);
      if (handoff) {
        const disposition = await store.record(handoff);
        res.status(202).json({
          ok: true,
          handoff: { state: handoff.state, disposition, reason: handoff.reason },
          botMayReply: false,
          visitorMessage: HUMAN_HANDOFF_ACKNOWLEDGEMENT,
        });
        return;
      }
      const open = await store.hasOpenHandoff(projectId, observation.envelope.providerConversationId);
      res.status(200).json({ ok: true, handoff: null, botMayReply: !open });
    } catch {
      // Never report success when the queue could not be written or read.
      fail(res, 503, 'Handoff queue unavailable. Please try again.');
    }
  };
}

export function createWebchatHandoffRouter(store: WebchatHandoffStore): Router {
  const router = Router();
  router.use(requireFounder);

  router.get('/handoffs', async (_req: FounderRequest, res) => {
    try {
      const handoffs = await store.listPending(100);
      res.set('Cache-Control', 'no-store').json({ ok: true, handoffs });
    } catch {
      fail(res, 503, 'Handoff queue unavailable.');
    }
  });

  router.post('/handoffs/:key/release', async (req: FounderRequest, res) => {
    const key = String(req.params.key ?? '');
    if (!SAFE_KEY.test(key)) {
      fail(res, 400, 'Invalid handoff key.');
      return;
    }
    try {
      const released = await store.release(key, req.founder?.userId ?? 'founder');
      if (!released) {
        fail(res, 404, 'No pending handoff with that key.');
        return;
      }
      res.json({ ok: true, released: key, botMayReply: true });
    } catch {
      fail(res, 503, 'Handoff queue unavailable.');
    }
  });

  return router;
}
