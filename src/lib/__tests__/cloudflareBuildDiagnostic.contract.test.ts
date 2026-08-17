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

describe("Cloudflare Worker Git authority audit", () => {
  it("uses only the dedicated read-only Workers Builds token contract", () => {
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

  it("is manual-only and binds provider inspection to exact current main", () => {
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^  push:/m);
    expect(workflow).toContain(
      "CF_EXPECT_WORKER_GIT_MODE: disconnected-or-non-promoting",
    );
    expect(workflow).toContain(
      'test "$ACTUAL_HEAD_SHA" = "$EXPECTED_HEAD_SHA"',
    );
    expect(workflow).toContain(
      'test "$CURRENT_MAIN_SHA" = "$EXPECTED_HEAD_SHA"',
    );
  });

  it("fails explicitly when the dedicated observer token is unavailable", () => {
    expect(workflow).toContain(
      "Verify dedicated read-only Workers Builds token is available",
    );
    expect(workflow).toContain(
      "FCR_CLOUDFLARE_BUILDS_USER_TOKEN is not available to this workflow.",
    );
  });

  it("classifies the raw observer token before any provider read", () => {
    expect(inspector).toContain('const apiToken = process.env.CF_API_TOKEN ?? "";');
    expect(inspector).toContain("classifyTokenShape(apiToken)");
    expect(inspector).toMatch(
      /tokenPreflightFailure\(\s*receipt\.providerCredentials\.tokenShape,?\s*\)/,
    );
    expect(inspector).toContain('classification: "provider-token-header-unsafe"');
    expect(inspector).toContain('classification: "provider-token-account-id"');
    expect(inspector).toContain('classification: "provider-token-type-unsupported"');
    expect(inspector).toContain('shape.credentialType === "account-token"');
    expect(inspector).toContain('shape.credentialType === "global-key"');
    expect(inspector).toContain("hasNonAscii");
    expect(inspector).toContain("hasLeadingOrTrailingWhitespace");
    expect(inspector).toContain("matchesAccountId");
  });

  it("requires active user-token verification before provider authority reads", () => {
    expect(inspector).toContain('verifyToken("/user/tokens/verify")');
    expect(inspector).toContain('`/accounts/${accountId}/tokens/verify`');
    expect(inspector).toContain('classification = "user-token-active"');
    expect(inspector).toContain('classification = "provider-token-invalid"');
    expect(inspector).toContain(
      "Workers Builds inspection requires a user-scoped token",
    );
  });

  it("reads domain, Worker identity, and Git triggers rather than requiring an exact native build", () => {
    expect(inspector).toContain("/workers/domains?hostname=");
    expect(inspector).toContain("/workers/scripts");
    expect(inspector).toContain("/builds/workers/${worker.tag}/triggers");
    expect(inspector).toContain('receipt.workerGitAuthority.state = "disconnected"');
    expect(inspector).toContain('receipt.workerGitAuthority.state = "non-promoting"');
    expect(inspector).toContain("WORKER_GIT_AUTO_DEPLOY_AUTHORITY_CONFLICT");
    expect(inspector).not.toContain("/builds/workers/${worker.tag}/builds");
    expect(inspector).not.toContain("/builds/builds/${build.build_uuid}/logs");
    expect(inspector).not.toContain("PUBLIC_ORIGIN_TRANSPORT_FAILURE");
  });

  it("still fails closed and retains a redacted authority receipt", () => {
    expect(inspector).toContain("receipt.ok = failures.length === 0;");
    expect(inspector).toContain('receipt.error = failures.join(" | ");');
    expect(inspector).toContain("process.exitCode = 1;");
    expect(inspector).toContain("cloudflare-build-diagnostic.json");
    expect(inspector).toContain(
      'canonicalProductionAuthority: "github-manual-deploy-workflow"',
    );
  });
});
