import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const scheduler = read("src/services/portfolioVerificationScheduler.ts");
const manifestController = read("src/controllers/ManifestController.ts");
const projectController = read("src/controllers/ProjectController.ts");
const providerFactory = read("src/providers/providerFactory.ts");
const appAuth = read("src/providers/githubAppAuth.ts");
const webhook = read("src/http/webhooks/github.ts");
const reconciler = read("src/worker/reconciler.ts");
const worker = read("src/worker/cf-entry.ts");
const baseController = read("src/controllers/base.ts");
const scheduleMigration = read("supabase/migrations/20260715104718_schedule_portfolio_repository_verification.sql");
const queueMigration = read("supabase/migrations/20260715104852_harden_reconciliation_queue_and_leases.sql");

describe("scheduled portfolio repository verification", () => {
  it("enqueues only enabled active repositories that are due and not already pending", () => {
    expect(scheduler).toContain('.eq("status", "active")');
    expect(scheduler).toContain('.eq("verification_enabled", true)');
    expect(scheduler).toContain('.eq("controller", "ManifestController")');
    expect(scheduler).toContain('.is("completed_at", null)');
    expect(scheduler).toContain("verification_cadence_minutes");
    expect(scheduler).toContain('reason: "periodic_resync"');
  });

  it("runs scheduler and reconciler through the same Cloudflare cron", () => {
    expect(worker).toContain("enqueueDuePortfolioVerification()");
    expect(worker).toContain("runReconcilerCycle }");
    expect(reconciler).toContain('["ManifestController", new ManifestController()]');
  });

  it("keeps the demo outside the main portfolio by database policy", () => {
    expect(scheduleMigration).toContain("verification_enabled = false");
    expect(scheduleMigration).toContain("slug = 'sekret-bip-demo'");
  });
});

describe("provider and schema truth", () => {
  it("prefers repository-scoped GitHub App installation auth", () => {
    expect(providerFactory).toContain("getGitHubInstallationToken");
    expect(providerFactory).toContain("GITHUB_APP_ID");
    expect(providerFactory).toContain("GITHUB_PRIVATE_KEY");
    expect(providerFactory).toContain("GITHUB_TOKEN remains a local/development fallback only");
    expect(appAuth).toContain("apps.getRepoInstallation");
    expect(appAuth).toContain("apps.createInstallationAccessToken");
    expect(appAuth).toContain("repositories: [repository.repo]");
  });

  it("observes projects through the live registry instead of obsolete connection columns", () => {
    expect(projectController).toContain('.from("projects")');
    expect(projectController).toContain("providerForProject");
    expect(projectController).toContain('.from("provider_observations")');
    expect(projectController).not.toContain("project_connections");
    expect(projectController).not.toContain("connection_status");
  });

  it("sanitizes GitHub events before the provider inbox persists them", () => {
    // sanitizeWebhookPayload (src/http/webhooks/sanitize.ts) is the sanitizer
    // actually wired in — its allowlisted-field shape is what
    // ChangeProposalController's normalizePR() depends on (nested
    // pull_request.head.{sha,ref}, title, user.login). The alternate
    // sanitizeGitHubEvent (flat fields, no title/user) would silently break
    // that controller, so it stays unwired dead code.
    expect(webhook).toContain("sanitizeWebhookPayload(eventType, payload)");
  });
});

describe("reconciliation reliability", () => {
  it("uses an ON CONFLICT compatible outbox constraint and atomic lease RPC", () => {
    expect(queueMigration).toContain("not deferrable");
    expect(queueMigration).toContain("try_acquire_controller_lease");
    expect(queueMigration).toContain("where lease.expires_at <= v_now");
    expect(baseController).toContain("supabase.rpc(");
    expect(baseController).toContain("try_acquire_controller_lease");
  });

  it("retries provider failures and never grants automatic write authority", () => {
    expect(manifestController).toContain('return this.retry(message)');
    expect(manifestController).toContain('actionType: "propose_repository_repair_mission"');
    expect(manifestController).toContain("requiresApproval: true");
    expect(manifestController).not.toContain("createBranch(");
    expect(manifestController).not.toContain("integrate(");
    expect(manifestController).not.toContain("deploy(");
  });
});

const fixture = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  enqueue: vi.fn(async (_entry: unknown) => "queued"),
}));

vi.mock("../../events/outbox.js", () => ({ enqueueReconcile: fixture.enqueue }));
vi.mock("../../lib/supabaseClient.js", () => ({
  supabase: {
    from(table: string) {
      let rows = [...(fixture.rows[table] ?? [])];
      const query = {
        select: (_columns: string) => query,
        eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
        not: (key: string, _operator: string, value: unknown) => { rows = rows.filter(row => row[key] !== value); return query; },
        is: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
        order: (key: string, options: { ascending: boolean }) => {
          rows.sort((a, b) => (options.ascending ? 1 : -1) * String(a[key]).localeCompare(String(b[key])));
          return query;
        },
        limit: (count: number) => { rows = rows.slice(0, count); return query; },
        then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return query;
    },
  },
}));

describe("portfolio verification cadence after terminal work", () => {
  const project = {
    id: "fixture-project", slug: "fixture", status: "active",
    verification_enabled: true, repo_identifier: "example/repository",
    verification_cadence_minutes: 15,
  };

  it.each([
    { name: "recent completed work without evidence", minutesAgo: 1, pending: false, freshReceipt: false, expected: 0 },
    { name: "expired completion cooldown", minutesAgo: 16, pending: false, freshReceipt: false, expected: 1 },
    { name: "pending work", minutesAgo: null, pending: true, freshReceipt: false, expected: 0 },
    { name: "no work or evidence", minutesAgo: null, pending: false, freshReceipt: false, expected: 1 },
    { name: "fresh verification evidence", minutesAgo: null, pending: false, freshReceipt: true, expected: 0 },
  ])("respects cadence for $name", async ({ minutesAgo, pending, freshReceipt, expected }) => {
    const now = Date.now();
    fixture.enqueue.mockClear();
    fixture.rows = {
      projects: [project],
      controller_outbox: pending || minutesAgo !== null ? [{
        project_id: project.id, controller: "ManifestController",
        completed_at: pending ? null : new Date(now - (minutesAgo ?? 0) * 60_000).toISOString(),
      }] : [],
      repository_verification_runs: freshReceipt ? [{
        project_id: project.id, received_at: new Date(now).toISOString(),
      }] : [],
    };
    const { enqueueDuePortfolioVerification } = await import("../portfolioVerificationScheduler.js");
    expect(await enqueueDuePortfolioVerification()).toBe(expected);
    expect(fixture.enqueue).toHaveBeenCalledTimes(expected);
  });
});
