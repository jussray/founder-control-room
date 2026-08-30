import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { founderOnboardingRouter } from './routes/founderOnboarding.js';
import { projectsRouter } from './routes/projects.js';
import { buildEventsRouter } from './routes/buildEvents.js';
import { handleBuildEventReceiptIngest } from './routes/buildEventReceipts.js';
import { reasoningRunsRouter } from './routes/reasoningRuns.js';
import { approvalsRouter } from './routes/approvals.js';
import { l99Router } from './routes/l99.js';
import { terminalRouter } from './routes/terminal.js';
import { dashboardRouter } from './routes/dashboard.js';
import { missionsRouter } from './routes/missions.js';
import { promptosRouter } from './routes/promptos.js';
import { agentsRouter } from './routes/agents.js';
import { capabilitiesRouter } from './routes/capabilities.js';
import { authorityLevelsRouter } from './routes/authorityLevels.js';
import { pluginCenterRouter } from './routes/pluginCenter.js';
import { commandBridgeRouter } from './routes/commandBridge.js';
import { designOsRouter } from './routes/designOs.js';
import { cloudflareReasoningRouter } from './routes/cloudflareReasoning.js';
import { mcpRouter } from './routes/mcp.js';
import { handleRemoteMcpProtectedResourceMetadata } from './routes/remoteReadMcp.js';
import { externalUseRouter } from './routes/externalUse.js';
import { futureYouRouter } from './routes/futureYou.js';
import { goalfixRouter } from './routes/goalfix.js';
import { founderOsSkillsRouter } from './routes/founderOsSkills.js';
import { mirrorRouter } from './routes/mirror.js';
import { n8nConveyorRouter } from './routes/n8nConveyor.js';
import { quickScanRouter } from './routes/quickscan.js';
import { switchboardRouter } from './routes/switchboard.js';
import { securityPostureRouter } from './routes/securityPosture.js';
import { handleFounderSignalEngineMcp } from './routes/founderSignalEngineMcp.js';
import { handleXEngagementSignalMcp } from './routes/xEngagementSignalMcp.js';
import { handleFounderSignalReviewContextIngest } from './routes/founderSignalReviewContexts.js';
import { handleFounderSignalReviewEmailIngest } from './routes/founderSignalReviewEmailIngress.js';
import { handleJiraWorkAutomationIngress } from './routes/jiraWorkAutomationIngress.js';
import { handleHairCommerceReceiptIngest } from './routes/hairCommerceReceipts.js';
import {
  handleProofOfShipCommitLookup,
  handleProofOfShipReceiptIngest,
  handleProofOfShipReceiptLookup,
} from './routes/proofOfShipReceipts.js';
import { portfolioVerificationRouter } from './routes/portfolioVerification.js';
import {
  handleRepositoryVerificationIngest,
  repositoryVerificationRouter,
} from './routes/repositoryVerification.js';
import { economicIntelligenceRouter } from './routes/economicIntelligence.js';
import { handleGitHubWebhook } from './webhooks/github.js';
import { handleStripeQuickScanWebhook } from './webhooks/stripeQuickScan.js';
import { debugRouter } from './routes/debug.js';
import { publicGuardrailSnapshot, renderGuardrailStatusPage } from '../guardrails.js';
import { V10_CAPABILITY_PLAN_CONTRACT } from '../founder-os-lab/capabilityKernel.js';
import { FOUNDER_CONVEYOR_CONTRACT } from '../lib/founderConveyorReceipt.js';
import { providerForProject } from '../providers/providerFactory.js';
import { publishDeterministicReviewWitness } from '../review/deterministicReviewWitnessPublisher.js';
import {
  corsMiddleware,
  helmetMiddleware,
  rateLimitGeneral,
  requestAudit,
  errorHandler,
  BODY_LIMIT,
} from './middleware/security.js';
import { requireSameOriginBrowserMutation } from './middleware/csrf.js';
import { jsonParseErrorHandler } from './middleware/jsonParseError.js';
import { requireProjectReadAudit } from './middleware/projectReadAudit.js';
import { requireFounder } from './middleware/requireFounder.js';
import { requirePortfolioSwitchOn } from './middleware/requirePortfolioSwitchOn.js';
import { requireV10PrivilegedApprovalBinding } from './middleware/v10PrivilegedApprovalBinding.js';
import { requireV10DecisionFounderBinding } from './middleware/v10DecisionFounderBinding.js';
import { requireFounderSignalEngineMcpToken } from './middleware/founderSignalEngineMcpAuth.js';
import { requireFounderSignalReadMcpToken } from './middleware/founderSignalReadMcpAuth.js';
import { requireFounderSignalEngineReviewOnly } from './middleware/founderSignalEngineWriteGate.js';

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SUPABASE_PROJECT_REF = /^[a-z0-9]{20}$/;
const SERVICE_IDENTITY = 'founder-control-room';
const FCR_REVIEW_PROJECT = {
  repo_provider: 'github',
  slug: 'founder-control-room',
  repo_identifier: 'jussray/founder-control-room',
} as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function founderSignalAutomationGrantStatus() {
  const raw = process.env.FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON?.trim();
  if (!raw) return { configured: false, enabled: null };

  try {
    const parsed: unknown = JSON.parse(raw);
    return {
      configured: true,
      enabled: isRecord(parsed) && typeof parsed.enabled === 'boolean' ? parsed.enabled : null,
    };
  } catch {
    return { configured: true, enabled: null };
  }
}

