// src/http/routes/portableConsole.types.ts
//
// Decision / approval / receipt contracts for the Portable Founder Console.
// No new dependency — hand-rolled validation instead of zod, since zod isn't
// currently in package.json. Swap for zod later if you add it repo-wide.

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const RISK_BY_OPERATION: Record<string, RiskLevel> = {
  read_status: "LOW",
  inspect_evidence: "LOW",
  request_brief: "LOW",
  create_draft: "MEDIUM",
  schedule_review: "MEDIUM",
  add_crm_note: "MEDIUM",
  publish_linkedin_post: "HIGH",
  merge_pull_request: "HIGH",
  deploy: "HIGH",
  send_external_email: "HIGH",
  spend_money: "CRITICAL",
  modify_production_permissions: "CRITICAL",
  rotate_credentials: "CRITICAL",
  delete_data: "CRITICAL",
};

// Unknown operation fails closed as CRITICAL, not open as LOW — an operation
// this router has never seen should require the most scrutiny, not the least.
export function riskLevelFor(operation: string): RiskLevel {
  return RISK_BY_OPERATION[operation] ?? "CRITICAL";
}

export interface DecisionPackage {
  decisionId: string;
  briefId: string;
  action: "approve" | "reject" | "request_revision";
  scope: {
    operation: string;
    targetId: string;
    payloadHash: string; // "sha256:..."
  };
  conditions: string[];
  client: {
    provider: "chatgpt" | "claude" | "perplexity" | "codex" | "web";
    surface: string;
  };
  expiresAt: string; // ISO 8601
}

type ParseResult =
  | { ok: true; value: DecisionPackage }
  | { ok: false; error: string };

export function parseDecisionPackage(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be an object." };
  }
  const b = body as Record<string, unknown>;
  for (const key of ["decisionId", "briefId", "action", "scope", "conditions", "client", "expiresAt"]) {
    if (!(key in b)) return { ok: false, error: `Missing field: ${key}` };
  }
  if (!["approve", "reject", "request_revision"].includes(b.action as string)) {
    return { ok: false, error: `Invalid action: ${String(b.action)}` };
  }
  const scope = b.scope as Record<string, unknown> | undefined;
  if (!scope?.operation || !scope?.targetId || !scope?.payloadHash) {
    return { ok: false, error: "scope requires operation, targetId, payloadHash." };
  }
  if (typeof scope.payloadHash !== "string" || !scope.payloadHash.startsWith("sha256:")) {
    return { ok: false, error: "scope.payloadHash must be a sha256:... hash." };
  }
  if (Number.isNaN(Date.parse(b.expiresAt as string))) {
    return { ok: false, error: "expiresAt must be a valid ISO 8601 timestamp." };
  }
  return { ok: true, value: b as unknown as DecisionPackage };
}

// Binds an approval to one exact commit — any new commit on the branch
// invalidates it. oneTime enforced via `consumed`.
export interface ApprovalRecord {
  decisionId: string;
  repository: string;
  baseBranch: string;
  headBranch: string;
  approvedHeadSha: string;
  expectedBaseSha: string;
  expiresAt: string;
  consumed: boolean;
  createdAt: string;
}

export type ExecutionState =
  | "SUBMITTED"
  | "VALIDATED"
  | "APPROVED"
  | "EXECUTION_STARTED"
  | "EXECUTED"
  | "FAILED"
  | "EXPIRED";

export interface ReceiptRecord {
  receiptId: string;
  decisionId: string;
  status: "executed" | "failed";
  executor: string;
  externalId?: string;
  payloadHash: string;
  approvedBy: string;
  approvedThrough: string;
  executedAt: string;
}
