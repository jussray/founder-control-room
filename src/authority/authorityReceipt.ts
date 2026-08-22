export type AuthorityReceiptStatus =
  | "valid"
  | "expired"
  | "consumed"
  | "invalidated";

export type AuthorityReceipt = {
  id: string;
  schemaVersion: "v1";
  subject: {
    kind: "change" | "deployment" | "migration" | "agent_action";
    id: string;
  };
  issuer: {
    type: "human" | "agent" | "system";
    id: string;
  };
  action: {
    type: string;
    target: string;
    digest: string;
  };
  evidenceRefs: string[];
  issuedAt: string;
  expiresAt: string;
  status: AuthorityReceiptStatus;
};

export type AuthorityValidationFailure =
  | "expired"
  | "invalid_status"
  | "missing_evidence"
  | "invalid_digest";

export type AuthorityValidationResult =
  | { ok: true; receipt: AuthorityReceipt }
  | { ok: false; reason: AuthorityValidationFailure };

export function validateAuthorityReceipt(
  receipt: AuthorityReceipt,
  now = new Date(),
): AuthorityValidationResult {
  if (receipt.status !== "valid") {
    return { ok: false, reason: "invalid_status" };
  }

  if (new Date(receipt.expiresAt) <= now) {
    return { ok: false, reason: "expired" };
  }

  if (receipt.evidenceRefs.length === 0) {
    return { ok: false, reason: "missing_evidence" };
  }

  if (!receipt.action.digest) {
    return { ok: false, reason: "invalid_digest" };
  }

  return { ok: true, receipt };
}
