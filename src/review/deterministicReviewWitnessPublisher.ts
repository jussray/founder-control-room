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
const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface DeterministicReviewWitnessInput {
  provider: RepositoryProvider;
  projectId: string;
  pullRequestNumber: number;
  expectedHeadSha?: string;
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

function assertFounderBoundExpectedHead(
  receipt: IndependentReviewReceipt,
  expectedHeadSha: string | undefined,
): void {
  if (expectedHeadSha === undefined) return;
  const expected = lower(expectedHeadSha);
  if (!FULL_SHA.test(expected)) {
    throw new Error("Deterministic review witness founder-bound expected head must be a full commit SHA");
  }
  if (lower(receipt.headSha) !== expected) {
    throw new Error(
      "Deterministic review PR identity moved before witness publication; founder-bound expected head does not match provider review head",
    );
  }
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
 * Produces deterministic review from provider truth, reconciles any already
 * published exact receipt/hash witness before creating another provider object,
 * publishes only a clear receipt's derived exact-head witness through the
 * repository provider's narrow App-only capability when needed, then accepts
 * success only from provider readback under the server-owned GitHub App
 * identity and the full provider evidence fingerprint.
 *
 * When a founder-bound expected head is supplied, the derived provider receipt
 * must match that exact head before any Check Run publication can occur. This
 * closes the dispatch-to-publisher race without allowing caller-supplied review
 * content, verdicts, check names, or publisher identity.
 *
 * Reconcile-before-create is load-bearing for retry safety: if a prior request
 * created the Check Run but failed during later readback, a retry rederives the
 * same receipt and reuses the trusted exact witness instead of posting a
 * duplicate. A failed pre-publication readback performs no provider mutation.
 *
 * This function never accepts a caller-supplied receipt, reviewer identity,
 * verdict, check name, conclusion, publisher, or trusted App identity. The
 * optional expected head is only an equality constraint on provider-derived
 * identity. It remains proposal-only and does not grant merge, execution,
 * deployment, or founder authority.
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

  assertFounderBoundExpectedHead(receipt, input.expectedHeadSha);

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
  const existingSignals = await input.provider.listVerificationSignals(input.projectId, receipt.headSha);
  const existingSignal = matchingTrustedSignal(
    existingSignals,
    receipt,
    input.provider.name,
    expectedAppId,
  );
  if (existingSignal) {
    const afterReconcile = await input.provider.getPullRequestReviewContext(
      input.projectId,
      input.pullRequestNumber,
    );
    assertContextStillMatches(afterReconcile, receipt, "after");
    return { production, signal: existingSignal };
  }

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
