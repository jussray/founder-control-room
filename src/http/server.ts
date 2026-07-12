import express from 'express';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { approvalsRouter } from './routes/approvals.js';
import { handleGitHubWebhook } from './webhooks/github.js';
import { publicGuardrailSnapshot, renderGuardrailStatusPage } from '../guardrails.js';

export function createServer() {
  const app = express();
  app.disable('x-powered-by');

  // Webhooks need the raw body for HMAC verification — mount before express.json()
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json' }),
    handleGitHubWebhook,
  );

  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/guardrails', (_req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    res.status(200).send(renderGuardrailStatusPage());
  });

  app.get('/guardrails.json', (_req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    res.status(200).json(publicGuardrailSnapshot());
  });

  app.use('/auth', authRouter);
  app.use('/projects', projectsRouter);
  app.use('/approvals', approvalsRouter);

  return app;
}
