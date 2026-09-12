export const EXTERNAL_APPLICATION_SUBMISSION_CONTRACT = 'fcr/external-application-submission@v1' as const;

export type ExternalApplicationField = {
  id: string;
  required: boolean;
  value: unknown;
};

export type ExternalApplicationUpload = {
  id: string;
  required: boolean;
  artifactRef: string | null;
  sha256: string | null;
};

export type ExternalApplicationApproval = {
  receiptId: string;
  payloadSha256: string;
  artifactSha256: string[];
};

export type ExternalApplicationProviderReadiness = {
  browserReady: boolean;
  authenticated: boolean;
  executionReady: boolean;
  blocker?: string | null;
};

export type ExternalApplicationSubmissionBundle = {
  contract: typeof EXTERNAL_APPLICATION_SUBMISSION_CONTRACT;
  provider: string;
  applicationUrl: string;
  payloadSnapshotRef: string;
  payloadSha256: string;
  fields: ExternalApplicationField[];
  uploads: ExternalApplicationUpload[];
  approval: ExternalApplicationApproval;
  providerReadiness: ExternalApplicationProviderReadiness;
};

export type ExternalApplicationSubmissionValidation = {
  ready: boolean;
  blockers: string[];
};

export type ExternalApplicationConfirmationReceipt = {
  contract: typeof EXTERNAL_APPLICATION_SUBMISSION_CONTRACT;
  provider: string;
  payloadSha256: string;
  artifactSha256: string[];
  submittedAt: string;
  confirmationId?: string | null;
  confirmationText?: string | null;
  confirmationUrl?: string | null;
};

const SHA256 = /^sha256:[0-9a-f]{64}$/i;

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function normalizedHashes(values: readonly string[]): string[] {
  return [...values].map((value) => value.toLowerCase()).sort();
}

export function validateExternalApplicationSubmission(
  bundle: ExternalApplicationSubmissionBundle,
): ExternalApplicationSubmissionValidation {
  const blockers: string[] = [];

  if (bundle.contract !== EXTERNAL_APPLICATION_SUBMISSION_CONTRACT) blockers.push('invalid_contract');
  if (!bundle.provider.trim()) blockers.push('missing_provider');
  if (!bundle.applicationUrl.trim()) blockers.push('missing_application_url');
  if (!bundle.payloadSnapshotRef.trim()) blockers.push('missing_payload_snapshot');
  if (!SHA256.test(bundle.payloadSha256)) blockers.push('invalid_payload_hash');
  if (!bundle.approval.receiptId.trim()) blockers.push('missing_approval_receipt');
  if (bundle.approval.payloadSha256.toLowerCase() !== bundle.payloadSha256.toLowerCase()) {
    blockers.push('approval_payload_mismatch');
  }

  for (const field of bundle.fields) {
    if (field.required && !hasValue(field.value)) blockers.push(`missing_required_field:${field.id}`);
  }

  const uploadedHashes: string[] = [];
  for (const upload of bundle.uploads) {
    if (upload.required && (!upload.artifactRef?.trim() || !upload.sha256 || !SHA256.test(upload.sha256))) {
      blockers.push(`missing_required_upload:${upload.id}`);
      continue;
    }
    if (upload.sha256 && SHA256.test(upload.sha256)) uploadedHashes.push(upload.sha256);
  }

  const approvedArtifacts = normalizedHashes(bundle.approval.artifactSha256);
  const currentArtifacts = normalizedHashes(uploadedHashes);
  if (approvedArtifacts.length !== currentArtifacts.length
    || approvedArtifacts.some((hash, index) => hash !== currentArtifacts[index]?.toLowerCase())) {
    blockers.push('approval_artifact_mismatch');
  }

  if (!bundle.providerReadiness.browserReady) blockers.push('provider_browser_unavailable');
  if (!bundle.providerReadiness.authenticated) blockers.push('provider_not_authenticated');
  if (!bundle.providerReadiness.executionReady) {
    blockers.push(bundle.providerReadiness.blocker?.trim() || 'provider_execution_not_ready');
  }

  return { ready: blockers.length === 0, blockers };
}

export function validateExternalApplicationConfirmation(
  receipt: ExternalApplicationConfirmationReceipt,
  approvedBundle: ExternalApplicationSubmissionBundle,
): ExternalApplicationSubmissionValidation {
  const blockers: string[] = [];

  if (receipt.contract !== EXTERNAL_APPLICATION_SUBMISSION_CONTRACT) blockers.push('invalid_receipt_contract');
  if (receipt.provider !== approvedBundle.provider) blockers.push('receipt_provider_mismatch');
  if (receipt.payloadSha256.toLowerCase() !== approvedBundle.payloadSha256.toLowerCase()) {
    blockers.push('receipt_payload_mismatch');
  }

  const approvedArtifacts = normalizedHashes(approvedBundle.approval.artifactSha256);
  const receiptArtifacts = normalizedHashes(receipt.artifactSha256);
  if (approvedArtifacts.length !== receiptArtifacts.length
    || approvedArtifacts.some((hash, index) => hash !== receiptArtifacts[index]?.toLowerCase())) {
    blockers.push('receipt_artifact_mismatch');
  }

  if (!receipt.submittedAt.trim() || Number.isNaN(Date.parse(receipt.submittedAt))) blockers.push('invalid_submitted_at');
  if (!hasValue(receipt.confirmationId) && !hasValue(receipt.confirmationText) && !hasValue(receipt.confirmationUrl)) {
    blockers.push('missing_confirmation_evidence');
  }

  return { ready: blockers.length === 0, blockers };
}
