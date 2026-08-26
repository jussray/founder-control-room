import fs from "node:fs/promises";
import { providerForProject } from "../dist/providers/providerFactory.js";
import { publishDeterministicReviewWitness } from "../dist/review/deterministicReviewWitnessPublisher.js";

const PROJECT_ID = "founder-control-room";
const PROJECT = {
  repo_provider: "github",
  slug: PROJECT_ID,
  repo_identifier: "jussray/founder-control-room",
};
const FULL_SHA = /^[0-9a-f]{40}$/;

function required(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const rawPullRequestNumber = required("FCR_REVIEW_PR_NUMBER");
if (!/^[1-9]\d*$/.test(rawPullRequestNumber)) {
  throw new Error("FCR_REVIEW_PR_NUMBER must be a positive integer");
}
const pullRequestNumber = Number(rawPullRequestNumber);
if (!Number.isSafeInteger(pullRequestNumber)) {
  throw new Error("FCR_REVIEW_PR_NUMBER exceeds the safe integer range");
}

const trustedMainSha = required("EXPECTED_TRUSTED_MAIN_SHA").toLowerCase();
if (!FULL_SHA.test(trustedMainSha)) {
  throw new Error("EXPECTED_TRUSTED_MAIN_SHA must be a lowercase full commit SHA");
}

const provider = providerForProject(PROJECT);
const result = await publishDeterministicReviewWitness({
  provider,
  projectId: PROJECT_ID,
  pullRequestNumber,
});

await fs.mkdir("artifacts", { recursive: true });
const artifact = {
  schema: "fcr/deterministic-review-witness-run@v1",
  trustedMainSha,
  pullRequestNumber,
  generatedAt: new Date().toISOString(),
  production: result.production,
  signal: result.signal,
};
await fs.writeFile(
  "artifacts/deterministic-review-witness.json",
  `${JSON.stringify(artifact, null, 2)}\n`,
  "utf8",
);

console.log(`Deterministic review witness published for PR #${pullRequestNumber}`);
console.log(`head=${result.production.receipt.headSha}`);
console.log(`reviewHash=${result.production.receipt.reviewHash}`);
console.log(`signal=${result.signal.name}`);
