import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/cloudflare-build-diagnostic.yml"),
  "utf8",
);
const tracer = readFileSync(
  resolve(process.cwd(), "scripts/trace-cloudflare-request.mjs"),
  "utf8",
);

describe("Cloudflare request trace witness", () => {
  it("uses the current Cloudflare request-tracer endpoint and a fully qualified URL", () => {
    expect(tracer).toContain("/request-tracer/trace");
    expect(tracer).not.toContain("/request-tracer/tracer");
    expect(tracer).toContain("https://www.foundercontrolroom.org/");
    expect(workflow).toContain(
      "CF_REQUEST_TRACE_URL: https://www.foundercontrolroom.org/",
    );
  });

  it("uses a dedicated read-only tracer credential instead of the deploy credential", () => {
    expect(workflow).toContain(
      "CF_REQUEST_TRACER_TOKEN: ${{ secrets.FCR_CLOUDFLARE_REQUEST_TRACER_TOKEN }}",
    );
    expect(tracer).toContain("process.env.CF_REQUEST_TRACER_TOKEN");
    expect(tracer).not.toContain("process.env.CF_API_TOKEN");
  });

  it("keeps the trace witness read-only and non-authoritative", () => {
    expect(tracer).toContain('new Set(["GET", "HEAD"])');
    expect(tracer).toContain("REQUEST_TRACE_METHOD_UNSAFE");
    expect(tracer).toContain("runtimeShaVerified: false");
    expect(tracer).toContain("canAuthorizeProviderMutation: false");
  });

  it("redacts and summarizes trace output instead of persisting raw rule payloads", () => {
    expect(tracer).toContain("summarizeTrace(trace)");
    expect(tracer).not.toContain("action_parameters");
    expect(tracer).not.toContain("item.expression");
    expect(tracer).toContain("Bearer [REDACTED]");
  });

  it("appends request-path evidence to the existing authority receipt even after an earlier audit failure", () => {
    expect(workflow).toContain("node scripts/trace-cloudflare-request.mjs");
    expect(workflow).toMatch(
      /- name: Trace public request path through Cloudflare\n        if: always\(\)/,
    );
    expect(tracer).toContain("receipt.requestTrace = requestTrace");
    expect(tracer).toContain("cloudflare-build-diagnostic.json");
  });
});
