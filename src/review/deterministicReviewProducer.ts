import type { DiffFile, RepositoryProvider } from "../providers/RepositoryProvider.js";
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

export const DETERMINISTIC_REVIEW_RULESET = "fcr/deterministic-review-rules@v1" as const;
export const DETERMINISTIC_REVIEWER_ID = "fcr-deterministic-review-v1" as const;

const FCR_REPOSITORY = "jussray/founder-control-room";
const FCR_BASE_REF = "main";
const FULL_SHA = /^[0-9a-f]{40}$/i;

const TRUST_ROOT_PATHS = new Set([
  "src/review/deterministicReviewProducer.ts",
  "src/review/deterministicReviewWitnessPublisher.ts",
  "src/review/independentReviewGate.ts",
  "src/http/routes/approvals.ts",
  "src/controllers/ProofGateController.ts",
  "src/proof-gate/gate.ts",
  "src/proof-gate/persist.ts",
  "src/proof-gate/types.ts",
  "src/http/middleware/requireFounder.ts",
  "src/http/middleware/requirePortfolioSwitchOn.ts",
  "src/http/middleware/v10PrivilegedApprovalBinding.ts",
  "src/http/middleware/v10DecisionFounderBinding.ts",
  "src/http/server.ts",
  "src/auth/founderSession.ts",
  "src/switchboard/store.ts",
  "src/founder-os-lab/capabilityKernel.ts",
  "src/lib/v10DecisionAuthorityGate.ts",
  "src/lib/founderControlDecision.ts",
  "src/providers/DeterministicReviewGitHubProvider.ts",
  "src/providers/RepositoryProvider.ts",
  "src/providers/GitHubProvider.ts",
  "src/providers/SecurityPreservingGitHubProvider.ts",
  "src/providers/githubAppAuth.ts",
  "src/providers/providerFactory.ts",
]);

/**
 * Current production/autonomous execution owners. A new controller cannot
 * become runnable through reconciliation without modifying the protected
 * reconciler registry, and a new Worker entry cannot become production without
 * modifying the protected Wrangler entry configuration.
 */
const AUTONOMOUS_EXECUTION_PATHS = new Set([
  "wrangler.worker.toml",
  "src/worker/cf-entry.ts",
  "src/worker/handler.ts",
  "src/worker/reconciler.ts",
  "src/worker/scheduler.ts",
  "src/controllers/base.ts",
  "src/controllers/CheckRunController.ts",
  "src/controllers/ChangeProposalController.ts",
  "src/controllers/ManifestController.ts",
  "src/controllers/MergeIntentController.ts",
  "src/controllers/MissionController.ts",
  "src/controllers/ProjectController.ts",
  "src/controllers/ReleaseController.ts",
  "src/controllers/ProofGateController.ts",
  "src/controllers/StripeSyncWitnessController.ts",
]);

const MERGE_AUTHORITY_DOCS = [
  "README.md",
  "docs/FOUNDER_MERGE_AUTHORITY.md",
  "GLOBAL_AI.md",
  ".ai/skills/juss-flow-launch-loop/SKILL.md",
  "docs/DOCUMENTATION_TRUTH_RECEIPT.json",
] as const;

const PROVIDER_DOCS = [
  "README.md",
  "docs/PROVIDERS.md",
  "docs/DOCUMENTATION_TRUTH_RECEIPT.json",
] as const;

const TEST_DISCOVERY_CORE_PATHS = new Set([
  "vitest.config.ts",
  "scripts/verify-test-discovery.mjs",
  "scripts/test-discovery-baseline.json",
]);

const TEST_DISCOVERY_COMPANIONS = [
  "scripts/verify-test-discovery.node-test.mjs",
  "docs/TEST_DISCOVERY_DEBT.md",
] as const;

export interface DeterministicReviewProducerInput {
  provider: RepositoryProvider;
  projectId: string;
  pullRequestNumber: number;
}

