import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
} from "../providers/RepositoryProvider.js";
import {
  FCR_FOUNDER_FINAL_REVIEW_POLICY,
  INDEPENDENT_REVIEW_CONTRACT,
  independentReviewDiffHash,
  independentReviewHash,
  independentReviewPolicyHash,
  type IndependentReviewFinding,
  type IndependentReviewReceipt,
  type ReviewVerdict,
} from "./independentReviewGate.js";

export const FCR_DETERMINISTIC_REVIEW_RULE_VERSION = "fcr-deterministic-rules@v1" as const;
export const FCR_DETERMINISTIC_REVIEWER_ID = "fcr-deterministic-review-v1" as const;

const FCR_PROJECT_ID = "founder-control-room";
const FCR_REPOSITORY = "jussray/founder-control-room";
const FCR_BASE_REF = "main";
const FULL_SHA = /^[0-9a-f]{40}$/i;

const TRUST_ROOT_PATHS = new Set([
  "src/review/deterministicReviewProducer.ts",
  "src/review/deterministicReviewWitnessPublisher.ts",
  "src/review/independentReviewGate.ts",
  "src/http/routes/approvals.ts",
  "src/providers/RepositoryProvider.ts",
  "src/providers/GitHubProvider.ts",
]);

const TEST_DISCOVERY_TRIGGER_PATHS = new Set([
  "vitest.config.ts",
  "scripts/verify-test-discovery.mjs",
  "scripts/test-discovery-baseline.json",
]);

const TEST_DISCOVERY_COMPANION_PATHS = [
  "scripts/verify-test-discovery.node-test.mjs",
  "docs/TEST_DISCOVERY_DEBT.md",
] as const;

const FCR_MERGE_TRUTH_DOC = "docs/FOUNDER_MERGE_AUTHORITY.md";
const PROVIDER_TRUTH_DOC = "docs/PROVIDERS.md";

export interface FcrDeterministicReviewProduction {
  context: PullRequestReviewContext;
  diff: Diff;
  receipt: IndependentReviewReceipt;
  ruleVersion: typeof FCR_DETERMINISTIC_REVIEW_RULE_VERSION;
}

export class DeterministicReviewProductionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeterministicReviewProductionError";
  }
}

const lower = (value: string): string => value.trim().toLowerCase();
const sortedUnique = (values: string[]): string[] => [...new Set(values)].sort();
const isTestPath = (path: string): boolean => /(?:^|\/)(?:__tests__\/.*|[^/]+\.(?:test|spec)\.[cm]?[jt]sx?)$/i.test(path);

function finding(
  id: string,
  severity: "P1" | "P2",
  title: string,
  paths: string[],
  evidence: string,
  recommendation: string,
): IndependentReviewFinding {
  const orderedPaths = sortedUnique(paths);
  return {
    id,
    severity,
    title,
    path: orderedPaths[0] ?? "",
    line: null,
    evidence,
    recommendation,
  };
}

function verdictFromFindings(findings: IndependentReviewFinding[]): ReviewVerdict {
  if (findings.some((item) => item.severity === "P0" || item.severity === "P1")) return "blocked";
  if (findings.some((item) => item.severity === "P2")) return "needs_review";
  return "clear";
}

function summaryFor(verdict: ReviewVerdict, findings: IndependentReviewFinding[]): string {
  if (verdict === "clear") {
    return `Deterministic review ${FCR_DETERMINISTIC_REVIEW_RULE_VERSION} satisfied all mechanical rules.`;
  }
  const severities = findings.map((item) => `${item.severity}:${item.id}`).join(",");
  return `Deterministic review ${FCR_DETERMINISTIC_REVIEW_RULE_VERSION} returned ${verdict}: ${severities}.`;
}

function requireExactProviderIdentity(context: PullRequestReviewContext): void {
  if (context.number <= 0 || !Number.isInteger(context.number)) {
    throw new DeterministicReviewProductionError("Provider PR number is invalid");
  }
  if (lower(context.repository) !== FCR_REPOSITORY || lower(context.headRepository) !== FCR_REPOSITORY) {
    throw new DeterministicReviewProductionError("Deterministic review rejects repository or fork substitution");
  }
  if (context.baseRef !== FCR_BASE_REF || !context.headRef.trim()) {
    throw new DeterministicReviewProductionError("Deterministic review requires the canonical main base and a named head ref");
  }
  if (!FULL_SHA.test(context.baseSha) || !FULL_SHA.test(context.headSha)) {
    throw new DeterministicReviewProductionError("Deterministic review requires exact full base/head SHAs");
  }
  if (!context.authorIdentity.trim()) {
    throw new DeterministicReviewProductionError("Deterministic review requires provider-backed author identity");
  }
}

function requireCurrentProviderRefs(
  context: PullRequestReviewContext,
  currentBaseSha: string,
  currentHeadSha: string,
): void {
  if (!FULL_SHA.test(currentBaseSha) || lower(currentBaseSha) !== lower(context.baseSha)) {
    throw new DeterministicReviewProductionError("Base moved after provider review context was read");
  }
  if (!FULL_SHA.test(currentHeadSha) || lower(currentHeadSha) !== lower(context.headSha)) {
    throw new DeterministicReviewProductionError("Head moved after provider review context was read");
  }
}

