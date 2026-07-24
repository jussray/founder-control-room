import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { founderOnboardingRouter } from './routes/founderOnboarding.js';
import { projectsRouter } from './routes/projects.js';
import { approvalsRouter } from './routes/approvals.js';
import { l99Router } from './routes/l99.js';
import { terminalRouter } from './routes/terminal.js';
import { dashboardRouter } from './routes/dashboard.js';
import { missionsRouter } from './routes/missions.js';
import { promptosRouter } from './routes/promptos.js';
import { agentsRouter } from './routes/agents.js';
import { authorityLevelsRouter } from './routes/authorityLevels.js';
import { pluginCenterRouter } from './routes/pluginCenter.js';
import { commandBridgeRouter } from './routes/commandBridge.js';
import { designOsRouter } from './routes/designOs.js';
import { cloudflareReasoningRouter } from './routes/cloudflareReasoning.js';
import { mcpRouter } from './routes/mcp.js';
import { handleFounderSignalEngineMcp } from './routes/founderSignalEngineMcp.js';
import { portfolioVerificationRouter } from './routes/portfolioVerification.js';
import {
  handleRepositoryVerificationIngest,
  repositoryVerificationRouter,
} from './routes/repositoryVerification.js';
import { economicIntelligenceRouter } from './routes/economicIntelligence.js';
import { handleGitHubWebhook } from './webhooks/github.js';
import { debugRouter } from './routes/debug.js';
import { publicGuardrailSnapshot, renderGuardrailStatusPage } from '../guardrails.js';
import {
  corsMiddleware,
  helmetMiddleware,
  rateLimitGeneral,
  requestAudit,
  errorHandler,
  BODY_LIMIT,
} from './middleware/security.js';
import { requireSameOriginBrowserMutation } from './middleware/csrf.js';
import { requireProjectReadAudit } from './middleware/projectReadAudit.js';

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
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestAudit);

  if (options.serveStatic) {
    const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');
    app.use('/control-room', express.static(path.join(publicDir, 'control-room')));
  }

  // Webhooks, remote MCP calls, and repo-runner pings do not use browser
  // cookies. Mount them before the browser same-origin mutation gate and give
  // each endpoint its own strict parser/authentication contract.
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json', limit: BODY_LIMIT }),
    handleGitHubWebhook,
  );
  app.post(
    '/ingest/repository-verification',
    express.raw({ type: 'application/json', limit: '512kb' }),
    handleRepositoryVerificationIngest,
  );
  app.post(
    '/mcp/founder-signal-engine',
    rateLimitGeneral,
    express.json({ type: 'application/json', limit: '64kb' }),
    handleFounderSignalEngineMcp,
  );

  app.use(requireSameOriginBrowserMutation);
  app.use(express.json({ limit: BODY_LIMIT }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/guardrails', (_req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
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

  app.use(rateLimitGeneral);

  app.use('/', onboardingRouter);
  app.use('/auth', authRouter);
  app.use('/onboarding', founderOnboardingRouter);
  app.use('/portfolio', portfolioVerificationRouter);
  app.use('/projects', repositoryVerificationRouter);
  app.use('/projects', requireProjectReadAudit, projectsRouter);
  app.use('/approvals', approvalsRouter);
  app.use('/l99', l99Router);
  app.use('/terminal', terminalRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/missions', missionsRouter);
  app.use('/promptos', promptosRouter);
  app.use('/agents', agentsRouter);
  app.use('/authority-levels', authorityLevelsRouter);
  app.use('/plugin-center', pluginCenterRouter);
  app.use('/command-bridge', commandBridgeRouter);
  app.use('/design-os', designOsRouter);
  app.use('/cloudflare', cloudflareReasoningRouter);
  app.use('/mcp', mcpRouter);
  app.use('/economic-intelligence', economicIntelligenceRouter);

  // Debug routes — CI and founder inspection only (no secrets exposed).
  app.use('/_debug', debugRouter);

  app.use(errorHandler);

  return app;
}
