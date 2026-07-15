import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const scheduler = read("src/services/portfolioVerificationScheduler.ts");
const controller = read("src/controllers/ManifestController.ts");
const reconciler = read("src/worker/reconciler.ts");
const worker = read("src/worker/cf-entry.ts");
const outbox = read("src/events/outbox.ts");
const baseController = read("src/controllers/base.ts");
const scheduleMigration = read("supabase/migrations/20260715072000_schedule_portfolio_repository_verification.sql");
const queueMigration = read("supabase/migrations/20260715073000_harden_reconciliation_queue_and_leases.sql");

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
    expect(worker).toContain("await enqueueDuePortfolioVerification()");
    expect(worker).toContain("await runReconcilerCycle()");
    expect(reconciler).toContain('["ManifestController", new ManifestController()]');
  });

  it("keeps the demo outside the main portfolio by database policy", () => {
    expect(scheduleMigration).toContain("verification_enabled = false");
    expect(scheduleMigration).toContain("slug = 'sekret-bip-demo'");
  });
});

describe("reconciliation reliability", () => {
  it("reactivates completed coalesced rows and preserves delayed retries", () => {
    expect(outbox).toContain("completed_at: null");
    expect(outbox).toContain("claimed_at: null");
    expect(outbox).toContain("last_error: null");
    expect(reconciler).toMatch(/if \(result\.status === "retry"[\s\S]*?await enqueueReconcile[\s\S]*?return;/);
  });

  it("uses an ON CONFLICT compatible outbox constraint and atomic lease RPC", () => {
    expect(queueMigration).toContain("not deferrable");
    expect(queueMigration).toContain("try_acquire_controller_lease");
    expect(queueMigration).toContain("where lease.expires_at <= v_now");
    expect(baseController).toContain('supabase.rpc("try_acquire_controller_lease"');
  });

  it("retries provider failures and never grants automatic write authority", () => {
    expect(controller).toContain('return this.retry(message)');
    expect(controller).toContain('actionType: "propose_repository_repair_mission"');
    expect(controller).toContain("requiresApproval: true");
    expect(controller).not.toContain("createBranch(");
    expect(controller).not.toContain("integrate(");
    expect(controller).not.toContain("deploy(");
  });
});
