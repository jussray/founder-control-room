import { SecurityPreservingGitHubProvider } from "./SecurityPreservingGitHubProvider.js";
import type { GitHubProviderConfig } from "./GitHubProvider.js";
import type {
  DeterministicReviewWitnessPublication,
  VerificationSignal,
  VerificationSignalStatus,
} from "./RepositoryProvider.js";

const FCR_REPOSITORY = "jussray/founder-control-room";
const REVIEWER_ID = "fcr-deterministic-review-v1";
const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const MAX_SUMMARY_LENGTH = 65_535;

export interface DeterministicReviewGitHubProviderDependencies {
  /** Explicit test transport. Supplying this is the only way a custom API base may exercise witness publication. */
  fetchFn?: typeof fetch;
}

interface CheckRunReadback {
  id?: number | string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_sha?: string;
  external_id?: string | null;
  app?: { id?: number | string | null; slug?: string | null } | null;
  started_at?: string | null;
  completed_at?: string | null;
  details_url?: string | null;
}

function mapCheckStatus(status: string, conclusion: string | null): VerificationSignalStatus {
  if (status === "queued" || status === "requested" || status === "waiting") return "queued";
  if (status === "in_progress" || status === "pending") return "running";
  if (status !== "completed") return "unknown";
  switch (conclusion) {
    case "success":
    case "neutral":
      return "passed";
    case "skipped":
      return "skipped";
    case "cancelled":
    case "stale":
      return "cancelled";
    case "failure":
    case "timed_out":
    case "action_required":
    case "startup_failure":
      return "failed";
    default:
      return "unknown";
  }
}

/**
 * GitHub provider capability that can mint exactly one deterministic-review
 * witness shape. The caller cannot choose a generic check conclusion or a
 * different reviewer identity. Production construction is restricted to a
 * repository-scoped GitHub App installation token by providerFactory.
 */
export class DeterministicReviewGitHubProvider extends SecurityPreservingGitHubProvider {
  private readonly reviewToken: string;
  private readonly reviewProjectMap: Record<string, string>;
  private readonly reviewApiBaseUrl: string;
  private readonly reviewFetch: typeof fetch;
  private readonly reviewUsesInjectedTestTransport: boolean;

  constructor(
    config: GitHubProviderConfig,
    dependencies: DeterministicReviewGitHubProviderDependencies = {},
  ) {
    super(config);
    this.reviewToken = config.token;
    this.reviewProjectMap = config.projectMap;
    this.reviewApiBaseUrl = (config.baseUrl?.trim() || DEFAULT_GITHUB_API_BASE_URL).replace(/\/$/, "");
    this.reviewFetch = dependencies.fetchFn ?? fetch;
    this.reviewUsesInjectedTestTransport = dependencies.fetchFn !== undefined;
  }

  private locateReviewRepository(projectId: string): { owner: string; repo: string } {
    const locator = this.reviewProjectMap[projectId]?.trim() ?? "";
    if (locator.toLowerCase() !== FCR_REPOSITORY) {
      throw new Error(
        "DeterministicReviewGitHubProvider: deterministic witness publication is restricted to Founder Control Room",
      );
    }
    const [owner, repo, ...rest] = locator.split("/");
    if (!owner || !repo || rest.length > 0) {
      throw new Error(`DeterministicReviewGitHubProvider: malformed repository locator '${locator}'`);
    }
    return { owner, repo };
  }

  private reviewHeaders(): Record<string, string> {
    return {
      authorization: `Bearer ${this.reviewToken}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    };
  }

  override async listVerificationSignals(projectId: string, ref: string): Promise<VerificationSignal[]> {
    const { owner, repo } = this.locateReviewRepository(projectId);
    const requestedRef = ref.trim();
    if (!requestedRef) {
      throw new Error("DeterministicReviewGitHubProvider: verification-signal ref is required");
    }

    const response = await this.reviewFetch(
      `${this.reviewApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(requestedRef)}/check-runs?per_page=100&filter=latest`,
      { method: "GET", headers: this.reviewHeaders() },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 4_096).trim();
      throw new Error(
        `DeterministicReviewGitHubProvider: GitHub Check Run readback failed with ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    const payload = await response.json() as { check_runs?: CheckRunReadback[] };
    const runs = Array.isArray(payload.check_runs) ? payload.check_runs : [];
    return runs.map((run) => ({
      id: String(run.id ?? ""),
      name: String(run.name ?? ""),
      status: mapCheckStatus(String(run.status ?? ""), run.conclusion ?? null),
      commitSha: String(run.head_sha ?? ""),
      provider: this.name,
      evidenceFingerprint: typeof run.external_id === "string" && run.external_id.trim()
        ? run.external_id.trim().toLowerCase()
        : undefined,
      issuer: run.app?.id != null
        ? {
            kind: "app" as const,
            id: String(run.app.id),
            name: run.app.slug ?? undefined,
          }
        : undefined,
      startedAt: run.started_at ?? undefined,
      completedAt: run.completed_at ?? undefined,
      detailsUrl: run.details_url ?? undefined,
    }));
  }

  async publishDeterministicReviewWitness(
    projectId: string,
    publication: DeterministicReviewWitnessPublication,
  ): Promise<void> {
    if (
      this.reviewApiBaseUrl.toLowerCase() !== DEFAULT_GITHUB_API_BASE_URL
      && !this.reviewUsesInjectedTestTransport
    ) {
      throw new Error(
        "DeterministicReviewGitHubProvider: custom GitHub API base URL is test-only for deterministic witness publication",
      );
    }

    const { owner, repo } = this.locateReviewRepository(projectId);
    const headSha = publication.headSha.trim().toLowerCase();
    const reviewHash = publication.reviewHash.trim().toLowerCase();
    const summary = publication.summary.trim();

    if (!FULL_SHA.test(headSha)) {
      throw new Error("DeterministicReviewGitHubProvider: witness headSha must be a full commit SHA");
    }
    if (!SHA256.test(reviewHash)) {
      throw new Error("DeterministicReviewGitHubProvider: witness reviewHash must be sha256");
    }
    const expectedName = `Independent Review / ${REVIEWER_ID} / ${reviewHash.slice(0, 12)}`;
    if (publication.name !== expectedName) {
      throw new Error("DeterministicReviewGitHubProvider: witness name is not bound to the full review hash");
    }
    if (!summary || summary.length > MAX_SUMMARY_LENGTH) {
      throw new Error("DeterministicReviewGitHubProvider: witness summary is empty or exceeds the provider bound");
    }

    const response = await this.reviewFetch(
      `${this.reviewApiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs`,
      {
        method: "POST",
        headers: this.reviewHeaders(),
        body: JSON.stringify({
          name: expectedName,
          head_sha: headSha,
          status: "completed",
          conclusion: "success",
          external_id: reviewHash,
          output: {
            title: "Deterministic independent review",
            summary,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 4_096).trim();
      throw new Error(
        `DeterministicReviewGitHubProvider: GitHub Check Run publication failed with ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }
  }
}
