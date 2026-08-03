import { Router } from 'express';
import type { FirstPartySocialPostInput } from '../../lib/firstPartySocialPublisher.js';
import {
  type FounderOsLabAction,
  type FounderOsLabApproval,
  type FounderOsLabCommandId,
  type FounderOsLabEvidence,
  type FounderOsLabProviderId,
  type FounderOsLabRequest,
} from '../../founder-os-lab/contracts.js';
import {
  FOUNDER_OS_LAB_ACTION_ROUTES,
  FOUNDER_OS_LAB_COMMANDS,
  FOUNDER_OS_LAB_PROVIDERS,
} from '../../founder-os-lab/registry.js';
import { runFounderOsSandbox } from '../../founder-os-lab/sandbox.js';
import { requireFounder } from '../middleware/requireFounder.js';

export const founderOsSkillsRouter = Router();
founderOsSkillsRouter.use(requireFounder);

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const ACTIONS = new Set<FounderOsLabAction>(
  Object.keys(FOUNDER_OS_LAB_ACTION_ROUTES) as FounderOsLabAction[],
);
const COMMANDS = new Set<FounderOsLabCommandId>(
  FOUNDER_OS_LAB_COMMANDS.map((command) => command.id),
);
const PROVIDERS = new Set<FounderOsLabProviderId>(
  FOUNDER_OS_LAB_PROVIDERS.map((provider) => provider.id),
);
const TOP_LEVEL_FIELDS = new Set([
  'goal',
  'action',
  'command',
  'provider',
  'approval',
  'evidence',
  'socialPost',
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

function parseApproval(value: unknown): FounderOsLabApproval | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !hasOnlyFields(value, new Set(['id', 'actions']))) return null;

  const id = boundedString(value.id, 300);
  if (!id || !Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > 20) {
    return null;
  }

  const actions: FounderOsLabAction[] = [];
  for (const action of value.actions) {
    if (typeof action !== 'string' || !ACTIONS.has(action as FounderOsLabAction)) return null;
    if (!actions.includes(action as FounderOsLabAction)) actions.push(action as FounderOsLabAction);
  }

  return { id, actions };
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
    if (!Array.isArray(value.proofUrls) || value.proofUrls.length > 20) return null;
    proofUrls = [];
    for (const item of value.proofUrls) {
      const candidate = boundedString(item, 2_000);
      if (!candidate) return null;
      let parsed: URL;
      try {
        parsed = new URL(candidate);
      } catch {
        return null;
      }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
      if (!proofUrls.includes(parsed.href)) proofUrls.push(parsed.href);
    }
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
  const socialPost = body.socialPost === undefined
    ? undefined
    : isRecord(body.socialPost)
      ? body.socialPost as unknown as FirstPartySocialPostInput
      : null;

  if (!goal || !action || command === null || provider === null || approval === null || evidence === null || socialPost === null) {
    return res.status(400).json({ error: 'Founder OS preview input is malformed or outside the checked-in registry.' });
  }

  const request: FounderOsLabRequest = {
    goal,
    action,
    ...(command ? { command } : {}),
    ...(provider ? { provider } : {}),
    ...(approval ? { approval } : {}),
    ...(evidence ? { evidence } : {}),
    ...(socialPost ? { socialPost } : {}),
  };

  const result = runFounderOsSandbox(request);
  res.set('Cache-Control', 'no-store');
  return res.status(result.status === 'blocked' ? 422 : 200).json(result);
});
