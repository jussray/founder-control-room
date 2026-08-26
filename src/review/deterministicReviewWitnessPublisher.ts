import type {
  PullRequestReviewContext,
  RepositoryProvider,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import {
  INDEPENDENT_REVIEW_CONTRACT,
  expectedReviewSignalName,
  independentReviewHash,
  type IndependentReviewReceipt,
} from "./independentReviewGate.js";

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
  trustedGitHubAppId: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function assertPublishableReceipt(receipt: IndependentReviewReceipt): void {
  if (receipt?.contract !== INDEPENDENT_REVIEW_CONTRACT) {
    throw new Error("Deterministic review witness requires the canonical independent-review receipt contract");
  }
  if (receipt?.reviewer?.kind !== "deterministic") {
    throw new Error("Deterministic review witness requires reviewer.kind=deterministic");
  }
  if (!FULL_SHA.test(text(receipt?.baseSha)) || !FULL_SHA.test(text(receipt?.headSha))) {
    throw new Error("Deterministic review witness requires full base/head SHAs");
  }
  if (receipt?.verdict !== "clear" || (receipt?.findings?.length ?? 0) !== 0) {
    throw new Error("Blocked or unresolved deterministic review must not publish a passed witness");
  }
  if (
    receipt?.proposalOnly !== true
    || receipt?.mergeAuthorized !== false
    || receipt?.executionAuthorized !== false
  ) {
    throw new Error("Deterministic review witness accepts proposal-only non-authorizing receipts only");
  }
  if (independentReviewHash(receipt) !== lower(receipt?.reviewHash)) {
    throw new Error("Deterministic review witness receipt hash does not match receipt content");
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
    throw new Error("Deterministic review witness repository changed after review");
  }
  if (lower(context.baseSha) !== lower(receipt.baseSha)) {
    throw new Error("Deterministic review witness base changed after review");
  }
  if (lower(context.headSha) !== lower(receipt.headSha)) {
    throw new Error("Deterministic review witness head changed after review");
  }
  if (lower(context.authorIdentity) !== lower(receipt.authorIdentity)) {
    throw new Error("Deterministic review witness author identity changed after review");
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
  const trustedGitHubAppId = text(input.trustedGitHubAppId);
  if (!NUMERIC_ID.test(trustedGitHubAppId)) {
    throw new Error("Deterministic review witness publisher requires a numeric trusted GitHub App id");
  }
  assertPublishableReceipt(input.receipt);

  if (!input.provider.getPullRequestReviewContext) {
    throw new Error("Repository provider cannot supply pull-request review context for witness publication");
  }
  const context = await input.provider.getPullRequestReviewContext(
    input.projectId,
    input.receipt.pullRequestNumber,
  );
  assertContextMatchesReceipt(context, input.receipt);

  const [currentBaseSha, currentHeadSha] = await Promise.all([
    input.provider.resolveRef(input.projectId, context.baseRef),
    input.provider.resolveRef(input.projectId, context.headRef),
  ]);
  if (lower(currentBaseSha) !== lower(input.receipt.baseSha)) {
    throw new Error("Deterministic review witness base moved before publication");
  }
  if (lower(currentHeadSha) !== lower(input.receipt.headSha)) {
    throw new Error("Deterministic review witness head moved before publication");
  }

  const signalName = expectedReviewSignalName(input.receipt);
  await input.provider.publishVerificationSignal(input.projectId, {
    name: signalName,
    commitSha: lower(input.receipt.headSha),
    status: "passed",
    summary: `${input.receipt.reviewer.runtime}: clear deterministic review receipt ${input.receipt.reviewHash}`,
  });

  const signals = await input.provider.listVerificationSignals(
    input.projectId,
    input.receipt.headSha,
  );
  const signal = signals.find((candidate) =>
    matchingWitness(candidate, signalName, input.receipt, trustedGitHubAppId));
  if (!signal) {
    throw new Error(
      "Deterministic review witness publication could not be verified with the exact head, signal name, passed state, and trusted GitHub App issuer",
    );
  }

  return {
    receipt: input.receipt,
    signal,
    signalName,
    issuerAppId: trustedGitHubAppId,
    mergeAuthorized: false,
    executionAuthorized: false,
  };
}
