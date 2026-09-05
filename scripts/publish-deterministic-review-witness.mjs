import fs from "node:fs/promises";
import { createGitHubAppJwt } from "../dist/providers/githubAppAuth.js";
import { providerForProject } from "../dist/providers/providerFactory.js";
import { publishDeterministicReviewWitness } from "../dist/review/deterministicReviewWitnessPublisher.js";

const PROJECT_ID = "founder-control-room";
const PROJECT = {
  repo_provider: "github",
  slug: PROJECT_ID,
  repo_identifier: "jussray/founder-control-room",
};
const FULL_SHA = /^[0-9a-f]{40}$/;
const ARTIFACT_PATH = "artifacts/deterministic-review-witness.json";

function required(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function classifyFailure(error, stage) {
  const message = error instanceof Error ? error.message : "";

  if (/GITHUB_PRIVATE_KEY/.test(message)) {
    return {
      reasonCode: "GITHUB_APP_PRIVATE_KEY_INVALID",
      summary: "GitHub App private key failed local cryptographic preflight.",
    };
  }
  if (/GITHUB_APP_ID/.test(message)) {
    return {
      reasonCode: "GITHUB_APP_ID_INVALID",
      summary: "GitHub App identifier failed local credential preflight.",
    };
  }
  if (/PR identity moved/.test(message)) {
    return {
      reasonCode: "PULL_REQUEST_IDENTITY_MOVED",
      summary: "Pull request identity moved while the deterministic review witness was executing.",
    };
  }
  if (/not publishable/.test(message)) {
    return {
      reasonCode: "REVIEW_NOT_PUBLISHABLE",
      summary: "Deterministic review result was not eligible for trusted witness publication.",
    };
  }
  if (/readback is missing/.test(message)) {
    return {
      reasonCode: "PROVIDER_READBACK_MISSING",
      summary: "Trusted provider readback did not prove the exact published witness.",
    };
  }

  return {
    reasonCode: "DETERMINISTIC_REVIEW_WITNESS_FAILED",
    summary: `Trusted deterministic review witness failed during ${stage}.`,
  };
}

async function writeArtifact(artifact) {
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

let stage = "input_validation";
let trustedMainSha = null;
let pullRequestNumber = null;

try {
  const rawPullRequestNumber = required("FCR_REVIEW_PR_NUMBER");
  if (!/^[1-9]\d*$/.test(rawPullRequestNumber)) {
    throw new Error("FCR_REVIEW_PR_NUMBER must be a positive integer");
  }
  pullRequestNumber = Number(rawPullRequestNumber);
  if (!Number.isSafeInteger(pullRequestNumber)) {
    throw new Error("FCR_REVIEW_PR_NUMBER exceeds the safe integer range");
  }

  trustedMainSha = required("EXPECTED_TRUSTED_MAIN_SHA").toLowerCase();
  if (!FULL_SHA.test(trustedMainSha)) {
    throw new Error("EXPECTED_TRUSTED_MAIN_SHA must be a lowercase full commit SHA");
  }

  stage = "credential_preflight";
  const appId = required("GITHUB_APP_ID");
  const privateKey = required("GITHUB_PRIVATE_KEY");
  createGitHubAppJwt(appId, privateKey);

  stage = "provider_review";
  const provider = providerForProject(PROJECT);
  const result = await publishDeterministicReviewWitness({
    provider,
    projectId: PROJECT_ID,
    pullRequestNumber,
  });

  stage = "success_receipt";
  await writeArtifact({
    schema: "fcr/deterministic-review-witness-run@v1",
    status: "published",
    trustedMainSha,
    pullRequestNumber,
    generatedAt: new Date().toISOString(),
    production: result.production,
    signal: result.signal,
  });

  console.log(`Deterministic review witness published for PR #${pullRequestNumber}`);
  console.log(`head=${result.production.receipt.headSha}`);
  console.log(`reviewHash=${result.production.receipt.reviewHash}`);
  console.log(`signal=${result.signal.name}`);
} catch (error) {
  const failure = classifyFailure(error, stage);

  try {
    await writeArtifact({
      schema: "fcr/deterministic-review-witness-run@v1",
      status: "failed",
      trustedMainSha,
      pullRequestNumber,
      generatedAt: new Date().toISOString(),
      failure: {
        stage,
        reasonCode: failure.reasonCode,
        summary: failure.summary,
      },
    });
  } catch {
    console.error("Unable to retain sanitized deterministic review failure receipt.");
  }

  throw error;
}
