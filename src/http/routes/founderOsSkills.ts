import { Router, raw } from 'express';
import type { FirstPartySocialPostInput } from '../../lib/firstPartySocialPublisher.js';
import {
  type FounderOsLabAction,
  type FounderOsLabApproval,
  type FounderOsLabCommandId,
  type FounderOsLabEvidence,
  type FounderOsLabProjectAdapterId,
  type FounderOsLabProjectAudience,
  type FounderOsLabProjectContext,
  type FounderOsLabProviderId,
  type FounderOsLabRequest,
} from '../../founder-os-lab/contracts.js';
import {
  isV10CapabilityPlan,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import { FOUNDER_OS_LAB_PROJECT_ADAPTERS } from '../../founder-os-lab/projectAdapters.js';
import {
  FOUNDER_OS_LAB_ACTION_ROUTES,
  FOUNDER_OS_LAB_COMMANDS,
  FOUNDER_OS_LAB_PROVIDERS,
} from '../../founder-os-lab/registry.js';
import { runFounderOsSandbox } from '../../founder-os-lab/sandbox.js';
import {
  UNTRUSTED_ARTIFACT_SOURCES,
  untrustedArtifactContentHash,
  type UntrustedArtifact,
  type UntrustedArtifactSource,
} from '../../security/untrustedArtifactBoundary.js';
import { runFounderProofAuditInternalDryRun } from '../../services/founderProofAuditDryRun.js';
import { requireFounder } from '../middleware/requireFounder.js';
import { requirePortfolioSwitchOn } from '../middleware/requirePortfolioSwitchOn.js';

export const founderOsSkillsRouter = Router();
founderOsSkillsRouter.use(requireFounder);

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const ACTIONS = new Set<FounderOsLabAction>(
  Object.keys(FOUNDER_OS_LAB_ACTION_ROUTES) as FounderOsLabAction[],
);
const COMMANDS = new Set<FounderOsLabCommandId>(
  FOUNDER_OS_LAB_COMMANDS.map((command) => command.id),
);
const PROVIDERS = new Set<FounderOsLabProviderId>(
  FOUNDER_OS_LAB_PROVIDERS.map((provider) => provider.id),
);
const PROJECTS = new Set<FounderOsLabProjectAdapterId>(
  FOUNDER_OS_LAB_PROJECT_ADAPTERS.map((project) => project.id),
);
const PROJECT_AUDIENCES = new Set<FounderOsLabProjectAudience>(['teen', 'bip-jr']);
const UNTRUSTED_SOURCES = new Set<string>(UNTRUSTED_ARTIFACT_SOURCES);
const TOP_LEVEL_FIELDS = new Set([
  'goal',
  'action',
  'command',
  'provider',
  'approval',
  'evidence',
  'project',
  'capabilityPlan',
  'socialPost',
  'untrustedArtifacts',
]);
const EVIDENCE_FIELDS = new Set([
  'repository',
  'commitSha',
  'proofUrls',
  'projectId',
  'providerAccountId',
  'automationId',
  'workspaceId',
  'recordIds',
  'associationPlan',
]);
const PROJECT_FIELDS = new Set([
  'id',
  'sourceRepository',
  'sourceCommitSha',
  'contractUrls',
  'audience',
]);
const APPROVAL_FIELDS = new Set([
  'id',
  'actions',
  'projectSlug',
  'expectedHeadSha',
  'capabilityPlanHash',
]);
const UNTRUSTED_ARTIFACT_FIELDS = new Set([
  'id',
  'source',
  'content',
  'contentHash',
  'uri',
  'authorId',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function boundedStringList(value: unknown, maximumItems: number, maximumLength: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumItems) return null;

  const result: string[] = [];
  for (const item of value) {
    const normalized = boundedString(item, maximumLength);
    if (!normalized) return null;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function boundedHttpsUrls(value: unknown, maximumItems: number): string[] | null {
  const values = boundedStringList(value, maximumItems, 2_000);
  if (!values) return null;

  const urls: string[] = [];
  for (const candidate of values) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (!urls.includes(parsed.href)) urls.push(parsed.href);
  }
  return urls;
}

function boundedHttpsUrl(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  const candidate = boundedString(value, 2_000);
  if (!candidate) return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  return parsed.href;
}

function parseApproval(value: unknown): FounderOsLabApproval | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !hasOnlyFields(value, APPROVAL_FIELDS)) return null;

  const id = boundedString(value.id, 300);
  if (!id || !Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > 20) {
    return null;
  }

  const actions: FounderOsLabAction[] = [];
  for (const action of value.actions) {
    if (typeof action !== 'string' || !ACTIONS.has(action as FounderOsLabAction)) return null;
    if (!actions.includes(action as FounderOsLabAction)) actions.push(action as FounderOsLabAction);
  }

  const projectSlug = value.projectSlug === undefined
    ? undefined
    : boundedString(value.projectSlug, 300) ?? null;
  const expectedHeadSha = value.expectedHeadSha === undefined
    ? undefined
    : boundedString(value.expectedHeadSha, 40)?.toLowerCase() ?? null;
  const capabilityPlanHash = value.capabilityPlanHash === undefined
    ? undefined
    : boundedString(value.capabilityPlanHash, 64)?.toLowerCase() ?? null;

  if (
    projectSlug === null
    || expectedHeadSha === null
    || capabilityPlanHash === null
    || (expectedHeadSha && !EXACT_COMMIT_SHA.test(expectedHeadSha))
    || (capabilityPlanHash && !SHA256.test(capabilityPlanHash))
  ) {
    return null;
  }

  return {
    id,
    actions,
    ...(projectSlug ? { projectSlug } : {}),
    ...(expectedHeadSha ? { expectedHeadSha } : {}),
    ...(capabilityPlanHash ? { capabilityPlanHash } : {}),
  };
}

function parseEvidence(value: unknown): FounderOsLabEvidence | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !hasOnlyFields(value, EVIDENCE_FIELDS)) return null;

  const repository = value.repository === undefined
    ? undefined
    : boundedString(value.repository, 300) ?? null;
  const commitSha = value.commitSha === undefined
    ? undefined
    : boundedString(value.commitSha, 40)?.toLowerCase() ?? null;
  const projectId = value.projectId === undefined
    ? undefined
    : boundedString(value.projectId, 300) ?? null;
  const providerAccountId = value.providerAccountId === undefined
    ? undefined
    : boundedString(value.providerAccountId, 300) ?? null;
  const automationId = value.automationId === undefined
    ? undefined
    : boundedString(value.automationId, 300) ?? null;
  const workspaceId = value.workspaceId === undefined
    ? undefined
    : boundedString(value.workspaceId, 300) ?? null;
  const associationPlan = value.associationPlan === undefined
    ? undefined
    : boundedString(value.associationPlan, 1_000) ?? null;
  const recordIds = value.recordIds === undefined
    ? undefined
    : boundedStringList(value.recordIds, 20, 300);

  if (
    repository === null
    || commitSha === null
    || projectId === null
    || providerAccountId === null
    || automationId === null
    || workspaceId === null
    || associationPlan === null
    || recordIds === null
    || (commitSha && !EXACT_COMMIT_SHA.test(commitSha))
  ) {
    return null;
  }

  let proofUrls: string[] | undefined;
  if (value.proofUrls !== undefined) {
    proofUrls = boundedHttpsUrls(value.proofUrls, 20) ?? undefined;
    if (!proofUrls) return null;
  }

  return {
    ...(repository ? { repository } : {}),
    ...(commitSha ? { commitSha } : {}),
    ...(proofUrls ? { proofUrls } : {}),
    ...(projectId ? { projectId } : {}),
    ...(providerAccountId ? { providerAccountId } : {}),
    ...(automationId ? { automationId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(recordIds ? { recordIds } : {}),
    ...(associationPlan ? { associationPlan } : {}),
  };
}

function parseProject(value: unknown): FounderOsLabProjectContext | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !hasOnlyFields(value, PROJECT_FIELDS)) return null;

  const id = typeof value.id === 'string' && PROJECTS.has(value.id as FounderOsLabProjectAdapterId)
    ? value.id as FounderOsLabProjectAdapterId
    : null;
  const sourceRepository = boundedString(value.sourceRepository, 300);
  const sourceCommitSha = boundedString(value.sourceCommitSha, 40)?.toLowerCase() ?? null;
  const contractUrls = boundedHttpsUrls(value.contractUrls, 20);
  const audience = value.audience === undefined
    ? undefined
    : typeof value.audience === 'string'
      && PROJECT_AUDIENCES.has(value.audience as FounderOsLabProjectAudience)
      ? value.audience as FounderOsLabProjectAudience
      : null;

  if (
    !id
    || !sourceRepository
    || !sourceCommitSha
    || !EXACT_COMMIT_SHA.test(sourceCommitSha)
    || !contractUrls
    || audience === null
  ) {
    return null;
  }

  return {
    id,
    sourceRepository,
    sourceCommitSha,
    contractUrls,
    ...(audience ? { audience } : {}),
  };
}

