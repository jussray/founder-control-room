/**
 * Proof Gate — public API
 *
 * Import from here, not from gate.js or types.js directly.
 */

export type { ProofStatus, ProofEvidence, ProofGateResult } from './types.js';
export {
  APPROVAL_GATES,
  requiresFounderApproval,
  runProofGate,
  assertProofPassed,
  ProofGateError,
} from './gate.js';
