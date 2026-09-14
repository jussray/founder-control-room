import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Diff,
  PullRequestReviewContext,
  RepositoryProvider,
} from "../providers/RepositoryProvider.js";
import { publishDeterministicReviewWitness } from "./deterministicReviewWitnessPublisher.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const OTHER_HEAD = "c".repeat(40);
const TRUSTED_APP_ID = "12345";

const context: PullRequestReviewContext = {
  number: 747,
  repository: "jussray/founder-control-room",
  headRepository: "jussray/founder-control-room",
  baseRef: "main",
  headRef: "candidate",
  baseSha: BASE,
  headSha: HEAD,
  authorIdentity: "jussray",
};

const clearDiff: Diff = {
  base: BASE,
  head: HEAD,
  aheadBy: 1,
  behindBy: 0,
  files: [{
    path: "src/example.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    patch: "@@ -1 +1 @@\n-old\n+new",
  }],
};

beforeEach(() => {
  vi.stubEnv("GITHUB_APP_ID", TRUSTED_APP_ID);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deterministic review witness founder-bound head", () => {
  it("fails before publication when provider review identity differs from the dispatched exact head", async () => {
    const publish = vi.fn();
    const provider = {
      name: "github",
      getPullRequestReviewContext: async () => context,
      resolveRef: async (_projectId: string, ref: string) => ref === "main" ? BASE : HEAD,
      compare: async () => clearDiff,
      listVerificationSignals: async () => [],
      getRef: async () => ({ name: HEAD, commitSha: HEAD }),
      publishDeterministicReviewWitness: publish,
    } as unknown as RepositoryProvider;

    await expect(publishDeterministicReviewWitness({
      provider,
      projectId: "founder-control-room",
      pullRequestNumber: 747,
      expectedHeadSha: OTHER_HEAD,
    })).rejects.toThrow(/founder-bound expected head/i);

    expect(publish).not.toHaveBeenCalled();
  });
});
