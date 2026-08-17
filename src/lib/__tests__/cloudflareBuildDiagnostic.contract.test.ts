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
const credentialContract = readFileSync(
  resolve(process.cwd(), "scripts/provider-credential-contract.mjs"),
  "utf8",
);

describe("Cloudflare build diagnostic authority", () => {
  it("uses only the dedicated read-only Builds API token contract", () => {
    expect(workflow).toContain(
      "CF_API_TOKEN: ${{ secrets.FCR_CLOUDFLARE_BUILDS_USER_TOKEN }}",
    );
    expect(workflow).not.toContain("secrets.CLOUDFLARE_BUILDS_API_TOKEN");
    expect(workflow).not.toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("permissions:\n  contents: read");
  });

  it("uses the canonical public Cloudflare account identity instead of a secret", () => {
    expect(workflow).toContain(
      "CF_ACCOUNT_ID: 9b59861bd1747cf7525571b4c51d2aa0",
    );
    expect(workflow).not.toContain("secrets.CLOUDFLARE_ACCOUNT_ID");
  });

  it("fails explicitly through the shared raw credential contract before provider inspection", () => {
    const preflightIndex = workflow.indexOf("Preflight dedicated Builds credential with shared contract");
    const inspectionIndex = workflow.indexOf("Inspect exact Cloudflare build and custom-domain ownership");

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(inspectionIndex).toBeGreaterThan(preflightIndex);
    expect(workflow).toContain("node scripts/provider-credential-contract.mjs");
    expect(workflow).toContain("--env CF_API_TOKEN");
    expect(workflow).toContain("--purpose cloudflare-workers-builds-read");
    expect(workflow).toContain("test-results/provider-credentials/cloudflare-builds.json");
    expect(credentialContract).toContain("classification = 'missing'");
    expect(credentialContract).toContain("classification = 'non-ascii'");
    expect(credentialContract).toContain("classification = 'whitespace'");
    expect(credentialContract).toContain("classification = 'bearer-prefix'");
    expect(credentialContract).not.toContain("console.log(token)");
  });

  it("classifies the raw observer token before any provider read", () => {
    expect(inspector).toContain('const apiToken = process.env.CF_API_TOKEN ?? "";');
    expect(inspector).toContain("classifyTokenShape(apiToken)");
    expect(inspector).toContain("tokenPreflightFailure(receipt.providerCredentials.tokenShape)");
    expect(inspector).toContain('classification: "provider-token-header-unsafe"');
    expect(inspector).toContain('classification: "provider-token-account-id"');
    expect(inspector).toContain('classification: "provider-token-type-unsupported"');
    expect(inspector).toContain('shape.credentialType === "account-token"');
    expect(inspector).toContain('shape.credentialType === "global-key"');
    expect(inspector).toContain("hasNonAscii");
    expect(inspector).toContain("hasLeadingOrTrailingWhitespace");
    expect(inspector).toContain("matchesAccountId");
  });

  it("requires active user-token verification before account or build reads", () => {
    expect(inspector).toContain('verifyToken("/user/tokens/verify")');
    expect(inspector).toContain('`/accounts/${accountId}/tokens/verify`');
    expect(inspector).toContain('classification = "user-token-active"');
    expect(inspector).toContain('classification = "provider-token-invalid"');
    expect(inspector).toContain("Workers Builds inspection requires a user-scoped token");
  });

  it("keeps collecting public-runtime evidence independently of provider auth", () => {
    expect(inspector).toContain("const failures = [];");
    expect(inspector).toContain("PUBLIC_ORIGIN_TRANSPORT_FAILURE");
    expect(inspector).toContain("WRONG_SERVICE_ORIGIN");
    expect(inspector).not.toMatch(/throw new Error\(\s*`WRONG_SERVICE_ORIGIN/);
  });

  it("only reaches domain, script, build, and log reads after credential verification", () => {
    expect(inspector).toContain("/workers/domains?hostname=");
    expect(inspector).toContain("/workers/scripts");
    expect(inspector).toContain("/builds/workers/${worker.tag}/builds");
    expect(inspector).toContain("/builds/builds/${build.build_uuid}/logs");
  });

  it("retains both shape and provider diagnostic receipts on failure", () => {
    expect(workflow).toContain("test-results/provider-credentials/cloudflare-builds.json");
    expect(workflow).toContain("test-results/cloudflare-build-diagnostic.json");
    expect(inspector).toContain("receipt.ok = failures.length === 0;");
    expect(inspector).toContain('receipt.error = failures.join(" | ");');
    expect(inspector).toContain("process.exitCode = 1;");
  });
});