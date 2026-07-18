import express from 'express';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { approvalsRouter } from './routes/approvals.js';
import { l99Router } from './routes/l99.js';
import { terminalRouter } from './routes/terminal.js';
import { dashboardRouter } from './routes/dashboard.js';
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

export function createServer() {
  const app = express();

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestAudit);

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

  app.use(errorHandler);

  return app;
}
