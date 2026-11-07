import type { ApprovalBinding } from '../approvals/approval.js';
import type { ClaimStatus } from '../truth/truth.js';

export type IntakeState =
  | 'received'
  | 'redacted'
  | 'persisted_or_ephemeral'
  | 'processing'
  | 'completed'
  | 'blocked'
  | 'failed';

export type ChiefAIRunState =
  | 'created'
  | 'context_ready'
  | 'generated'
  | 'validated'
  | 'proposed'
  | 'completed'
  | 'degraded'
  | 'failed';

export type TinyMoveState =
  | 'proposed'
  | 'started'
  | 'completed'
  | 'dismissed'
  | 'expired';

export type ClaimState = ClaimStatus;
export type ApprovalState = ApprovalBinding['status'];
