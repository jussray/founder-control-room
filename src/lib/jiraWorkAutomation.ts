import { createHash } from 'node:crypto';

export const JIRA_WORK_AUTOMATION_CONTRACT = 'founder-control-room/jira-work-automation@v1' as const;
export const JIRA_WORK_AUTOMATION_OWNER = 'sekretbip' as const;

export type JiraWorkAutomationEvent = 'transitioned' | 'scheduled-scan';

export interface JiraWorkAutomationInput {
  event: JiraWorkAutomationEvent;
  projectKey: string;
  issueKey: string;
  fromStatus?: string | null;
  toStatus: string;
  assigneeAccountId?: string | null;
  updatedAt: string;
  observedAt: string;
}

export interface JiraWorkAutomationConfig {
  enabled: boolean;
  configured: boolean;
  webhookUrl: string | null;
  bearerToken: string | null;
  ownerAccountId: string | null;
  ownerLabel: typeof JIRA_WORK_AUTOMATION_OWNER;
  staleAfterHours: number | null;
  staleGuardConfigured: boolean;
  runtimeHeadSha: string | null;
}

export type JiraWorkAutomationAction =
  | {
      type: 'assign-owner';
      ownerLabel: typeof JIRA_WORK_AUTOMATION_OWNER;
      ownerAccountId: string;
    }
  | {
      type: 'comment-stale';
      staleAfterHours: number;
      message: string;
    };

export interface JiraWorkAutomationPlan {
  contract: typeof JIRA_WORK_AUTOMATION_CONTRACT;
  idempotencyKey: string;
  runtimeHeadSha: string;
  issue: {
    projectKey: string;
    issueKey: string;
    event: JiraWorkAutomationEvent;
    fromStatus: string | null;
    toStatus: string;
    assigneeAccountId: string | null;
    updatedAt: string;
    observedAt: string;
  };
  actions: JiraWorkAutomationAction[];
  authority: {
    assignIssue: boolean;
    commentIssue: boolean;
    transitionIssue: false;
    closeIssue: false;
    deleteIssue: false;
    mutateProjectSettings: false;
  };
}