function requireFreshCompleteDiff(context: PullRequestReviewContext, diff: Diff): string {
  if (lower(diff.base) !== lower(context.baseSha) || lower(diff.head) !== lower(context.headSha)) {
    throw new DeterministicReviewProductionError("Provider diff is not bound to the exact reviewed base/head");
  }
  if (diff.behindBy !== 0 || diff.aheadBy < 1) {
    throw new DeterministicReviewProductionError(
      `Reviewed candidate must be current with its base and ahead by at least one commit; observed ahead=${diff.aheadBy} behind=${diff.behindBy}`,
    );
  }
  try {
    return independentReviewDiffHash(diff);
  } catch (error) {
    throw new DeterministicReviewProductionError(
      `Provider diff completeness is unproven: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function evaluateMechanicalRules(diff: Diff): IndependentReviewFinding[] {
  const paths = sortedUnique(diff.files.map((file) => file.path));
  const pathSet = new Set(paths);
  const findings: IndependentReviewFinding[] = [];

  const touchedTrustRoots = paths.filter((path) => TRUST_ROOT_PATHS.has(path));
  if (touchedTrustRoots.length > 0) {
    findings.push(finding(
      "trust-root-self-modification",
      "P1",
      "Candidate modifies deterministic-review trust roots",
      touchedTrustRoots,
      `Trust-root paths changed: ${touchedTrustRoots.join(", ")}`,
      "Use a separately explicit bootstrap/constitutional authority path; the normal deterministic producer cannot self-certify its own trust roots.",
    ));
  }

  const touchesDiscoveryAuthority = paths.some((path) => TEST_DISCOVERY_TRIGGER_PATHS.has(path));
  if (touchesDiscoveryAuthority) {
    const missing = TEST_DISCOVERY_COMPANION_PATHS.filter((path) => !pathSet.has(path));
    if (missing.length > 0) {
      findings.push(finding(
        "test-discovery-companion-missing",
        "P2",
        "Test-discovery authority change is missing required companion surfaces",
        [...paths.filter((path) => TEST_DISCOVERY_TRIGGER_PATHS.has(path)), ...missing],
        `Missing required companion paths: ${missing.join(", ")}`,
        "Change the adversarial discovery verifier tests and TEST_DISCOVERY_DEBT documentation in the same candidate.",
      ));
    }
  }

  const touchesMergeAuthority = paths.some((path) =>
    !isTestPath(path)
    && (path.startsWith("src/review/")
      || path === "src/http/routes/approvals.ts"
      || path === "src/security/repositoryActionAuthority.ts"));
  if (touchesMergeAuthority && !pathSet.has(FCR_MERGE_TRUTH_DOC)) {
    findings.push(finding(
      "merge-authority-truth-companion-missing",
      "P2",
      "Merge-authority source changed without founder authority documentation",
      [FCR_MERGE_TRUTH_DOC],
      `${FCR_MERGE_TRUTH_DOC} is absent while non-test merge/review authority source changed.`,
      "Update the founder merge-authority truth surface in the same candidate.",
    ));
  }

  const touchesProviderAuthority = paths.some((path) =>
    !isTestPath(path) && path.startsWith("src/providers/") && !path.endsWith("RepositoryProvider.ts"));
  if (touchesProviderAuthority && !pathSet.has(PROVIDER_TRUTH_DOC)) {
    findings.push(finding(
      "provider-truth-companion-missing",
      "P2",
      "Repository-provider source changed without provider documentation",
      [PROVIDER_TRUTH_DOC],
      `${PROVIDER_TRUTH_DOC} is absent while non-test repository-provider source changed.`,
      "Update provider truth documentation in the same candidate.",
    ));
  }

  return findings;
}

export async function produceFcrDeterministicReview(
  provider: RepositoryProvider,
  pullRequestNumber: number,
): Promise<FcrDeterministicReviewProduction> {
  if (provider.name.toLowerCase() !== "github") {
    throw new DeterministicReviewProductionError("FCR deterministic review v1 requires the GitHub repository provider");
  }
  if (!provider.getPullRequestReviewContext) {
    throw new DeterministicReviewProductionError("Repository provider cannot supply pull-request review context");
  }
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new DeterministicReviewProductionError("pullRequestNumber must be a positive integer");
  }

  const context = await provider.getPullRequestReviewContext(FCR_PROJECT_ID, pullRequestNumber);
  requireExactProviderIdentity(context);

  const currentBaseSha = await provider.resolveRef(FCR_PROJECT_ID, context.baseRef);
  const currentHeadSha = await provider.resolveRef(FCR_PROJECT_ID, context.headRef);
  requireCurrentProviderRefs(context, currentBaseSha, currentHeadSha);

  const diff = await provider.compare(FCR_PROJECT_ID, context.baseSha, context.headSha);
  const diffHash = requireFreshCompleteDiff(context, diff);
  const findings = evaluateMechanicalRules(diff);
  const verdict = verdictFromFindings(findings);
  const policyHash = independentReviewPolicyHash(FCR_FOUNDER_FINAL_REVIEW_POLICY);

  const draft: IndependentReviewReceipt = {
    contract: INDEPENDENT_REVIEW_CONTRACT,
    repository: context.repository,
    pullRequestNumber: context.number,
    baseSha: context.baseSha,
    headSha: context.headSha,
    diffHash,
    policyHash,
    reviewer: {
      id: FCR_DETERMINISTIC_REVIEWER_ID,
      kind: "deterministic",
      provider: provider.name,
      runtime: FCR_DETERMINISTIC_REVIEW_RULE_VERSION,
    },
    authorIdentity: context.authorIdentity,
    findings,
    verdict,
    summary: summaryFor(verdict, findings),
    proposalOnly: true,
    mergeAuthorized: false,
    executionAuthorized: false,
    reviewHash: "",
  };

  const receipt: IndependentReviewReceipt = {
    ...draft,
    reviewHash: independentReviewHash(draft),
  };

  return {
    context,
    diff,
    receipt,
    ruleVersion: FCR_DETERMINISTIC_REVIEW_RULE_VERSION,
  };
}
