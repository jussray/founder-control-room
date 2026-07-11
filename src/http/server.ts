import express from 'express';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import {
  corsMiddleware,
  helmetMiddleware,
  BODY_LIMIT,
  rateLimitMagicLink,
  rateLimitGeneral,
  requestAudit,
  errorHandler,
} from './middleware/security.js';
import { handleGitHubWebhook } from './webhooks/github.js';

export function createServer() {
  const app = express();

  // -------------------------------------------------------------------------
  // Global middleware (order matters)
  // -------------------------------------------------------------------------
  app.use(helmetMiddleware);       // Security headers first
  app.use(corsMiddleware);          // CORS before any route
  app.use(requestAudit);            // Audit every request
  app.use(rateLimitGeneral);        // Global rate cap

  // Webhooks need the raw body for HMAC verification — mount before express.json()
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json' }),
    handleGitHubWebhook,
  );

  app.use(express.json({ limit: BODY_LIMIT }));

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // Rate-limit magic-link specifically (5 req / 15 min)
  app.use('/auth/magic-link', rateLimitMagicLink);
  app.use('/auth', authRouter);

  app.use('/projects', projectsRouter);

  // /approvals is added in Milestone B (PR #2). Imported conditionally so this
  // file compiles on main before that PR merges.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { approvalsRouter } = require('./routes/approvals.js');
    app.use('/approvals', approvalsRouter);
  } catch {
    // approvals route not yet present on this branch — safe to skip
  }

  // -------------------------------------------------------------------------
  // Centralized error handler (must be last)
  // -------------------------------------------------------------------------
  app.use(errorHandler);

  return app;
}