export interface JiraWorkAutomationDispatchResult {
  ok: boolean;
  code: 'NO_ACTION' | 'AUTOMATION_DISABLED' | 'AUTOMATION_NOT_CONFIGURED' | 'DISPATCHED' | 'PROVIDER_REJECTED';
  status: number;
  receiptId: string | null;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,19}$/;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{1,19}-[1-9][0-9]*$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(text(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizedStatus(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedAccountId(value: string | null | undefined): string | null {
  const normalized = text(value);
  return normalized || null;
}

export function readJiraWorkAutomationConfig(env: NodeJS.ProcessEnv = process.env): JiraWorkAutomationConfig {
  const enabled = text(env.N8N_JIRA_AUTOMATION_ENABLED).toLowerCase() === 'true';
  const webhookCandidate = text(env.N8N_JIRA_AUTOMATION_WEBHOOK_URL);
  const bearerToken = text(env.N8N_JIRA_AUTOMATION_BEARER_TOKEN) || null;
  const ownerAccountId = text(env.JIRA_AUTOMATION_OWNER_ACCOUNT_ID) || null;
  const runtimeHeadCandidate = text(env.GIT_SHA).toLowerCase();
  const runtimeHeadSha = FULL_SHA.test(runtimeHeadCandidate) ? runtimeHeadCandidate : null;
  const staleAfterHours = positiveInteger(env.JIRA_AUTOMATION_STALE_AFTER_HOURS);
  const webhookUrl = validWebhookUrl(webhookCandidate) ? webhookCandidate : null;
  const configured = Boolean(webhookUrl && bearerToken && ownerAccountId && runtimeHeadSha);

  return {
    enabled,
    configured,
    webhookUrl,
    bearerToken,
    ownerAccountId,
    ownerLabel: JIRA_WORK_AUTOMATION_OWNER,
    staleAfterHours,
    staleGuardConfigured: staleAfterHours !== null,
    runtimeHeadSha,
  };
}

export function validateJiraWorkAutomationInput(input: JiraWorkAutomationInput): string[] {
  const reasons: string[] = [];
  if (!input || typeof input !== 'object') return ['jira automation input must be an object'];
  if (input.event !== 'transitioned' && input.event !== 'scheduled-scan') reasons.push('unsupported jira automation event');
  if (!PROJECT_KEY.test(text(input.projectKey))) reasons.push('projectKey must be a canonical Jira project key');
  if (!ISSUE_KEY.test(text(input.issueKey))) reasons.push('issueKey must be a canonical Jira issue key');
  if (text(input.issueKey).split('-')[0] !== text(input.projectKey)) reasons.push('issueKey must belong to projectKey');
  if (!text(input.toStatus)) reasons.push('toStatus is required');

  const updatedAtMs = Date.parse(text(input.updatedAt));
  const observedAtMs = Date.parse(text(input.observedAt));
  if (!Number.isFinite(updatedAtMs)) reasons.push('updatedAt must be an ISO-compatible timestamp');
  if (!Number.isFinite(observedAtMs)) reasons.push('observedAt must be an ISO-compatible timestamp');
  if (Number.isFinite(updatedAtMs) && Number.isFinite(observedAtMs) && updatedAtMs > observedAtMs) {
    reasons.push('updatedAt cannot be later than observedAt');
  }

  return [...new Set(reasons)];
}

export function jiraWorkAutomationPlanId(plan: Omit<JiraWorkAutomationPlan, 'idempotencyKey'>): string {
  return `fcr-jira-v1:${hash(plan)}`;
}

export function buildJiraWorkAutomationPlan(
  input: JiraWorkAutomationInput,
  config: JiraWorkAutomationConfig = readJiraWorkAutomationConfig(),
): JiraWorkAutomationPlan {
  const reasons = validateJiraWorkAutomationInput(input);
  if (reasons.length > 0) throw new Error(`JIRA_WORK_AUTOMATION_INPUT_REJECTED: ${reasons.join('; ')}`);
  if (!config.runtimeHeadSha || !FULL_SHA.test(config.runtimeHeadSha)) {
    throw new Error('JIRA_WORK_AUTOMATION_RUNTIME_HEAD_REQUIRED: exact FCR runtime SHA is required');
  }
  if (!config.ownerAccountId) {
    throw new Error('JIRA_WORK_AUTOMATION_OWNER_MAPPING_REQUIRED: sekretbip must resolve to an exact Jira account id');
  }

  const actions: JiraWorkAutomationAction[] = [];
  const inProgress = normalizedStatus(input.toStatus) === 'in progress';
  const currentAssignee = normalizedAccountId(input.assigneeAccountId);

  if (inProgress && !currentAssignee) {
    actions.push({
      type: 'assign-owner',
      ownerLabel: JIRA_WORK_AUTOMATION_OWNER,
      ownerAccountId: config.ownerAccountId,
    });
  }

  // One observation may authorize at most one mutation. If a stale scheduled
  // item is unassigned, ownership is repaired first. Assignment itself changes
  // Jira's updated timestamp, so stale-comment eligibility must be re-observed
  // on a later scan instead of being inherited from the pre-assignment snapshot.
  if (input.event === 'scheduled-scan' && inProgress && currentAssignee && config.staleAfterHours !== null) {
    const updatedAtMs = Date.parse(input.updatedAt);
    const observedAtMs = Date.parse(input.observedAt);
    const ageHours = (observedAtMs - updatedAtMs) / (60 * 60 * 1000);
    if (ageHours >= config.staleAfterHours) {
      actions.push({
        type: 'comment-stale',
        staleAfterHours: config.staleAfterHours,
        message: `FCR stale-work guard: this item has remained In Progress without an update for at least ${config.staleAfterHours} hours. Add a current status update or move it to the correct workflow state.`,
      });
    }
  }

  const withoutIdentity: Omit<JiraWorkAutomationPlan, 'idempotencyKey'> = {
    contract: JIRA_WORK_AUTOMATION_CONTRACT,
    runtimeHeadSha: config.runtimeHeadSha,
    issue: {
      projectKey: input.projectKey,
      issueKey: input.issueKey,
      event: input.event,
      fromStatus: text(input.fromStatus) || null,
      toStatus: input.toStatus.trim(),
      assigneeAccountId: currentAssignee,
      updatedAt: new Date(Date.parse(input.updatedAt)).toISOString(),
      observedAt: new Date(Date.parse(input.observedAt)).toISOString(),
    },
    actions,
    authority: {
      assignIssue: actions.some((action) => action.type === 'assign-owner'),
      commentIssue: actions.some((action) => action.type === 'comment-stale'),
      transitionIssue: false,
      closeIssue: false,
      deleteIssue: false,
      mutateProjectSettings: false,
    },
  };

  return {
    ...withoutIdentity,
    idempotencyKey: jiraWorkAutomationPlanId(withoutIdentity),
  };
}

export function expectedJiraWorkAutomationReceiptId(plan: JiraWorkAutomationPlan): string {
  return `fcr-jira-receipt-v1:${hash({
    contract: plan.contract,
    idempotencyKey: plan.idempotencyKey,
    runtimeHeadSha: plan.runtimeHeadSha,
    issueKey: plan.issue.issueKey,
    actions: plan.actions,
  })}`;
}

export async function dispatchJiraWorkAutomation(
  input: JiraWorkAutomationInput,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<JiraWorkAutomationDispatchResult> {
  const env = options.env ?? process.env;
  const config = readJiraWorkAutomationConfig(env);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!config.enabled) {
    return { ok: false, code: 'AUTOMATION_DISABLED', status: 409, receiptId: null };
  }
  if (!config.configured) {
    return { ok: false, code: 'AUTOMATION_NOT_CONFIGURED', status: 503, receiptId: null };
  }

  const plan = buildJiraWorkAutomationPlan(input, config);
  if (plan.actions.length === 0) {
    return { ok: true, code: 'NO_ACTION', status: 200, receiptId: null };
  }

  const expectedReceiptId = expectedJiraWorkAutomationReceiptId(plan);
  try {
    const response = await fetchImpl(config.webhookUrl as string, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.bearerToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': plan.idempotencyKey,
        'X-FCR-Jira-Automation-Contract': 'v1',
      },
      body: JSON.stringify(plan),
    });

    if (!response.ok) {
      return { ok: false, code: 'PROVIDER_REJECTED', status: response.status, receiptId: null };
    }

    const body = await response.json() as { receiptId?: unknown };
    if (body.receiptId !== expectedReceiptId) {
      return { ok: false, code: 'PROVIDER_REJECTED', status: 502, receiptId: null };
    }

    return { ok: true, code: 'DISPATCHED', status: 202, receiptId: expectedReceiptId };
  } catch {
    return { ok: false, code: 'PROVIDER_REJECTED', status: 502, receiptId: null };
  }
}
