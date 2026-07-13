/**
 * Proof Gate — public API
 *
 * Import from here rather than internal files.
 */

export type {
  ProofStatus,
  ProofEvidence,
  ProofGateResult,
  ApprovalGateId,
} from './types.js';
export {
  APPROVAL_GATES,
  isApprovalGate,
  requiresFounderApproval,
  runProofGate,
  formatProofGateFailure,
  assertProofPassed,
  ProofGateError,
} from './gate.js';