export interface DeterministicReviewProduction {
  receipt: IndependentReviewReceipt;
  ruleSet: typeof DETERMINISTIC_REVIEW_RULESET;
  publishable: boolean;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function finding(
  id: string,
  severity: IndependentReviewFinding["severity"],
  title: string,
  path: string,
  evidence: string,
  recommendation: string,
): IndependentReviewFinding {
  return {
    id,
    severity,
    title,
    path,
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

function changedPathSet(files: DiffFile[]): Set<string> {
  return new Set(files.map((file) => file.path));
}

function isReviewAuthoritySource(path: string): boolean {
  return path === "src/http/routes/approvals.ts"
    || (path.startsWith("src/review/") && !path.endsWith(".test.ts"));
}

function isProviderAuthoritySource(path: string): boolean {
  return path.startsWith("src/providers/")
    && !path.startsWith("src/providers/__tests__/")
    && !path.endsWith(".test.ts");
}

function isTestSource(path: string): boolean {
  return path.includes("/__tests__/") || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function addedPatchText(file: DiffFile): string {
  return (file.patch ?? "")
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

/**
 * Backstop for a new provider merge sink outside today's known execution
 * graph. `integrate` is a deliberately reserved consequential provider method;
 * newly added production-source use fails closed and requires bootstrap review.
 */
function introducesProviderIntegrationSink(file: DiffFile): boolean {
  if (!file.path.startsWith("src/") || isTestSource(file.path)) return false;
  if (TRUST_ROOT_PATHS.has(file.path) || AUTONOMOUS_EXECUTION_PATHS.has(file.path)) return false;
  return /\bintegrate\b/.test(addedPatchText(file));
}

function missingPaths(changed: Set<string>, required: readonly string[]): string[] {
  return required.filter((path) => !changed.has(path));
}

export function evaluateDeterministicReviewRules(files: DiffFile[]): IndependentReviewFinding[] {
  const changed = changedPathSet(files);
  const findings: IndependentReviewFinding[] = [];

  const renamedPaths = files
    .filter((file) => file.status === "renamed")
    .map((file) => file.path)
    .sort();
  if (renamedPaths.length > 0) {
    findings.push(finding(
      "rename-provenance-unavailable",
      "P1",
      "Rename provenance is unavailable to deterministic review V1",
      renamedPaths[0]!,
      `Candidate contains renamed paths (${renamedPaths.join(", ")}), but the provider-neutral DiffFile contract does not retain each previous path. V1 cannot prove that a protected trust-root path was not renamed behind a new path identity.`,
      "Fail closed for renames in V1. A later provider-contract revision may carry previousPath, hash it, and evaluate both old and new path identities before allowing renamed candidates.",
    ));
  }

  const changedTrustRoots = [...new Set([
    ...[...TRUST_ROOT_PATHS].filter((path) => changed.has(path)),
    ...[...AUTONOMOUS_EXECUTION_PATHS].filter((path) => changed.has(path)),
  ])].sort();
  if (changedTrustRoots.length > 0) {
    findings.push(finding(
      "trust-root-self-modification",
      "P1",
      "Deterministic review trust root changed",
      changedTrustRoots[0]!,
      `Candidate changes deterministic review trust-root paths: ${changedTrustRoots.join(", ")}. A candidate cannot use the normal deterministic producer to certify changes to the producer, its consumer, its autonomous execution owners, or its trusted provider witness boundary.`,
      "Use a separately explicit bootstrap or constitutional authority path for this trust-root change, then reacquire normal deterministic review on later candidates.",
    ));
  }

  const newIntegrationSinks = files
    .filter((file) => introducesProviderIntegrationSink(file))
    .map((file) => file.path)
    .sort();
  if (newIntegrationSinks.length > 0) {
    findings.push(finding(
      "new-provider-integration-sink",
      "P1",
      "New provider integration sink is outside the known execution trust root",
      newIntegrationSinks[0]!,
      `Candidate introduces the consequential repository-provider integrate sink in production source outside the protected execution graph: ${newIntegrationSinks.join(", ")}. Path-only trust-root coverage must not allow a newly invented merge executor to self-certify.`,
      "Treat the new execution owner as a constitutional trust-root change or remove the direct provider integration sink; do not certify it through the normal deterministic producer.",
    ));
  }

  const changesReviewAuthority = files.some((file) => isReviewAuthoritySource(file.path));
  if (changesReviewAuthority) {
    const missing = missingPaths(changed, MERGE_AUTHORITY_DOCS);
    if (missing.length > 0) {
      findings.push(finding(
        "merge-authority-truth-coupling",
        "P2",
        "Merge-authority truth companions are incomplete",
        "docs/FOUNDER_MERGE_AUTHORITY.md",
        `Candidate changes non-test merge-authority source but omits required truth companions: ${missing.join(", ")}.`,
        "Refresh every canonical merge-authority truth surface and the Documentation Truth receipt in the same candidate.",
      ));
    }
  }

  const changesProviderAuthority = files.some((file) => isProviderAuthoritySource(file.path));
  if (changesProviderAuthority) {
    const missing = missingPaths(changed, PROVIDER_DOCS);
    if (missing.length > 0) {
      findings.push(finding(
        "provider-authority-truth-coupling",
        "P2",
        "Repository-provider truth companions are incomplete",
        "docs/PROVIDERS.md",
        `Candidate changes non-test repository-provider source but omits required truth companions: ${missing.join(", ")}.`,
        "Refresh provider documentation, README truth, and the Documentation Truth receipt in the same candidate.",
      ));
    }
  }

  const changesTestDiscoveryCore = files.some((file) => TEST_DISCOVERY_CORE_PATHS.has(file.path));
  if (changesTestDiscoveryCore) {
    const missing = missingPaths(changed, TEST_DISCOVERY_COMPANIONS);
    if (missing.length > 0) {
      findings.push(finding(
        "test-discovery-proof-coupling",
        "P2",
        "Test-discovery authority changed without its adversarial proof companions",
        "scripts/verify-test-discovery.mjs",
        `Candidate changes the default test-discovery contract but omits required companion paths: ${missing.join(", ")}.`,
        "Change the adversarial discovery tests and current discovery runbook with the discovery contract.",
      ));
    }
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

function assertProviderContext(
  repository: string,
  headRepository: string,
  baseRef: string,
  headRef: string,
  baseSha: string,
  headSha: string,
  authorIdentity: string,
): void {
  if (lower(repository) !== FCR_REPOSITORY || lower(headRepository) !== FCR_REPOSITORY) {
    throw new Error("Deterministic review requires the canonical Founder Control Room repository on both PR sides");
  }
  if (baseRef !== FCR_BASE_REF) {
    throw new Error(`Deterministic review is pinned to base ref ${FCR_BASE_REF}`);
  }
  if (!text(headRef)) {
    throw new Error("Deterministic review requires a provider-backed PR head ref");
  }
  if (!FULL_SHA.test(baseSha) || !FULL_SHA.test(headSha) || lower(baseSha) === lower(headSha)) {
    throw new Error("Deterministic review requires distinct full provider base/head SHAs");
  }
  if (!text(authorIdentity)) {
    throw new Error("Deterministic review requires provider-backed PR author identity");
  }
}

function deterministicSummary(verdict: ReviewVerdict, findings: IndependentReviewFinding[]): string {
  if (verdict === "clear") {
    return `${DETERMINISTIC_REVIEW_RULESET} completed with no V1 deterministic findings.`;
  }
  const severities = findings.map((item) => item.severity).sort().join(",");
  return `${DETERMINISTIC_REVIEW_RULESET} produced ${findings.length} finding(s) with severities ${severities}.`;
}

export async function produceDeterministicReview(
  input: DeterministicReviewProducerInput,
): Promise<DeterministicReviewProduction> {
  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) {
    throw new Error("Deterministic review requires a positive pull request number");
  }
  if (!input.provider.getPullRequestReviewContext) {
    throw new Error("Repository provider cannot supply pull-request review context");
  }
  if (lower(input.provider.name) !== "github") {
    throw new Error("Founder Control Room deterministic review currently requires the GitHub repository provider");
  }

  const context = await input.provider.getPullRequestReviewContext(input.projectId, input.pullRequestNumber);
  if (context.number !== input.pullRequestNumber) {
    throw new Error(`Deterministic review provider returned PR #${context.number} for requested PR #${input.pullRequestNumber}`);
  }
  assertProviderContext(
    context.repository,
    context.headRepository,
    context.baseRef,
    context.headRef,
    context.baseSha,
    context.headSha,
    context.authorIdentity,
  );

  const [currentBaseSha, currentHeadSha] = await Promise.all([
    input.provider.resolveRef(input.projectId, context.baseRef),
    input.provider.resolveRef(input.projectId, context.headRef),
  ]);
  if (lower(currentBaseSha) !== lower(context.baseSha)) {
    throw new Error(`Deterministic review base moved: current ${currentBaseSha}, provider PR ${context.baseSha}`);
  }
  if (lower(currentHeadSha) !== lower(context.headSha)) {
    throw new Error(`Deterministic review head moved: current ${currentHeadSha}, provider PR ${context.headSha}`);
  }

  const diff = await input.provider.compare(input.projectId, context.baseSha, context.headSha);
  if (lower(diff.base) !== lower(context.baseSha) || lower(diff.head) !== lower(context.headSha)) {
    throw new Error("Deterministic review provider diff is not bound to the exact PR base/head");
  }
  if (diff.behindBy !== 0 || diff.aheadBy < 1) {
    throw new Error(`Deterministic review requires a fresh candidate (ahead=${diff.aheadBy}, behind=${diff.behindBy})`);
  }

  const diffHash = independentReviewDiffHash(diff);
  const policyHash = independentReviewPolicyHash(FCR_FOUNDER_FINAL_REVIEW_POLICY);
  const findings = evaluateDeterministicReviewRules(diff.files);
  const verdict = verdictFromFindings(findings);

  const draft = {
    contract: INDEPENDENT_REVIEW_CONTRACT,
    repository: FCR_REPOSITORY,
    pullRequestNumber: context.number,
    baseSha: lower(context.baseSha),
    headSha: lower(context.headSha),
    diffHash,
    policyHash,
    reviewer: {
      id: DETERMINISTIC_REVIEWER_ID,
      kind: "deterministic" as const,
      provider: input.provider.name,
      runtime: DETERMINISTIC_REVIEW_RULESET,
    },
    authorIdentity: text(context.authorIdentity),
    findings,
    verdict,
    summary: deterministicSummary(verdict, findings),
    proposalOnly: true as const,
    mergeAuthorized: false as const,
    executionAuthorized: false as const,
    reviewHash: "",
  } satisfies IndependentReviewReceipt;

  const receipt: IndependentReviewReceipt = {
    ...draft,
    reviewHash: independentReviewHash(draft),
  };

  return {
    receipt,
    ruleSet: DETERMINISTIC_REVIEW_RULESET,
    publishable: verdict === "clear",
  };
}
