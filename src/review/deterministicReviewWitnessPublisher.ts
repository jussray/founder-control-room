import type {
  PullRequestReviewContext,
  RepositoryProvider,
  VerificationSignal,
} from "../providers/RepositoryProvider.js";
import {
  expectedReviewSignalName,
  type IndependentReviewReceipt,
} from "./independentReviewGate.js";
import {
  produceDeterministicReview,
  type DeterministicReviewProduction,
} from "./deterministicReviewProducer.js";

const FCR_REPOSITORY = "jussray/founder-control-room";
const FCR_BASE_REF = "main";
const TRUSTED_APP_ENV = "GITHUB_APP_ID";

export interface DeterministicReviewWitnessInput {
  provider: RepositoryProvider;
  projectId: string;
  pullRequestNumber: number;
}

export interface DeterministicReviewWitnessResult {
  production: DeterministicReviewProduction;
  signal: VerificationSignal;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function trustedAppId(): string {
  const value = text(process.env[TRUSTED_APP_ENV]);
  if (!/^\d+$/.test(value)) {
    throw new Error(`Deterministic review witness publishing requires numeric server-owned ${TRUSTED_APP_ENV}`);
  }
  return value;
}

function assertContextStillMatches(
  context: PullRequestReviewContext,
  receipt: IndependentReviewReceipt,
  stage: "before" | "after",
): void {
  const matches = context.number === receipt.pullRequestNumber
    && lower(context.repository) === FCR_REPOSITORY
    && lower(context.headRepository) === FCR_REPOSITORY
    && context.baseRef === FCR_BASE_REF
    && text(context.headRef).length > 0
    && lower(context.baseSha) === lower(receipt.baseSha)
    && lower(context.headSha) === lower(receipt.headSha)
    && lower(context.authorIdentity) === lower(receipt.authorIdentity);

  if (!matches) {
    throw new Error(
      `Deterministic review PR identity moved ${stage} witness publication; the receipt/check pair is historical and cannot be reported current`,
    );
  }
}

function matchingTrustedSignal(
  signals: VerificationSignal[],
  receipt: IndependentReviewReceipt,
  providerName: string,
  expectedAppId: string,
): VerificationSignal | null {
  const expectedName = expectedReviewSignalName(receipt);
  return signals.find((signal) =>
    lower(signal.provider) === lower(providerName)
    && signal.name === expectedName
    && signal.status === "passed"
    && lower(signal.commitSha) === lower(receipt.headSha)
    && lower(signal.evidenceFingerprint) === lower(receipt.reviewHash)
    && signal.issuer?.kind === "app"
    && signal.issuer.id === expectedAppId,
  ) ?? null;
}

/**
 * Produces deterministic review from provider truth, publishes only a clear
 * receipt's derived exact-head witness through the repository provider's
 * narrow App-only capability, then accepts success only from provider readback
 * under the server-owned GitHub App identity and the full provider evidence
 * fingerprint.
 *
 * This function never accepts a caller-supplied receipt, reviewer identity,
 * verdict, check name, conclusion, head SHA, publisher, or trusted App identity.
 * It remains proposal-only and does not grant merge, execution, deployment, or
 * founder authority.
 */
export async function publishDeterministicReviewWitness(
  input: DeterministicReviewWitnessInput,
): Promise<DeterministicReviewWitnessResult> {
  if (!input.provider.getPullRequestReviewContext) {
    throw new Error("Deterministic review witness publishing requires provider-backed PR context");
  }
  if (!input.provider.publishDeterministicReviewWitness) {
    throw new Error("Deterministic review witness publishing requires server-owned GitHub App provider authority");
  }

  const expectedAppId = trustedAppId();
  const production = await produceDeterministicReview({
    provider: input.provider,
    projectId: input.projectId,
    pullRequestNumber: input.pullRequestNumber,
  });
  const { receipt } = production;

  if (!production.publishable || receipt.verdict !== "clear" || receipt.findings.some((finding) => finding.severity !== "P3")) {
    throw new Error(
      `Deterministic review witness is not publishable: verdict=${receipt.verdict}, findings=${receipt.findings.length}`,
    );
  }

  const beforePublish = await input.provider.getPullRequestReviewContext(
    input.projectId,
    input.pullRequestNumber,
  );
  assertContextStillMatches(beforePublish, receipt, "before");

  const name = expectedReviewSignalName(receipt);
  await input.provider.publishDeterministicReviewWitness(input.projectId, {
    headSha: receipt.headSha,
    name,
    reviewHash: receipt.reviewHash,
    summary: receipt.summary,
  });

  const signals = await input.provider.listVerificationSignals(input.projectId, receipt.headSha);
  const signal = matchingTrustedSignal(signals, receipt, input.provider.name, expectedAppId);
  if (!signal) {
    throw new Error(
      `Deterministic review witness readback is missing exact passed signal '${name}' with full receipt fingerprint from trusted GitHub App ${expectedAppId}`,
    );
  }

  const afterPublish = await input.provider.getPullRequestReviewContext(
    input.projectId,
    input.pullRequestNumber,
  );
  assertContextStillMatches(afterPublish, receipt, "after");

  return { production, signal };
}
