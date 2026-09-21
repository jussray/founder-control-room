import { Octokit } from "@octokit/rest";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const GITHUB_API_VERSION = "2026-03-10";
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_POLL_ATTEMPTS = 120;

interface AsyncMergeDetails {
  message?: string;
  sha?: string;
  uuid?: string;
  expected_head_sha?: string;
}

interface AsyncMergePayload {
  status?: string;
  details?: AsyncMergeDetails;
}

export interface GitHubAsyncMergeOptions {
  token: string;
  repository: string;
  pullRequestNumber: number;
  expectedHeadSha: string;
  baseUrl?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function payload(value: unknown): AsyncMergePayload {
  const root = record(value) ?? {};
  const details = record(root["details"]);
  return {
    status: typeof root["status"] === "string" ? root["status"] : undefined,
    details: details
      ? {
          message: typeof details["message"] === "string" ? details["message"] : undefined,
          sha: typeof details["sha"] === "string" ? details["sha"] : undefined,
          uuid: typeof details["uuid"] === "string" ? details["uuid"] : undefined,
          expected_head_sha: typeof details["expected_head_sha"] === "string"
            ? details["expected_head_sha"]
            : undefined,
        }
      : undefined,
  };
}

function errorStatus(error: unknown): number | null {
  const candidate = record(error);
  return typeof candidate?.["status"] === "number" ? candidate["status"] as number : null;
}

function errorPayload(error: unknown): AsyncMergePayload {
  const candidate = record(error);
  const response = record(candidate?.["response"]);
  return payload(response?.["data"]);
}

function splitRepository(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.trim().split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new Error(`GitHub async merge received malformed repository: ${repository}`);
  }
  return { owner, repo };
}

function mergedSha(result: AsyncMergePayload): string | null {
  if (result.status !== "merged") return null;
  const sha = result.details?.sha?.toLowerCase() ?? "";
  if (!FULL_SHA.test(sha)) {
    throw new Error("GitHub async merge reported merged without a valid merge SHA");
  }
  return sha;
}

function requestUuid(result: AsyncMergePayload): string | null {
  const uuid = result.details?.uuid?.trim() ?? "";
  return uuid || null;
}

function expectedHeadSha(result: AsyncMergePayload): string | null {
  const sha = result.details?.expected_head_sha?.trim().toLowerCase() ?? "";
  return FULL_SHA.test(sha) ? sha : null;
}

function assertReconciledHead(
  pullRequestNumber: number,
  result: AsyncMergePayload,
  approvedHeadSha: string,
  context: string,
): void {
  const observedHeadSha = expectedHeadSha(result);
  if (!observedHeadSha) {
    throw new Error(
      `GitHub async merge for pull request #${pullRequestNumber} cannot ${context} without a valid expected_head_sha`,
    );
  }
  if (observedHeadSha !== approvedHeadSha) {
    throw new Error(
      `GitHub async merge for pull request #${pullRequestNumber} ${context} is bound to ${observedHeadSha}, not approved head ${approvedHeadSha}`,
    );
  }
}

function terminalFailureMessage(
  pullRequestNumber: number,
  result: AsyncMergePayload,
): string {
  const status = result.status || "unknown";
  const message = result.details?.message || "provider returned no failure message";
  return `GitHub async merge for pull request #${pullRequestNumber} ended ${status}: ${message}`;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes GitHub's asynchronous pull-request merge API and waits for a
 * terminal provider result. This is required for stacked pull requests and is
 * also safe for ordinary PRs. The exact approved head SHA is always supplied
 * to GitHub, so head movement between enqueue and execution cancels the merge.
 */
export async function mergeGitHubPullRequestAsync(
  options: GitHubAsyncMergeOptions,
): Promise<string> {
  const token = options.token.trim();
  if (!token) throw new Error("GitHub async merge requires a repository credential");
  if (!Number.isInteger(options.pullRequestNumber) || options.pullRequestNumber <= 0) {
    throw new Error("GitHub async merge requires a positive pull request number");
  }

  const approvedHeadSha = options.expectedHeadSha.trim().toLowerCase();
  if (!FULL_SHA.test(approvedHeadSha)) {
    throw new Error("GitHub async merge requires a full 40-character expected head SHA");
  }

  const { owner, repo } = splitRepository(options.repository);
  const client = new Octokit({
    auth: token,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": GITHUB_API_VERSION,
  };

  let initial: AsyncMergePayload;
  let reconciledExistingRequest = false;
  try {
    const response = await client.request(
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async",
      {
        owner,
        repo,
        pull_number: options.pullRequestNumber,
        sha: approvedHeadSha,
        merge_action: "default",
        headers,
      },
    );
    initial = payload(response.data);
  } catch (error) {
    if (errorStatus(error) !== 409) throw error;
    initial = errorPayload(error);
    reconciledExistingRequest = true;
  }

  const immediateSha = mergedSha(initial);
  if (immediateSha) return immediateSha;

  if (reconciledExistingRequest) {
    assertReconciledHead(
      options.pullRequestNumber,
      initial,
      approvedHeadSha,
      "reconcile an existing request",
    );
  }

  const uuid = requestUuid(initial);
  if (!uuid) {
    throw new Error(
      `GitHub async merge for pull request #${options.pullRequestNumber} returned ${initial.status || "unknown"} without a reconciliation UUID`,
    );
  }

  const pollIntervalMs = Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const maxPollAttempts = Math.max(1, options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS);

  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    if (attempt > 0) await sleep(pollIntervalMs);
    const response = await client.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/merge-async/{uuid}",
      {
        owner,
        repo,
        pull_number: options.pullRequestNumber,
        uuid,
        headers,
      },
    );
    const current = payload(response.data);
    const sha = mergedSha(current);
    if (sha) return sha;
    if (current.status === "pending") {
      assertReconciledHead(
        options.pullRequestNumber,
        current,
        approvedHeadSha,
        "continue a pending request",
      );
      continue;
    }
    throw new Error(terminalFailureMessage(options.pullRequestNumber, current));
  }

  throw new Error(
    `GitHub async merge for pull request #${options.pullRequestNumber} is still pending after ${maxPollAttempts} polls (uuid=${uuid}); reconcile this UUID before any retry`,
  );
}
