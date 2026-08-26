import type {
  PullRequestReviewContext,
  RepositoryProvider,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import {
  INDEPENDENT_REVIEW_CONTRACT,
  expectedReviewSignalName,
  type IndependentReviewReceipt,
} from "./independentReviewGate.js";
import { produceDeterministicReview } from "./deterministicReviewProducer.js";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const NUMERIC_ID = /^\d+$/;

export interface VerificationSignalPublication {
  name: string;
  commitSha: string;
  status: "passed";
  summary: string;
}

export interface VerificationSignalPublishingProvider extends RepositoryProvider {
  publishVerificationSignal(
    projectId: string,
    publication: VerificationSignalPublication,
  ): Promise<void>;
}

export interface DeterministicReviewWitnessPublication {
  receipt: IndependentReviewReceipt;
  signal: VerificationSignal;
  signalName: string;
  issuerAppId: string;
  mergeAuthorized: false;
  executionAuthorized: false;
}

export interface DeterministicReviewWitnessPublisherInput {
  provider: VerificationSignalPublishingProvider;
  projectId: string;
  receipt: IndependentReviewReceipt;
  /** Test injection only. Production callers must use the server-owned process environment. */
  env?: NodeJS.ProcessEnv;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function assertCallerReceiptEnvelope(receipt: IndependentReviewReceipt): void {
  if (receipt?.contract !== INDEPENDENT_REVIEW_CONTRACT) {
    throw new Error("Deterministic review witness requires the canonical independent-review receipt contract");
  }
  if (receipt?.reviewer?.kind !== "deterministic") {
    throw new Error("Deterministic review witness requires reviewer.kind=deterministic");
  }
  if (!FULL_SHA.test(text(receipt?.baseSha)) || !FULL_SHA.test(text(receipt?.headSha))) {
    throw new Error("Deterministic review witness requires full base/head SHAs");
  }
  if (
    receipt?.proposalOnly !== true
    || receipt?.mergeAuthorized !== false
    || receipt?.executionAuthorized !== false
  ) {
    throw new Error("Deterministic review witness accepts proposal-only non-authorizing receipts only");
  }
}

function assertContextMatchesReceipt(
  context: PullRequestReviewContext,
  receipt: IndependentReviewReceipt,
): void {
  if (context.number !== receipt.pullRequestNumber) {
    throw new Error("Deterministic review witness provider returned the wrong pull request");
  }
  if (lower(context.repository) !== lower(receipt.repository)) {
    throw new Error("Deterministic review witness repository changed after trusted review");
  }
  if (lower(context.baseSha) !== lower(receipt.baseSha)) {
    throw new Error("Deterministic review witness base changed after trusted review");
  }
  if (lower(context.headSha) !== lower(receipt.headSha)) {
    throw new Error("Deterministic review witness head changed after trusted review");
  }
  if (lower(context.authorIdentity) !== lower(receipt.authorIdentity)) {
    throw new Error("Deterministic review witness author identity changed after trusted review");
  }
}

function matchingWitness(
  signal: VerificationSignal,
  name: string,
  receipt: IndependentReviewReceipt,
  trustedGitHubAppId: string,
): boolean {
  return lower(signal.provider) === "github"
    && signal.name === name
    && signal.status === "passed"
    && lower(signal.commitSha) === lower(receipt.headSha)
    && signal.issuer?.kind === "app"
    && signal.issuer.id === trustedGitHubAppId;
}

export async function publishDeterministicReviewWitness(
  input: DeterministicReviewWitnessPublisherInput,
): Promise<DeterministicReviewWitnessPublication> {
  if (lower(input.provider?.name) !== "github") {
    throw new Error("Deterministic review witness publisher currently requires the GitHub repository provider");
  }
  const env = input.env ?? process.env;
  const trustedGitHubAppId = text(env.GITHUB_APP_ID);
  if (!NUMERIC_ID.test(trustedGitHubAppId)) {
    throw new Error("Deterministic review witness publisher requires numeric server-owned GITHUB_APP_ID");
  }
  assertCallerReceiptEnvelope(input.receipt);

  // Receipt hashes are identities, not authentication. Re-run the trusted
  // deterministic producer against fresh provider truth immediately before
  // publication so a caller cannot choose reviewer identity, runtime, policy,
  // diff hash, findings, verdict, or stale base/head and simply recompute a hash.
  const production = await produceDeterministicReview({
    provider: input.provider,
    projectId: input.projectId,
    pullRequestNumber: input.receipt.pullRequestNumber,
  });
  if (!production.publishable) {
    throw new Error("Blocked or unresolved deterministic review must not publish a passed witness");
  }
  if (lower(production.receipt.reviewHash) !== lower(input.receipt.reviewHash)) {
    throw new Error(
      "Deterministic review witness receipt is stale or was not derived from current trusted producer truth",
    );
  }

  const receipt = production.receipt;
  if (!input.provider.getPullRequestReviewContext) {
    throw new Error("Repository provider cannot supply pull-request review context for witness publication");
  }

  // Last-moment TOCTOU membrane. The trusted producer performed its own exact
  // readback, but a mutable base/head can still move between that review and
  // the provider write. Re-read PR identity and both refs immediately before
  // publishing the passed Check Run.
  const context = await input.provider.getPullRequestReviewContext(
    input.projectId,
    receipt.pullRequestNumber,
  );
  assertContextMatchesReceipt(context, receipt);
  const [currentBaseSha, currentHeadSha] = await Promise.all([
    input.provider.resolveRef(input.projectId, context.baseRef),
    input.provider.resolveRef(input.projectId, context.headRef),
  ]);
  if (lower(currentBaseSha) !== lower(receipt.baseSha)) {
    throw new Error("Deterministic review witness base moved after trusted review and before publication");
  }
  if (lower(currentHeadSha) !== lower(receipt.headSha)) {
    throw new Error("Deterministic review witness head moved after trusted review and before publication");
  }

  const signalName = expectedReviewSignalName(receipt);
  await input.provider.publishVerificationSignal(input.projectId, {
    name: signalName,
    commitSha: lower(receipt.headSha),
    status: "passed",
    summary: `${receipt.reviewer.runtime}: clear deterministic review receipt ${receipt.reviewHash}`,
  });

  const signals = await input.provider.listVerificationSignals(
    input.projectId,
    receipt.headSha,
  );
  const signal = signals.find((candidate) =>
    matchingWitness(candidate, signalName, receipt, trustedGitHubAppId));
  if (!signal) {
    throw new Error(
      "Deterministic review witness publication could not be verified with the exact head, signal name, passed state, and trusted GitHub App issuer",
    );
  }

  return {
    receipt,
    signal,
    signalName,
    issuerAppId: trustedGitHubAppId,
    mergeAuthorized: false,
    executionAuthorized: false,
  };
}
