import express from 'express';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { approvalsRouter } from './routes/approvals.js';
import { l99Router } from './routes/l99.js';
import { mcpRouter } from './routes/mcp.js';
import { handleGitHubWebhook } from './webhooks/github.js';

export function createServer() {
  const app = express();

  // Webhooks need the raw body for HMAC verification — mount before express.json()
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json' }),
    handleGitHubWebhook,
  );

  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use('/projects', projectsRouter);
  app.use('/approvals', approvalsRouter);
  app.use('/l99', l99Router);
  app.use('/mcp', mcpRouter);

  return app;
}
