/**
 * AI Inbox observation-only classification.
 * This module does not connect to Gmail, dispatch messages, or mutate mailbox state.
 * Provider ingestion must authenticate the account and event before calling it.
 */
export type AiInboxLane = 'money_security' | 'human_action' | 'ci_unverified' | 'agent_report' | 'project_updates' | 'reply_candidate' | 'suppression_review' | 'automated_notice' | 'review';
export type AiInboxEvidence = 'message_only' | 'provider_reconciled';
export interface AiInboxMessage {
  accountId: string;
  providerMessageId: string;
  subject: string;
  from?: string;
  projectId?: string;
  projectSlug?: string;
  replySignal?: boolean;
  automated?: boolean;
  receivedAt: string;
}
export interface AiInboxDecision {
  key: string;
  accountId: string;
  providerMessageId: string;
  lane: AiInboxLane;
  projectId: string | null;
  projectSlug: string | null;
  evidence: AiInboxEvidence;
  requiresHumanReview: boolean;
  reason: string;
}
const MAX_ID = 256;
function validId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_ID && /^[a-zA-Z0-9._@-]+$/.test(value);
}
export function classifyAiInboxMessage(message: AiInboxMessage): AiInboxDecision {
  if (!validId(message.accountId) || !validId(message.providerMessageId)) {
    throw new Error('AI_INBOX_INVALID_PROVIDER_IDENTITY');
  }
  if (!Number.isFinite(Date.parse(message.receivedAt))) {
    throw new Error('AI_INBOX_INVALID_RECEIVED_AT');
  }
  const subject = message.subject.toLowerCase().slice(0, 2048);
  const from = (message.from ?? '').toLowerCase().slice(0, 512);
  // Header identity is a routing hint only; the GitHub API must reconcile it.
  const sender = (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from).trim();
  const githubNotice = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@github\.com$/.test(sender);
  const githubRun = githubNotice && /\b(?:pr )?run (?:failed|cancelled|canceled|skipped|succeeded|timed out|action required)\s*:/.test(subject);
  const githubPr = githubNotice && /\[[a-z0-9_.-]+\/[a-z0-9_.-]+\].*\(pr #\d+\)/.test(subject);
  let lane: AiInboxLane = 'review';
  let reason = 'Unclassified inbound message; human review required';
  if (/unsubscribe|remove me from (this|your) list|stop emailing/.test(subject)) {
    lane = 'suppression_review';
    reason = 'Possible opt-out; do not dispatch until suppression is reviewed';
  } else if (/payment (failed|declined)|billing (failed|problem)|problem billing|invoice overdue|subscription (expir|deactiv)|security alert|security insight|domains without hsts|unauthorized sign.in|account compromised|\b(?:is|has been)\s+(?:frozen|suspended)\b/.test(subject)) {
    lane = 'money_security';
    reason = 'Financial or security risk signaled by message, not independently verified';
  } else if (githubNotice && /third-party oauth application has been added|new sign.in|new ssh key|new personal access token/.test(subject)) {
    lane = 'money_security';
    reason = 'Account security notification; independently verify provider state';
  } else if (githubRun) {
    lane = 'ci_unverified';
    reason = 'GitHub run notification; reconcile exact current head and check status before closure';
  } else if (githubPr) {
    lane = 'project_updates';
    reason = 'GitHub pull request notification; reconcile current PR and review state';
  } else if (/delivery (failed|status notification)|undeliverable|action required|approval requested/.test(subject)) {
    lane = 'human_action';
    reason = 'Potential action requested';
  } else if (/run failed|workflow failed|build failed|pr run failed/.test(subject)) {
    lane = 'ci_unverified';
    reason = 'CI notification only; provider reconciliation required before declaring current failure';
  } else if (message.automated === true) {
    lane = 'automated_notice';
    reason = 'Provider metadata signals an automated response; not a verified human reply';
  } else if (/task update|portfolio proof|agent report|daily brief/.test(subject)) {
    lane = 'agent_report';
    reason = 'Agent or portfolio informational report';
  } else if (/github.com|notifications@github.com/.test(from) || /\[jussray\//.test(subject)) {
    lane = 'project_updates';
    reason = 'Project notification';
  } else if (message.replySignal === true) {
    lane = 'reply_candidate';
    reason = 'Possible human response; verify sender and prior outreach before classifying substance';
  }
  return {
    key: `gmail:${message.accountId}:${message.providerMessageId}`,
    accountId: message.accountId,
    providerMessageId: message.providerMessageId,
    lane,
    projectId: message.projectId?.trim() || null,
    projectSlug: message.projectSlug?.trim() || null,
    evidence: 'message_only',
    requiresHumanReview: githubPr || lane === 'money_security' || lane === 'human_action' || lane === 'ci_unverified' || lane === 'review' || lane === 'reply_candidate' || lane === 'suppression_review',
    reason,
  };
}
/** Idempotent per account+provider message; never merge different accounts. */
export function deduplicateAiInboxMessages(messages: AiInboxMessage[]): AiInboxDecision[] {
  const seen = new Set<string>();
  const decisions: AiInboxDecision[] = [];
  for (const message of messages) {
    const decision = classifyAiInboxMessage(message);
    if (seen.has(decision.key)) continue;
    seen.add(decision.key);
    decisions.push(decision);
  }
  return decisions;
}
