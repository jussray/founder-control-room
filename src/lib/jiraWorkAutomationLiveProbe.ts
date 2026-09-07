import {
  validateJiraWorkAutomationInput,
  type JiraWorkAutomationInput,
} from './jiraWorkAutomation.js';

export const JIRA_WORK_AUTOMATION_LIVE_PROBE_CONTRACT = 'founder-control-room/jira-work-automation-live-probe@v1' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{1,19}-[1-9][0-9]*$/;
const RECEIPT_ID = /^fcr-jira-receipt-v1:[0-9a-f]{64}$/i;
const MIN_INGRESS_TOKEN_LENGTH = 32;
const REQUIRED_INGRESS_PATH = '/ingest/jira-work-automation';

export interface JiraWorkAutomationLiveProbeOptions {
  expectedHeadSha: string;
  probeIssueKey: string;
  ingressUrl: string;
  ingressToken: string;
  approvalReference: string;
  observation: JiraWorkAutomationInput;
  fetchImpl?: typeof fetch;
}

export interface JiraWorkAutomationLiveProbeReceipt {
  contract: typeof JIRA_WORK_AUTOMATION_LIVE_PROBE_CONTRACT;
  verifiedDispatch: true;
  endToEndComplete: false;
  independentJiraReadbackRequired: true;
  expectedHeadSha: string;
  runtimeHeadSha: string;
  issueKey: string;
  receiptId: string;
  approvalReference: string;
  observedAt: string;
}

type ProbeResponse = {
  ok?: unknown;
  code?: unknown;
  receiptId?: unknown;
  runtimeHeadSha?: unknown;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSha(value: string): string {
  return value.trim().toLowerCase();
}

function validateIngressUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return 'probe ingress URL must use HTTPS';
    if (!url.hostname || url.username || url.password) return 'probe ingress URL must not contain embedded credentials';
    if (url.pathname !== REQUIRED_INGRESS_PATH || url.search || url.hash) {
      return `probe ingress URL must target exactly ${REQUIRED_INGRESS_PATH}`;
    }
    return null;
  } catch {
    return 'probe ingress URL must be a valid absolute URL';
  }
}

export function validateJiraWorkAutomationLiveProbeOptions(
  options: JiraWorkAutomationLiveProbeOptions,
): string[] {
  const reasons: string[] = [];
  const expectedHeadSha = normalizeSha(options.expectedHeadSha);
  const probeIssueKey = text(options.probeIssueKey);
  const approvalReference = text(options.approvalReference);

  if (!FULL_SHA.test(expectedHeadSha)) reasons.push('expectedHeadSha must be a full 40-character Git commit SHA');
  if (!ISSUE_KEY.test(probeIssueKey)) reasons.push('probeIssueKey must be a canonical Jira issue key');
  if (text(options.ingressToken).length < MIN_INGRESS_TOKEN_LENGTH) reasons.push('probe ingress token is missing or too short');
  if (!approvalReference) reasons.push('approvalReference is required');

  const ingressUrlReason = validateIngressUrl(options.ingressUrl);
  if (ingressUrlReason) reasons.push(ingressUrlReason);

  reasons.push(...validateJiraWorkAutomationInput(options.observation));

  if (text(options.observation.issueKey) !== probeIssueKey) {
    reasons.push('observation issueKey must equal the secret-pinned probe issue key');
  }
  if (text(options.observation.projectKey) !== probeIssueKey.split('-')[0]) {
    reasons.push('observation projectKey must match the secret-pinned probe issue project');
  }
  if (options.observation.event !== 'transitioned') {
    reasons.push('live probe supports only a fresh transitioned observation');
  }
  if (text(options.observation.toStatus).toLowerCase() !== 'in progress') {
    reasons.push('live probe requires the probe issue to be In Progress');
  }
  if (text(options.observation.assigneeAccountId)) {
    reasons.push('live probe requires the probe issue to be unassigned before dispatch');
  }

  return [...new Set(reasons)];
}

export async function runJiraWorkAutomationLiveProbe(
  options: JiraWorkAutomationLiveProbeOptions,
): Promise<JiraWorkAutomationLiveProbeReceipt> {
  const reasons = validateJiraWorkAutomationLiveProbeOptions(options);
  if (reasons.length > 0) {
    throw new Error(`JIRA_WORK_AUTOMATION_LIVE_PROBE_REJECTED: ${reasons.join('; ')}`);
  }

  const expectedHeadSha = normalizeSha(options.expectedHeadSha);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.ingressUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.ingressToken.trim()}`,
      'Content-Type': 'application/json',
      'X-FCR-Jira-Live-Probe': 'v1',
    },
    body: JSON.stringify(options.observation),
  });

  let body: ProbeResponse;
  try {
    body = await response.json() as ProbeResponse;
  } catch {
    throw new Error(`JIRA_WORK_AUTOMATION_LIVE_PROBE_PROVIDER_REJECTED: non-JSON response (${response.status})`);
  }

  if (response.status !== 202 || body.ok !== true || body.code !== 'DISPATCHED') {
    throw new Error(`JIRA_WORK_AUTOMATION_LIVE_PROBE_PROVIDER_REJECTED: ${response.status}/${text(body.code) || 'UNKNOWN'}`);
  }

  const receiptId = text(body.receiptId);
  if (!RECEIPT_ID.test(receiptId)) {
    throw new Error('JIRA_WORK_AUTOMATION_LIVE_PROBE_RECEIPT_MISMATCH: canonical Jira receipt missing');
  }

  const runtimeHeadSha = normalizeSha(text(body.runtimeHeadSha));
  if (!FULL_SHA.test(runtimeHeadSha) || runtimeHeadSha !== expectedHeadSha) {
    throw new Error('JIRA_WORK_AUTOMATION_LIVE_PROBE_RUNTIME_MISMATCH: provider runtime is not the exact requested main SHA');
  }

  return {
    contract: JIRA_WORK_AUTOMATION_LIVE_PROBE_CONTRACT,
    verifiedDispatch: true,
    endToEndComplete: false,
    independentJiraReadbackRequired: true,
    expectedHeadSha,
    runtimeHeadSha,
    issueKey: options.probeIssueKey.trim(),
    receiptId,
    approvalReference: options.approvalReference.trim(),
    observedAt: new Date(Date.parse(options.observation.observedAt)).toISOString(),
  };
}
