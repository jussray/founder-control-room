export const CODEX_SECURITY_PROGRAMS = [
  'codex-security',
  'daybreak-blue',
  'daybreak-red',
] as const;

export type CodexSecurityProgram = (typeof CODEX_SECURITY_PROGRAMS)[number];

export const CODEX_SECURITY_TERMINAL_STATES = [
  'passed',
  'findings',
  'failed',
  'cancelled',
] as const;

export type CodexSecurityTerminalState = (typeof CODEX_SECURITY_TERMINAL_STATES)[number];

export type CodexSecurityEvidenceSource = 'github-actions-artifact' | 'provider-readback';

export interface CodexSecurityEvidenceSubject {
  repository: string;
  headSha: string;
  scopeFingerprint: string;
}

export interface CodexSecurityExternalWriteEvidence {
  requested: boolean;
  performed: boolean;
  approvalRef?: string | null;
}

export interface CodexSecurityAuthorizedTestEvidence {
  approved: boolean;
  approvalRef: string;
  scopeRef: string;
}

export interface CodexSecurityFindingSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

export interface CodexSecurityScanReceiptV1 {
  schema: 'juss/codex-security-scan@v1';
  program: CodexSecurityProgram;
  scanId: string;
  subject: CodexSecurityEvidenceSubject;
  evidenceSource: CodexSecurityEvidenceSource;
  artifactDigest: string;
  startedAt: string;
  completedAt: string;
  observedAt: string;
  terminalState: CodexSecurityTerminalState;
  externalWrite: CodexSecurityExternalWriteEvidence;
  authorizedTest?: CodexSecurityAuthorizedTestEvidence | null;
  findings: CodexSecurityFindingSummary;
}

export interface CodexSecurityExpectedSubject {
  repository: string;
  headSha: string;
  scopeFingerprint: string;
}

export type CodexSecurityEvidenceClassification = 'VERIFIED' | 'BLOCKED' | 'UNKNOWN';
export type CodexSecurityCandidateDisposition = 'CONTINUE' | 'HOLD' | 'REPAIR';
export type CodexSecurityProofLevel = 'exact-head' | 'provider-observation';

export interface CodexSecurityNormalizedEvidence {
  classification: CodexSecurityEvidenceClassification;
  disposition: CodexSecurityCandidateDisposition;
  proofLevel: CodexSecurityProofLevel;
  program: CodexSecurityProgram;
  scanId: string;
  subject: CodexSecurityEvidenceSubject;
  terminalState: CodexSecurityTerminalState;
  evidenceSource: CodexSecurityEvidenceSource;
  artifactDigest: string;
  findings: CodexSecurityFindingSummary;
  reasons: string[];
  authority: {
    executionAuthorized: false;
    mergeAuthorized: false;
    deployAuthorized: false;
    providerMutationAuthorized: false;
    externalWriteAuthorizedByReceipt: false;
  };
}

const SHA_40 = /^[a-f0-9]{40}$/i;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/i;
const NONEMPTY_TOKEN = /^\S(?:.*\S)?$/;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && NONEMPTY_TOKEN.test(value);
}

