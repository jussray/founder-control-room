import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/cloudflare-build-diagnostic.yml"),
  "utf8",
);
const inspector = readFileSync(
  resolve(process.cwd(), "scripts/inspect-cloudflare-build.mjs"),
  "utf8",
);

describe("Cloudflare build diagnostic authority", () => {
  it("uses only the dedicated read-only Builds API token contract", () => {
    expect(workflow).toContain(
      "CF_API_TOKEN: ${{ secrets.CLOUDFLARE_BUILDS_API_TOKEN }}",
    );
    expect(workflow).not.toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("permissions:\n  contents: read");
  });

  it("treats the known Cloudflare account id as public configuration, not a secret dependency", () => {
    expect(workflow).toContain(
      "CF_ACCOUNT_ID: 9b59861bd1747cf7525571b4c51d2aa0",
    );
    expect(workflow).not.toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
  });

  it("keeps collecting provider evidence when the public runtime identity is wrong", () => {
    expect(inspector).toContain("const failures = [];");
    expect(inspector).toContain("WRONG_SERVICE_ORIGIN");
    expect(inspector).not.toMatch(/throw new Error\(\s*`WRONG_SERVICE_ORIGIN/);
    expect(inspector).toContain("/builds/workers/${worker.tag}/builds");
    expect(inspector).toContain("/builds/builds/${build.build_uuid}/logs");
  });

  it("still fails closed after retaining the diagnostic receipt", () => {
    expect(inspector).toContain("receipt.ok = failures.length === 0;");
    expect(inspector).toContain('receipt.error = failures.join(" | ");');
    expect(inspector).toContain("process.exitCode = 1;");
    expect(inspector).toContain("cloudflare-build-diagnostic.json");
  });
});