function parseCapabilityPlan(value: unknown): V10CapabilityPlan | undefined | null {
  if (value === undefined || value === null) return undefined;
  return isV10CapabilityPlan(value) ? value : null;
}

function parseUntrustedArtifacts(value: unknown): UntrustedArtifact[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;

  const artifacts: UntrustedArtifact[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyFields(item, UNTRUSTED_ARTIFACT_FIELDS)) return null;
    const id = boundedString(item.id, 160);
    const source = typeof item.source === 'string' && UNTRUSTED_SOURCES.has(item.source)
      ? item.source as UntrustedArtifactSource
      : null;
    const content = typeof item.content === 'string' && item.content.trim() && item.content.length <= 50_000
      ? item.content
      : null;
    const uri = boundedHttpsUrl(item.uri);
    const authorId = item.authorId === undefined
      ? undefined
      : boundedString(item.authorId, 300) ?? null;

    if (!id || !source || !content || uri === null || authorId === null || ids.has(id)) return null;
    ids.add(id);

    const contentHash = untrustedArtifactContentHash(content);
    if (item.contentHash !== undefined) {
      const submittedHash = boundedString(item.contentHash, 64)?.toLowerCase() ?? null;
      if (!submittedHash || !SHA256.test(submittedHash) || submittedHash !== contentHash) return null;
    }

    artifacts.push({
      id,
      source,
      content,
      contentHash,
      ...(uri ? { uri } : {}),
      ...(authorId ? { authorId } : {}),
    });
  }
  return artifacts;
}