function deploymentVersion() {
  const configuredSha = process.env.GIT_SHA?.trim() ?? '';
  const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF?.trim() ?? '';
  const maxRuntimeAuthority = process.env.FCR_V10_MAX_RUNTIME_AUTHORITY?.trim() ?? '';
  const registryResolutionRequired = process.env.FCR_V10_REGISTRY_RESOLUTION_REQUIRED?.trim() ?? '';
  const receiptPersistenceRequired = process.env.FCR_V10_RECEIPT_PERSISTENCE_REQUIRED?.trim() ?? '';

  return {
    service: SERVICE_IDENTITY,
    gitSha: EXACT_COMMIT_SHA.test(configuredSha) ? configuredSha.toLowerCase() : null,
    v10: {
      capabilityPlanContract: V10_CAPABILITY_PLAN_CONTRACT,
      conveyorContract: FOUNDER_CONVEYOR_CONTRACT,
      supabaseProjectRef: SUPABASE_PROJECT_REF.test(supabaseProjectRef) ? supabaseProjectRef : null,
      maxRuntimeAuthority: maxRuntimeAuthority === 'draft' ? 'draft' : null,
      trustedRegistryRequiredBeforeL1: registryResolutionRequired === 'true',
      receiptPersistenceRequired: receiptPersistenceRequired === 'true',
    },
    founderSignalAutomationGrant: founderSignalAutomationGrantStatus(),
  };
}

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

  app.use((_req, res, next) => {
    res.setHeader('X-Founder-Control-Room-Service', SERVICE_IDENTITY);
    next();
  });
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestAudit);

  if (options.serveStatic) {
    const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public');
    app.use('/control-room', express.static(path.join(publicDir, 'control-room')));
  }

  // Webhooks, remote MCP calls, repo-runner pings, sanitized commerce
  // receipts, downstream publication receipts, review contexts, and signed
  // service receipts do not use browser cookies. Mount them before the
  // browser same-origin mutation gate and give each endpoint strict parser/auth rules.
  app.post(
    '/webhooks/github',
    express.raw({ type: 'application/json', limit: BODY_LIMIT }),
    handleGitHubWebhook,
  );
  app.post(
    '/webhooks/stripe-quickscan',
    express.raw({ type: 'application/json', limit: '64kb' }),
    handleStripeQuickScanWebhook,
  );
  app.post(
    '/ingest/repository-verification',
    express.raw({ type: 'application/json', limit: '512kb' }),
    handleRepositoryVerificationIngest,
  );
  app.post(
    '/ingest/build-events/:slug',
    rateLimitGeneral,
    express.json({ type: 'application/json', limit: '32kb' }),
    handleBuildEventReceiptIngest,
  );
  app.post(
    '/ingest/hair-commerce-receipts',
    rateLimitGeneral,
    express.json({ type: 'application/json', limit: '32kb' }),
    handleHairCommerceReceiptIngest,
  );
  app.post(
    '/ingest/proof-of-ship-receipts',
    rateLimitGeneral,
    express.json({ type: 'application/json', limit: '32kb' }),
    handleProofOfShipReceiptIngest,
  );
  app.get(
    '/ingest/proof-of-ship-receipts/by-commit/:owner/:repo/:sha',
    rateLimitGeneral,
    handleProofOfShipCommitLookup,
  );
  app.get(
    '/ingest/proof-of-ship-receipts/:receiptId',
    rateLimitGeneral,
    handleProofOfShipReceiptLookup,
  );
  app.post(
    '/ingest/founder-review-contexts',
    rateLimitGeneral,
    express.json({ type: 'application/json', limit: '32kb' }),
    handleFounderSignalReviewContextIngest,
  );
  app.post(
    '/ingest/founder-review-email',
    rateLimitGeneral,
    express.raw({ type: 'application/json', limit: '16kb' }),
    handleFounderSignalReviewEmailIngest,
  );
  app.post(
    '/ingest/jira-work-automation',
    rateLimitGeneral,
    express.raw({ type: 'application/json', limit: '16kb' }),
    handleJiraWorkAutomationIngress,
  );
  app.post(
    '/mcp/founder-signal-engine',
    rateLimitGeneral,
    express.json({ type: 'application/json', limit: '64kb' }),
    requireFounderSignalEngineMcpToken,
    requireFounderSignalEngineReviewOnly,
    handleFounderSignalEngineMcp,
  );
  app.post(
    '/mcp/founder-signal-x-engagement',
    rateLimitGeneral,
    express.json({ type: 'application/json', limit: '16kb' }),
    requireFounderSignalReadMcpToken,
    handleXEngagementSignalMcp,
  );
  app.get(
    '/.well-known/oauth-protected-resource',
    handleRemoteMcpProtectedResourceMetadata,
  );
  app.get(
    '/.well-known/oauth-protected-resource/mcp',
    handleRemoteMcpProtectedResourceMetadata,
  );

  app.use(requireSameOriginBrowserMutation);
  app.use(express.json({ limit: BODY_LIMIT }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/version', (_req, res) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    res.status(200).json(deploymentVersion());
  });

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

  app.post(
    '/review/deterministic-witness/:pullRequestNumber',
    requireFounder,
    requirePortfolioSwitchOn('fcr-privileged-execution-master'),
    async (req, res, next) => {
      const pullRequestNumber = Number(req.params.pullRequestNumber);
      if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
        return res.status(400).json({ error: 'pullRequestNumber must be a positive integer' });
      }

      try {
        const runtimeSha = process.env.GIT_SHA?.trim() ?? '';
        if (!EXACT_COMMIT_SHA.test(runtimeSha)) {
          return res.status(503).json({ error: 'deterministic review witness requires the exact current main runtime' });
        }

        const provider = providerForProject(FCR_REVIEW_PROJECT);
        const currentMainSha = await provider.resolveRef(FCR_REVIEW_PROJECT.slug, 'main');
        if (currentMainSha.toLowerCase() !== runtimeSha.toLowerCase()) {
          return res.status(409).json({ error: 'deterministic review witness requires the exact current main runtime' });
        }

        const { production, signal } = await publishDeterministicReviewWitness({
          provider,
          projectId: FCR_REVIEW_PROJECT.slug,
          pullRequestNumber,
        });

        const currentMainAfter = await provider.resolveRef(FCR_REVIEW_PROJECT.slug, 'main');
        if (currentMainAfter.toLowerCase() !== runtimeSha.toLowerCase()) {
          throw new Error('Deterministic review witness main moved during publication; emitted signal is historical');
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          contract: 'fcr/deterministic-review-witness-trigger@v1',
          witnessPublished: true,
          proposalOnly: true,
          mergeAuthorized: false,
          executionAuthorized: false,
          receipt: production.receipt,
          pullRequestNumber: production.receipt.pullRequestNumber,
          baseSha: production.receipt.baseSha,
          headSha: production.receipt.headSha,
          reviewHash: production.receipt.reviewHash,
          verdict: production.receipt.verdict,
          findingCount: production.receipt.findings.length,
          signal: {
            name: signal.name,
            status: signal.status,
            commitSha: signal.commitSha,
            evidenceFingerprint: signal.evidenceFingerprint ?? null,
            issuer: signal.issuer ?? null,
          },
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.use('/', onboardingRouter);
  app.use('/auth', authRouter);
  app.use('/onboarding', founderOnboardingRouter);
  app.use('/portfolio', portfolioVerificationRouter);
  app.use('/switchboard', switchboardRouter);
  app.use('/security-posture', securityPostureRouter);
  app.use('/projects', repositoryVerificationRouter);
  app.use('/projects', buildEventsRouter);
  app.use('/projects', reasoningRunsRouter);
  app.use('/projects', requireProjectReadAudit, projectsRouter);
  // Privileged mission execution still uses the existing approvals router, but
  // it must now pass founder authentication + founder master switch + V10
  // plan/registry/exact-head binding + portable Chief/PromptOS/founder
  // decision binding before the route may reserve an approval_executions row.
  app.post(
    '/approvals/:missionId/execute',
    requireFounder,
    requirePortfolioSwitchOn('fcr-privileged-execution-master'),
    requireV10PrivilegedApprovalBinding,
    requireV10DecisionFounderBinding,
  );
  app.use('/approvals', approvalsRouter);
  app.use('/l99', l99Router);
  app.use('/terminal', terminalRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/futureyou', futureYouRouter);
  app.use('/goalfix', goalfixRouter);
  app.use('/founder-os', founderOsSkillsRouter);
  app.use('/mirror', mirrorRouter);
  app.use('/missions', missionsRouter);
  app.use('/promptos', promptosRouter);
  app.use('/agents', agentsRouter);
  app.use('/capabilities', capabilitiesRouter);
  app.use('/authority-levels', authorityLevelsRouter);
  app.use('/plugin-center', pluginCenterRouter);
  app.use('/command-bridge', commandBridgeRouter);
  app.use('/automation/conveyor', n8nConveyorRouter);
  app.use('/quickscan', quickScanRouter);
  app.use('/design-os', designOsRouter);
  app.use('/cloudflare', cloudflareReasoningRouter);
  app.use('/mcp', mcpRouter);
  app.use('/external-use', externalUseRouter);
  app.use('/economic-intelligence', economicIntelligenceRouter);

  // Debug routes — CI and founder inspection only (no secrets exposed).
  app.use('/_debug', debugRouter);

  app.use(jsonParseErrorHandler);
  app.use(errorHandler);

  return app;
}
