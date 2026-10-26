/** Case continuity is evidence, never authority. No background polling. */
export const CASE_CONTINUITY_CONTRACT = 'juss/federated-relay-continuity@v3' as const;
export type CaseState = 'open' | 'at_rest' | 'closed';
export interface CaseCheckpoint {
  caseId: string;
  member: string;
  revision: number;
  state: CaseState;
  cursor: number;
  summary: string;
  nextGate: string | null;
  proofCookie: string | null;
}
export interface AcceptedCaseMessage {
  caseId: string;
  targetMember: string;
  position: number;
  messageId: string;
  fingerprint: string;
  proofCookie: string;
  receipt: { executionAuthorized: false; authorityTransferred: false; approvalCarriedForward: false };
}
export interface CaseStore {
  read(caseId: string, member: string): Promise<CaseCheckpoint | null>;
  acceptedAfter(caseId: string, member: string, cursor: number, limit: number): Promise<AcceptedCaseMessage[]>;
  compareAndSet(previous: CaseCheckpoint, next: CaseCheckpoint): Promise<boolean>;
}
export async function restoreCase(store: CaseStore, caseId: string, member: string) {
  if (!caseId || !member) throw new Error('case_scope_missing');
  const checkpoint = await store.read(caseId, member);
  if (!checkpoint || checkpoint.caseId !== caseId || checkpoint.member !== member) throw new Error('case_scope_denied');
  if (checkpoint.state === 'closed') return { checkpoint, messages: [], closed: true };
  const messages = await store.acceptedAfter(caseId, member, checkpoint.cursor, 33);
  if (messages.length > 32) throw new Error('case_backlog_requires_pagination');
  let position = checkpoint.cursor;
  for (const message of messages) {
    if (message.caseId !== caseId || message.targetMember !== member ||
        !Number.isSafeInteger(message.position) || message.position <= position ||
        !/^[a-f0-9]{64}$/i.test(message.fingerprint) ||
        !message.receipt || message.receipt.executionAuthorized !== false ||
        message.receipt.authorityTransferred !== false ||
        message.receipt.approvalCarriedForward !== false) throw new Error('case_message_unverified');
    position = message.position;
  }
  return { checkpoint, messages, closed: false };
}
export async function settleCase(
  store: CaseStore,
  restored: Awaited<ReturnType<typeof restoreCase>>,
  answer: { summary: string; nextGate: string | null; close?: boolean; evidenceReconciled: boolean },
) {
  if (restored.closed || restored.checkpoint.state === 'closed') throw new Error('case_closed');
  if (!answer.evidenceReconciled) throw new Error('case_evidence_unreconciled');
  if (!answer.summary.trim() || answer.summary.length > 8000) throw new Error('case_summary_invalid');
  const last = restored.messages.at(-1);
  const next: CaseCheckpoint = {
    ...restored.checkpoint,
    revision: restored.checkpoint.revision + 1,
    cursor: last?.position ?? restored.checkpoint.cursor,
    proofCookie: last?.proofCookie ?? restored.checkpoint.proofCookie,
    summary: answer.summary,
    nextGate: answer.close ? null : answer.nextGate,
    state: answer.close ? 'closed' : 'at_rest',
  };
  if (!(await store.compareAndSet(restored.checkpoint, next))) throw new Error('case_concurrent_update');
  return next;
}
