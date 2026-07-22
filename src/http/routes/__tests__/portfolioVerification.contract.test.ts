import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/http/routes/portfolioVerification.ts"),
  "utf8",
);

describe("portfolio verification read model", () => {
  it("returns signature and runner provenance with the latest run", () => {
    expect(source).toContain("signature_verified,runner");
    expect(source).toContain('"none" | "signed" | "manual_preview" | "unsigned"');
    expect(source).toContain('run.runner.mode.startsWith("preview_branch_")');
    expect(source).toContain("signatureVerified");
    expect(source).toContain("manualPreview");
  });

  it("reports declared and failed code-use assertion totals", () => {
    expect(source).toContain("usage_assertion_ids");
    expect(source).toContain("failed_usage_assertion_ids");
    expect(source).toContain("usageAssertions: usageAssertionCount");
    expect(source).toContain("failedUsageAssertions: failedUsageAssertionCount");
  });

  it("includes mission titles and execution state without adding execution actions", () => {
    expect(source).toContain("title,status,risk_level,base_ref,builder_agent");
    expect(source).not.toContain("createBranch(");
    expect(source).not.toContain("integrate(");
    expect(source).not.toContain("deploy(");
    expect(source).not.toContain("rollback(");
  });
});