function validDate(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function nonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function findingsAreValid(findings: CodexSecurityFindingSummary): boolean {
  return [
    findings.critical,
    findings.high,
    findings.medium,
    findings.low,
    findings.informational,
  ].every(nonNegativeInteger);
}

function proofLevelFor(source: CodexSecurityEvidenceSource): CodexSecurityProofLevel {
  return source === 'provider-readback' ? 'provider-observation' : 'exact-head';
}

function baseEvidence(
  receipt: CodexSecurityScanReceiptV1,
  classification: CodexSecurityEvidenceClassification,
  disposition: CodexSecurityCandidateDisposition,
  reasons: string[],
): CodexSecurityNormalizedEvidence {
  return {
    classification,
    disposition,
    proofLevel: proofLevelFor(receipt.evidenceSource),
    program: receipt.program,
    scanId: receipt.scanId,
    subject: receipt.subject,
    terminalState: receipt.terminalState,
    evidenceSource: receipt.evidenceSource,
    artifactDigest: receipt.artifactDigest,
    findings: receipt.findings,
    reasons,
    authority: {
      executionAuthorized: false,
      mergeAuthorized: false,
      deployAuthorized: false,
      providerMutationAuthorized: false,
      externalWriteAuthorizedByReceipt: false,
    },
  };
}

export function evaluateCodexSecurityScanReceipt(
  receipt: CodexSecurityScanReceiptV1,
  expected: CodexSecurityExpectedSubject,
): CodexSecurityNormalizedEvidence {
  const blockers: string[] = [];

  if (receipt.schema !== 'juss/codex-security-scan@v1') {
    blockers.push('receipt schema is not juss/codex-security-scan@v1');
  }

  if (!CODEX_SECURITY_PROGRAMS.includes(receipt.program)) {
    blockers.push('program is not an allowlisted OpenAI cyber deployment lane');
  }

  if (!hasText(receipt.scanId)) {
    blockers.push('scanId is missing');
  }

  if (!hasText(receipt.subject.repository) || receipt.subject.repository !== expected.repository) {
    blockers.push('repository does not match the expected proof subject');
  }

  if (!SHA_40.test(receipt.subject.headSha) || receipt.subject.headSha !== expected.headSha) {
    blockers.push('head SHA is malformed or does not match the expected exact head');
  }

  if (!hasText(receipt.subject.scopeFingerprint)
      || receipt.subject.scopeFingerprint !== expected.scopeFingerprint) {
    blockers.push('scope fingerprint does not match the expected bounded scope');
  }

  if (!SHA256_DIGEST.test(receipt.artifactDigest)) {
    blockers.push('artifact digest must be a sha256 digest');
  }

  if (!findingsAreValid(receipt.findings)) {
    blockers.push('finding counts must be non-negative integers');
  }

  const startedAt = validDate(receipt.startedAt);
  const completedAt = validDate(receipt.completedAt);
  const observedAt = validDate(receipt.observedAt);
  if (startedAt === null || completedAt === null || observedAt === null) {
    blockers.push('scan timestamps must be valid absolute timestamps');
  } else {
    if (completedAt < startedAt) blockers.push('completedAt precedes startedAt');
    if (observedAt < completedAt) blockers.push('observedAt precedes completedAt');
  }

  if (receipt.externalWrite.performed && !receipt.externalWrite.requested) {
    blockers.push('external write was performed without being declared as requested');
  }

  if (receipt.externalWrite.performed && !hasText(receipt.externalWrite.approvalRef)) {
    blockers.push('external write evidence lacks an explicit approval reference');
  }

  if (receipt.program === 'daybreak-red') {
    const authorization = receipt.authorizedTest;
    if (!authorization?.approved
        || !hasText(authorization.approvalRef)
        || !hasText(authorization.scopeRef)) {
      blockers.push('Daybreak Red evidence requires explicit authorized-test approval and scope references');
    }
  }

  if (blockers.length > 0) {
    return baseEvidence(receipt, 'BLOCKED', 'HOLD', blockers);
  }

  if (receipt.terminalState === 'cancelled') {
    return baseEvidence(
      receipt,
      'UNKNOWN',
      'HOLD',
      ['scan was cancelled; no terminal security conclusion may be promoted'],
    );
  }

  if (receipt.terminalState === 'failed') {
    return baseEvidence(
      receipt,
      'BLOCKED',
      'REPAIR',
      ['scan execution failed; failure evidence is valid but does not establish a security outcome'],
    );
  }

  if (receipt.terminalState === 'findings') {
    return baseEvidence(
      receipt,
      'VERIFIED',
      'HOLD',
      ['security findings are verified evidence; candidate promotion remains separately gated'],
    );
  }

  return baseEvidence(
    receipt,
    'VERIFIED',
    'CONTINUE',
    ['scan receipt is bound to the expected subject; no merge, deploy, execution, or provider authority is granted'],
  );
}
