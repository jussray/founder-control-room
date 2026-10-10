/**
 * AI Inbox observation-only classification.
 * This module does not connect to Gmail, dispatch messages, or mutate mailbox state.
 * Provider ingestion must authenticate the account and event before calling it.
 */
export type AiInboxLane = 'money_security' | 'human_action' | 'ci_unverified' | 'agent_report' | 'project_updates' | 'review';
export type AiInboxEvidence = 'message_only' | 'provider_reconciled';
export interface AiInboxMessage {
  accountId: string;
  providerMessageId: string;
  subject: string;
  from?: string;
  projectId?: string;
  receivedAt: string;
}
export interface AiInboxDecision {
  key: string;
  accountId: string;
  providerMessageId: string;
  lane: AiInboxLane;
  projectId: string | null;
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
  let lane: AiInboxLane = 'review';
  let reason = 'Unclassified inbound message; human review required';
  if (/payment (failed|declined)|billing (failed|problem)|invoice overdue|subscription (expir|deactiv)|security alert|unauthorized sign.in|account compromised/.test(subject)) {
    lane = 'money_security';
    reason = 'Financial or security risk signaled by message, not independently verified';
  } else if (/delivery (failed|status notification)|undeliverable|action required|approval requested/.test(subject)) {
    lane = 'human_action';
    reason = 'Potential action requested';
  } else if (/run failed|workflow failed|build failed|pr run failed/.test(subject)) {
    lane = 'ci_unverified';
    reason = 'CI notification only; provider reconciliation required before declaring current failure';
  } else if (/task update|portfolio proof|agent report|daily brief/.test(subject)) {
    lane = 'agent_report';
    reason = 'Agent or portfolio informational report';
  } else if (/github.com|notifications@github.com/.test(from) || /\[jussray\//.test(subject)) {
    lane = 'project_updates';
    reason = 'Project notification';
  }
  return {
    key: `gmail:${message.accountId}:${message.providerMessageId}`,
    accountId: message.accountId,
    providerMessageId: message.providerMessageId,
    lane,
    projectId: message.projectId?.trim() || null,
    evidence: 'message_only',
    requiresHumanReview: lane === 'money_security' || lane === 'human_action' || lane === 'ci_unverified' || lane === 'review',
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
