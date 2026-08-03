import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/cloudflare-local-preflight.yml"),
  "utf8",
);

describe("Cloudflare and local parity preflight", () => {
  it("isolates concurrency by immutable pull request head", () => {
    expect(workflow).toContain(
      "group: cloudflare-local-preflight-${{ github.event.pull_request.number || github.ref }}-${{ github.event.pull_request.head.sha || github.sha }}",
    );
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("checks out and verifies the exact candidate head", () => {
    expect(workflow).toContain(
      "EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}",
    );
    expect(workflow).toContain("ref: ${{ env.EXPECTED_HEAD_SHA }}");
    expect(workflow).toContain(
      'test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD_SHA"',
    );
  });

  it("retains the parallel verifier receipt even when verification fails", () => {
    expect(workflow).toContain("run: npm run verify:parallel");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain(
      "path: test-results/parallel-verify-result.json",
    );
  });
});
