import { hash } from "node:crypto";
import type {
  Diff,
  RepositoryProvider,
  ReviewSignal,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";

export const INDEPENDENT_REVIEW_CONTRACT = "juss-v10/independent-review@v1" as const;

export type ReviewerKind = "semantic" | "deterministic";
export type ReviewSeverity = "P0" | "P1" | "P2" | "P3";
export type ReviewVerdict = "clear" | "needs_review" | "blocked";

export interface IndependentReviewFinding {
  id: string;
  severity: ReviewSeverity;
  title: string;
  path: string;
  line: number | null;
  evidence: string;
  recommendation: string;
}

export interface IndependentReviewReceipt {
  contract: typeof INDEPENDENT_REVIEW_CONTRACT;
  repository: string;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
  diffHash: string;
  policyHash: string;
  reviewer: {
    id: string;
    kind: ReviewerKind;
    provider: string;
    runtime: string;
  };
  authorIdentity: string;
  findings: IndependentReviewFinding[];
  verdict: ReviewVerdict;
  summary: string;
  proposalOnly: true;
  mergeAuthorized: false;
  executionAuthorized: false;
  reviewHash: string;
}

export interface IndependentReviewContext {
  projectId: string;
  repository: string;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
  diffHash: string;
  policyHash: string;
  authorIdentity: string;
}

export interface IndependentReviewPolicy {
  requiredSemanticReviews: number;
  requireDeterministicReview: boolean;
  /** P2 is unresolved review work and must remain merge-blocking in v1. */
  blockOnP2: true;
  /** Provider identities allowed to satisfy semantic review. Empty only for founder-final mode. */
  trustedSemanticReviewerIds: string[];
  /**
   * FCR founder-final mode keeps independent deterministic review load-bearing
   * while making the authenticated founder the final human authority.
   */
  founderFinalApprovalRequired?: true;
}

export interface IndependentReviewGateResult {
  reviewGateSatisfied: boolean;
  mergeAuthorized: false;
  executionAuthorized: false;
  witnessedReviewHashes: string[];
  semanticClearCount: number;
  deterministicClearCount: number;
  blockers: string[];
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const MAX_COMPLETE_COMPARE_FILES = 299;
const REVIEWER_KINDS = new Set<ReviewerKind>(["semantic", "deterministic"]);
const SEVERITIES = new Set<ReviewSeverity>(["P0", "P1", "P2", "P3"]);
const VERDICTS = new Set<ReviewVerdict>(["clear", "needs_review", "blocked"]);
const FCR_REPOSITORY = "jussray/founder-control-room";
const FCR_TRUSTED_REVIEWERS_ENV = "FCR_TRUSTED_SEMANTIC_REVIEWER_IDS";
const FCR_TRUSTED_REVIEW_APP_ENV = "GITHUB_APP_ID";

export const FCR_FOUNDER_FINAL_REVIEW_POLICY: IndependentReviewPolicy = Object.freeze({
  requiredSemanticReviews: 0,
  requireDeterministicReview: true,
  blockOnP2: true,
  trustedSemanticReviewerIds: [],
  founderFinalApprovalRequired: true,
});

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const lower = (value: unknown): string => text(value).toLowerCase();
const isGitHubAppBotIdentity = (value: unknown): boolean => /\[bot\]$/i.test(text(value));
const isFounderFinalPolicy = (policy: IndependentReviewPolicy): boolean =>
  policy?.founderFinalApprovalRequired === true;

function trustedFcrReviewAppId(env: NodeJS.ProcessEnv): string | null {
  const value = text(env[FCR_TRUSTED_REVIEW_APP_ENV]);
  return /^\d+$/.test(value) ? value : null;
}

export function independentReviewPolicyHash(policy: IndependentReviewPolicy): string {
  const trustedReviewerIds = Array.isArray(policy?.trustedSemanticReviewerIds)
    ? policy.trustedSemanticReviewerIds.map(lower).filter(Boolean).sort()
    : [];
  const seed: unknown[] = [
    policy?.requiredSemanticReviews,
    policy?.requireDeterministicReview === true,
    policy?.blockOnP2 === true,
    trustedReviewerIds,
  ];
  // Preserve legacy policy hashes. Founder-final is an explicit new authority
  // mode and therefore gets a distinct policy identity.
  if (policy?.founderFinalApprovalRequired === true) seed.push("founder-final");
  return hash("sha256", JSON.stringify(seed), "hex");
}

function fcrServerOwnedSemanticPolicy(env: NodeJS.ProcessEnv): IndependentReviewPolicy | null {
  const raw = text(env[FCR_TRUSTED_REVIEWERS_ENV]);
  if (!raw) return null;
  const trustedSemanticReviewerIds = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (trustedSemanticReviewerIds.length === 0 || trustedSemanticReviewerIds.length > 8) return null;
  const normalized = trustedSemanticReviewerIds.map(lower);
  if (new Set(normalized).size !== normalized.length) return null;
  if (normalized.some(isGitHubAppBotIdentity)) return null;
  return {
    requiredSemanticReviews: 1,
    requireDeterministicReview: true,
    blockOnP2: true,
    trustedSemanticReviewerIds,
  };
}

function fcrServerPolicyBlockers(
  context: IndependentReviewContext,
  policy: IndependentReviewPolicy,
  env: NodeJS.ProcessEnv,
): string[] {
  if (lower(context.repository) !== FCR_REPOSITORY) return [];

  if (isFounderFinalPolicy(policy)) {
    const blockers: string[] = [];
    if (independentReviewPolicyHash(policy) !== independentReviewPolicyHash(FCR_FOUNDER_FINAL_REVIEW_POLICY)) {
      blockers.push("FCR founder-final review policy must match the server-owned deterministic-review policy");
    }
    if (!trustedFcrReviewAppId(env)) {
      blockers.push(`FCR founder-final deterministic review requires numeric server-owned ${FCR_TRUSTED_REVIEW_APP_ENV}`);
    }
    return blockers;
  }

  // Compatibility path for already-approved missions that were pinned under
  // the earlier trusted-human semantic-review policy.
  const serverPolicy = fcrServerOwnedSemanticPolicy(env);
  if (!serverPolicy) {
    return [`FCR legacy semantic-review mode requires valid server-owned ${FCR_TRUSTED_REVIEWERS_ENV} configuration`];
  }
  if (independentReviewPolicyHash(policy) !== independentReviewPolicyHash(serverPolicy)) {
    return ["FCR independent review policy must match the server-owned semantic reviewer policy"];
  }
  return [];
}

export function independentReviewDiffHash(diff: Diff): string {
  const files = Array.isArray(diff?.files) ? [...diff.files] : [];
  // GitHub's compare endpoint exposes at most 300 changed files. Seeing 300
  // therefore cannot prove whether the comparison is complete. FCR prefers a
  // false negative over reviewing a silently truncated file set; split the PR
  // or use a future provider primitive that attests the full changed-file set.
  if (files.length > MAX_COMPLETE_COMPARE_FILES) {
    throw new Error(
      `Independent review diff completeness is unproven for ${files.length} files; provider comparisons must contain at most ${MAX_COMPLETE_COMPARE_FILES} files`,
    );
  }
  const filesWithoutPatch = files.filter((file) => typeof file.patch !== "string");
  if (filesWithoutPatch.length > 0) {
    throw new Error(
      `Independent review diff content is incomplete for: ${filesWithoutPatch.map((file) => file.path).sort().join(", ")}`,
    );
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return hash("sha256", JSON.stringify([
    lower(diff?.base),
    lower(diff?.head),
    diff?.aheadBy,
    diff?.behindBy,
    files.map((file) => [
      file.path,
      file.status,
      file.additions,
      file.deletions,
      file.patch,
    ]),
  ]), "hex");
}

function reviewSeed(review: IndependentReviewReceipt): string {
  const findings = Array.isArray(review?.findings) ? review.findings : [];
  return JSON.stringify([
    review?.contract,
    review?.repository,
    review?.pullRequestNumber,
    review?.baseSha,
    review?.headSha,
    review?.diffHash,
    review?.policyHash,
    review?.reviewer?.id,
    review?.reviewer?.kind,
    review?.reviewer?.provider,
    review?.reviewer?.runtime,
    review?.authorIdentity,
    findings.map((finding) => [
      finding?.id,
      finding?.severity,
      finding?.title,
      finding?.path,
      finding?.line,
      finding?.evidence,
      finding?.recommendation,
    ]),
    review?.verdict,
    review?.summary,
  ]);
}

export function independentReviewHash(review: IndependentReviewReceipt): string {
  return hash("sha256", reviewSeed(review), "hex");
}

export function expectedReviewSignalName(review: IndependentReviewReceipt): string {
  return `Independent Review / ${lower(review?.reviewHash)}`;
}

function verdictFromFindings(findings: IndependentReviewFinding[]): ReviewVerdict {
  if (findings.some((finding) => finding?.severity === "P0" || finding?.severity === "P1")) return "blocked";
  if (findings.some((finding) => finding?.severity === "P2")) return "needs_review";
  return "clear";
}

function validateReceipt(review: IndependentReviewReceipt, context: IndependentReviewContext): string[] {
  const errors: string[] = [];
  if (!review || typeof review !== "object") return ["Review receipt must be an object"];
  if (review.contract !== INDEPENDENT_REVIEW_CONTRACT) errors.push("Unsupported review contract");
  if (!text(review.repository) || lower(review.repository) !== lower(context.repository)) errors.push("Review repository does not match gate context");
  if (!Number.isInteger(review.pullRequestNumber) || review.pullRequestNumber !== context.pullRequestNumber) errors.push("Review PR does not match gate context");
  if (!FULL_SHA.test(text(review.baseSha)) || lower(review.baseSha) !== lower(context.baseSha)) errors.push("Review base SHA does not match gate context");
  if (!FULL_SHA.test(text(review.headSha)) || lower(review.headSha) !== lower(context.headSha)) errors.push("Review head SHA does not match gate context");
  if (!SHA256.test(text(review.diffHash)) || lower(review.diffHash) !== lower(context.diffHash)) errors.push("Review diff hash does not match gate context");
  if (!SHA256.test(text(review.policyHash)) || lower(review.policyHash) !== lower(context.policyHash)) errors.push("Review policy hash does not match gate context");
  if (!text(review.authorIdentity) || lower(review.authorIdentity) !== lower(context.authorIdentity)) errors.push("Review author identity does not match gate context");
  if (!text(review.reviewer?.id)) errors.push("Reviewer id is required");
  if (!REVIEWER_KINDS.has(review.reviewer?.kind)) errors.push("Unsupported reviewer kind");
  if (!text(review.reviewer?.provider) || !text(review.reviewer?.runtime)) errors.push("Reviewer provider/runtime are required");
  if (lower(review.reviewer?.id) === lower(context.authorIdentity)) errors.push("Patch author cannot satisfy independent review");
  if (review.reviewer?.kind === "semantic" && isGitHubAppBotIdentity(review.reviewer?.id)) {
    errors.push("GitHub App bot cannot satisfy independent semantic review");
  }

  if (!Array.isArray(review.findings) || review.findings.length > 100) {
    errors.push("Review findings must contain at most 100 items");
  } else {
    const ids = new Set<string>();
    for (const finding of review.findings) {
      const findingId = text(finding?.id);
      if (!findingId || ids.has(findingId)) errors.push("Review finding ids must be present and unique");
      if (findingId) ids.add(findingId);
      if (!SEVERITIES.has(finding?.severity)) errors.push(`Unsupported finding severity: ${String(finding?.severity)}`);
      if (!text(finding?.title) || !text(finding?.evidence)) errors.push("Review findings require title and evidence");
      if (typeof finding?.path !== "string") errors.push("Review finding path must be a string");
      if (typeof finding?.recommendation !== "string") errors.push("Review finding recommendation must be a string");
      if (finding?.line !== null && (!Number.isInteger(finding?.line) || Number(finding?.line) <= 0)) errors.push("Review finding line must be null or a positive integer");
    }
  }

  if (!VERDICTS.has(review.verdict)) errors.push("Unsupported review verdict");
  else if (Array.isArray(review.findings) && verdictFromFindings(review.findings) !== review.verdict) errors.push("Review verdict does not match findings");
  if (!text(review.summary)) errors.push("Review summary is required");
  if (review.proposalOnly !== true || review.mergeAuthorized !== false || review.executionAuthorized !== false) {
    errors.push("Review receipt must be proposal-only and non-authorizing");
  }
  if (!SHA256.test(text(review.reviewHash))) errors.push("Review hash must be sha256");
  else if (independentReviewHash(review) !== lower(review.reviewHash)) errors.push("Review hash does not match review content");
  return errors;
}

function isMatchingDeterministicWitness(
  signal: VerificationSignal,
  review: IndependentReviewReceipt,
  expectedProvider: string,
  expectedIssuerId?: string,
): boolean {
  return lower(signal.provider) === lower(expectedProvider)
    && signal.name === expectedReviewSignalName(review)
    && signal.status === "passed"
    && lower(signal.commitSha) === lower(review.headSha)
    && (expectedIssuerId === undefined
      || (signal.issuer?.kind === "app" && signal.issuer.id === expectedIssuerId));
}

function expectedSemanticReviewState(review: IndependentReviewReceipt): ReviewSignal["state"] {
  return review.verdict === "clear" ? "approved" : "changes_requested";
}

function isMatchingSemanticWitness(
  signal: ReviewSignal,
  review: IndependentReviewReceipt,
  expectedProvider: string,
): boolean {
  return lower(signal.provider) === lower(expectedProvider)
    && lower(signal.reviewerId) === lower(review.reviewer.id)
    && signal.state === expectedSemanticReviewState(review)
    && lower(signal.commitSha) === lower(review.headSha)
    && lower(signal.receiptHash) === lower(review.reviewHash);
}

function latestReviewSignalForReviewer(
  signals: ReviewSignal[],
  reviewerId: string,
): ReviewSignal | undefined {
  const matches = signals.filter((signal) => lower(signal.reviewerId) === lower(reviewerId));
  if (matches.length <= 1) return matches[0];
  if (matches.some((signal) => Number.isNaN(Date.parse(text(signal.submittedAt))))) return undefined;
  return [...matches].sort((a, b) => {
    const timeDelta = Date.parse(text(a.submittedAt)) - Date.parse(text(b.submittedAt));
    if (timeDelta !== 0) return timeDelta;
    return text(a.id).localeCompare(text(b.id), undefined, { numeric: true });
  }).at(-1);
}

function blockedResult(blockers: string[]): IndependentReviewGateResult {
  return {
    reviewGateSatisfied: false,
    mergeAuthorized: false,
    executionAuthorized: false,
    witnessedReviewHashes: [],
    semanticClearCount: 0,
    deterministicClearCount: 0,
    blockers,
  };
}

export async function evaluateIndependentReviewGate(
  provider: RepositoryProvider,
  context: IndependentReviewContext,
  reviews: IndependentReviewReceipt[],
  policy: IndependentReviewPolicy,
  env: NodeJS.ProcessEnv = process.env,
): Promise<IndependentReviewGateResult> {
  const blockers: string[] = [];
  const founderFinalMode = isFounderFinalPolicy(policy);
  if (!FULL_SHA.test(text(context.baseSha)) || !FULL_SHA.test(text(context.headSha))) blockers.push("Gate context requires full base/head SHAs");
  if (!SHA256.test(text(context.diffHash)) || !SHA256.test(text(context.policyHash))) blockers.push("Gate context requires sha256 diff/policy hashes");
  if (!Number.isInteger(context.pullRequestNumber) || context.pullRequestNumber <= 0) blockers.push("Gate context requires a positive pull request number");
  if (!text(context.projectId) || !text(context.repository) || !text(context.authorIdentity)) blockers.push("Gate context requires project, repository, and author identity");
  blockers.push(...fcrServerPolicyBlockers(context, policy, env));

  const minimumSemanticReviews = founderFinalMode ? 0 : 1;
  if (!Number.isInteger(policy?.requiredSemanticReviews)
    || policy.requiredSemanticReviews < minimumSemanticReviews
    || policy.requiredSemanticReviews > 4) {
    blockers.push(
      founderFinalMode
        ? "Founder-final policy requires between 0 and 4 semantic reviews"
        : "Policy requires between 1 and 4 semantic reviews",
    );
  }
  if (policy?.blockOnP2 !== true) blockers.push("Independent review v1 requires P2 findings to remain merge-blocking");
  if (!Array.isArray(policy?.trustedSemanticReviewerIds)) {
    blockers.push("Policy trustedSemanticReviewerIds must be an array");
  } else {
    const normalized = policy.trustedSemanticReviewerIds.map(lower).filter(Boolean);
    if (!founderFinalMode && normalized.length === 0) {
      blockers.push("Policy requires at least one trusted semantic reviewer identity");
    }
    if (new Set(normalized).size !== normalized.length) blockers.push("Trusted semantic reviewer identities must be unique");
    const botReviewers = normalized.filter(isGitHubAppBotIdentity);
    if (botReviewers.length > 0) {
      blockers.push(`Trusted semantic reviewer policy cannot include GitHub App bot identities: ${botReviewers.join(", ")}`);
    }
    if (Number.isInteger(policy.requiredSemanticReviews) && normalized.length < policy.requiredSemanticReviews) {
      blockers.push("Policy has fewer trusted semantic reviewers than required semantic reviews");
    }
  }
  if (!Array.isArray(reviews) || reviews.length === 0 || reviews.length > 12) blockers.push("Gate requires 1-12 review receipts");

  const reviewerIds = new Set<string>();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const validation = validateReceipt(review, context);
    blockers.push(...validation.map((error) => `${text(review?.reviewer?.id) || "unknown-reviewer"}: ${error}`));
    const reviewerId = lower(review?.reviewer?.id);
    if (reviewerId && reviewerIds.has(reviewerId)) blockers.push(`Duplicate reviewer identity: ${text(review?.reviewer?.id)}`);
    if (reviewerId) reviewerIds.add(reviewerId);
  }

  const trustedSemanticReviewers = new Set((policy?.trustedSemanticReviewerIds ?? []).map(lower));
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (review?.reviewer?.kind === "semantic" && !trustedSemanticReviewers.has(lower(review.reviewer.id))) {
      blockers.push(`Semantic reviewer is not trusted by policy: ${text(review.reviewer.id)}`);
    }
  }

  if (blockers.length > 0) return blockedResult(blockers);

  const exactHead = await provider.getRef(context.projectId, context.headSha);
  if (lower(exactHead.commitSha) !== lower(context.headSha)) blockers.push("Repository provider did not resolve the exact requested head");

  const deterministicReviews = reviews.filter((review) => review.reviewer.kind === "deterministic");
  const semanticReviews = reviews.filter((review) => review.reviewer.kind === "semantic");
  const verificationSignals = deterministicReviews.length > 0
    ? await provider.listVerificationSignals(context.projectId, context.headSha)
    : [];
  const expectedDeterministicIssuerId = founderFinalMode && lower(context.repository) === FCR_REPOSITORY
    ? trustedFcrReviewAppId(env) ?? undefined
    : undefined;

  if (semanticReviews.length > 0 && typeof provider.listReviewSignals !== "function") {
    blockers.push("Repository provider cannot supply provider-backed semantic review witnesses");
    return blockedResult(blockers);
  }
  const reviewSignals = semanticReviews.length > 0
    ? await provider.listReviewSignals!(context.projectId, context.pullRequestNumber)
    : [];

  let semanticClearCount = 0;
  let deterministicClearCount = 0;
  const witnessedReviewHashes: string[] = [];

  for (const review of reviews) {
    const witnessed = review.reviewer.kind === "semantic"
      ? (() => {
          const latest = latestReviewSignalForReviewer(reviewSignals, review.reviewer.id);
          return latest ? isMatchingSemanticWitness(latest, review, provider.name) : false;
        })()
      : verificationSignals.some((signal) => isMatchingDeterministicWitness(
          signal,
          review,
          provider.name,
          expectedDeterministicIssuerId,
        ));

    if (!witnessed) {
      blockers.push(
        review.reviewer.kind === "semantic"
          ? `Missing current exact-head provider PR-review witness for ${review.reviewer.id}`
          : founderFinalMode && lower(context.repository) === FCR_REPOSITORY
            ? `Missing passed exact-head deterministic witness from trusted GitHub App issuer for ${review.reviewer.id}`
            : `Missing passed exact-head deterministic witness for ${review.reviewer.id}`,
      );
      continue;
    }

    witnessedReviewHashes.push(review.reviewHash);
    if (review.verdict === "blocked") blockers.push(`${review.reviewer.id} reported a blocking review verdict`);
    if (review.verdict === "needs_review") blockers.push(`${review.reviewer.id} reported unresolved P2 review findings`);
    if (review.findings.some((finding) => finding.severity === "P2")) blockers.push(`${review.reviewer.id} contains P2 findings blocked by policy`);

    if (review.verdict === "clear") {
      if (review.reviewer.kind === "semantic") semanticClearCount += 1;
      else deterministicClearCount += 1;
    }
  }

  if (semanticClearCount < policy.requiredSemanticReviews) {
    blockers.push(`Semantic review requirement not met: ${semanticClearCount}/${policy.requiredSemanticReviews}`);
  }
  if (policy.requireDeterministicReview && deterministicClearCount < 1) blockers.push("Deterministic review requirement not met");

  return {
    reviewGateSatisfied: blockers.length === 0,
    mergeAuthorized: false,
    executionAuthorized: false,
    witnessedReviewHashes: [...new Set(witnessedReviewHashes)].sort(),
    semanticClearCount,
    deterministicClearCount,
    blockers,
  };
}
