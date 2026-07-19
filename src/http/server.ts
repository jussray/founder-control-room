import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { approvalsRouter } from './routes/approvals.js';
import { l99Router } from './routes/l99.js';
import { terminalRouter } from './routes/terminal.js';
import { dashboardRouter } from './routes/dashboard.js';
import { missionsRouter } from './routes/missions.js';
import { promptosRouter } from './routes/promptos.js';
import { agentsRouter } from './routes/agents.js';
import { authorityLevelsRouter } from './routes/authorityLevels.js';
import { handleGitHubWebhook } from './webhooks/github.js';
import {
  corsMiddleware,
  helmetMiddleware,
  rateLimitGeneral,
  rateLimitMagicLink,
  requestAudit,
  errorHandler,
  BODY_LIMIT,
} from './middleware/security.js';

export interface CreateServerOptions {
  /**
   * Serve the static Control Room frontend (public/control-room) from this
   * process. Node-only — reads from the local filesystem, so it's off by
   * default in the Cloudflare Worker entry point (cf-entry.ts), where the
   * documented deployment path is Cloudflare Pages serving the frontend
   * separately, not this Worker's filesystem.
   */
  serveStatic?: boolean;
}

export function createServer(options: CreateServerOptions = {}) {
  const app = express();

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestAudit);

  if (options.serveStatic) {
    const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');
    app.use('/control-room', express.static(path.join(publicDir, 'control-room')));
  }

  // Webhooks need the raw body for HMAC verification — mount before express.json()
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json' }),
    handleGitHubWebhook,
  );

  app.use(express.json({ limit: BODY_LIMIT }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth/magic-link', rateLimitMagicLink);
  app.use(rateLimitGeneral);

  app.use('/auth', authRouter);
  app.use('/projects', projectsRouter);
  app.use('/approvals', approvalsRouter);
  app.use('/l99', l99Router);
  app.use('/terminal', terminalRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/missions', missionsRouter);
  app.use('/promptos', promptosRouter);
  app.use('/agents', agentsRouter);
  app.use('/authority-levels', authorityLevelsRouter);

  app.use(errorHandler);

  return app;
}
