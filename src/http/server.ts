import express from 'express';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { projectsRouter } from './routes/projects.js';
import { approvalsRouter } from './routes/approvals.js';
import { l99Router } from './routes/l99.js';
import { terminalRouter } from './routes/terminal.js';
import { handleGitHubWebhook } from './webhooks/github.js';
import {
  BODY_LIMIT,
  corsMiddleware,
  errorHandler,
  helmetMiddleware,
  rateLimitGeneral,
  requestAudit,
} from './middleware/security.js';
import { onboardingContentSecurityPolicy } from './middleware/onboardingSecurity.js';
import { requireSameOriginForCookieMutation } from './middleware/cookieSecurity.js';

export function createServer() {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmetMiddleware);
  app.use(onboardingContentSecurityPolicy);
  app.use(corsMiddleware);
  app.use(requestAudit);

  // Webhooks need the raw body for HMAC verification — mount before express.json().
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json', limit: BODY_LIMIT }),
    handleGitHubWebhook,
  );

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(rateLimitGeneral);
  app.use(requireSameOriginForCookieMutation);

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/', onboardingRouter);
  app.use('/auth', authRouter);
  app.use('/projects', projectsRouter);
  app.use('/approvals', approvalsRouter);
  app.use('/l99', l99Router);
  app.use('/terminal', terminalRouter);

  app.use(errorHandler);
  return app;
}