function isTransportBodyEmpty(value: unknown): boolean {
  return value === undefined || (Buffer.isBuffer(value) && value.length === 0);
}

founderOsSkillsRouter.post(
  '/proof-audit/internal-dry-run',
  requirePortfolioSwitchOn('fcr-privileged-execution-master'),
  raw({ type: () => true, limit: '1kb' }),
  async (req, res, next) => {
    res.set('Cache-Control', 'no-store');

    if (!isTransportBodyEmpty(req.body)) {
      return res.status(400).json({
        error: 'Founder Proof Audit internal dry run accepts no request body.',
      });
    }

    const runtimeSha = process.env.GIT_SHA?.trim() ?? '';
    if (!EXACT_COMMIT_SHA.test(runtimeSha)) {
      return res.status(503).json({
        error: 'Founder Proof Audit internal dry run requires an exact deployed GIT_SHA.',
      });
    }

    try {
      const result = await runFounderProofAuditInternalDryRun(runtimeSha);
      const payload = {
        contract: result.dryRun.contract,
        runtimeSha: result.dryRun.runtimeSha,
        testCase: result.dryRun.testCase,
        sourceEventId: result.dryRun.sourceEventId,
        inputFingerprint: result.dryRun.inputFingerprint,
        receipt: result.dryRun.receipt,
        guarantees: result.dryRun.guarantees,
        persistence: result.persistence,
      };
      return res.status(result.persistence === 'conflict' ? 409 : 200).json(payload);
    } catch (error) {
      return next(error);
    }
  },
);

founderOsSkillsRouter.post('/preview', (req, res) => {
  const body = req.body as unknown;
  if (!isRecord(body) || !hasOnlyFields(body, TOP_LEVEL_FIELDS)) {
    return res.status(400).json({ error: 'Request must contain only supported Founder OS preview fields.' });
  }

  const goal = boundedString(body.goal, 2_000);
  const action = typeof body.action === 'string' && ACTIONS.has(body.action as FounderOsLabAction)
    ? body.action as FounderOsLabAction
    : null;
  const command = body.command === undefined
    ? undefined
    : typeof body.command === 'string' && COMMANDS.has(body.command as FounderOsLabCommandId)
      ? body.command as FounderOsLabCommandId
      : null;
  const provider = body.provider === undefined
    ? undefined
    : typeof body.provider === 'string' && PROVIDERS.has(body.provider as FounderOsLabProviderId)
      ? body.provider as FounderOsLabProviderId
      : null;
  const approval = parseApproval(body.approval);
  const evidence = parseEvidence(body.evidence);
  const project = parseProject(body.project);
  const capabilityPlan = parseCapabilityPlan(body.capabilityPlan);
  const socialPost = body.socialPost === undefined
    ? undefined
    : isRecord(body.socialPost)
      ? body.socialPost as unknown as FirstPartySocialPostInput
      : null;
  const untrustedArtifacts = parseUntrustedArtifacts(body.untrustedArtifacts);

  if (
    !goal
    || !action
    || command === null
    || provider === null
    || approval === null
    || evidence === null
    || project === null
    || capabilityPlan === null
    || socialPost === null
    || untrustedArtifacts === null
  ) {
    return res.status(400).json({ error: 'Founder OS preview input is malformed or outside the checked-in registry.' });
  }

  const request: FounderOsLabRequest = {
    goal,
    action,
    ...(command ? { command } : {}),
    ...(provider ? { provider } : {}),
    ...(approval ? { approval } : {}),
    ...(evidence ? { evidence } : {}),
    ...(project ? { project } : {}),
    ...(capabilityPlan ? { capabilityPlan } : {}),
    ...(socialPost ? { socialPost } : {}),
    ...(untrustedArtifacts ? { untrustedArtifacts } : {}),
  };

  const result = runFounderOsSandbox(request);
  res.set('Cache-Control', 'no-store');
  return res.status(result.status === 'simulated' ? 200 : 422).json(result);
});
