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
const hostPolicy = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "config/cloudflare-request-trace-host-policy.json"),
    "utf8",
  ),
) as {
  schemaVersion: number;
  zone: string;
  reviewedHosts: Array<{
    hostname: string;
    required: boolean;
    expectedEdgeProxy: boolean;
  }>;
};

describe("Cloudflare request trace witness", () => {
  it("discovers the whole FCR DNS hostname inventory before tracing", () => {
    expect(hostPolicy.schemaVersion).toBe(1);
    expect(hostPolicy.zone).toBe("foundercontrolroom.org");
    expect(hostPolicy.reviewedHosts.map((host) => host.hostname)).toEqual(
      expect.arrayContaining([
        "foundercontrolroom.org",
        "www.foundercontrolroom.org",
        "api.foundercontrolroom.org",
      ]),
    );
    expect(tracer).toContain('const HTTP_RECORD_TYPES = new Set(["A", "AAAA", "CNAME"])');
    expect(tracer).toContain("REQUEST_TRACE_ZONE_DISCOVERY_FAILED");
    expect(tracer).toContain("/dns_records?");
    expect(tracer).toContain("buildInventory(dnsRecords, policy)");
    expect(tracer).toContain("traceEligibleHosts");
  });

  it("uses separate least-privilege tracer and DNS-inventory credentials", () => {
    expect(workflow).toContain(
      "CF_REQUEST_TRACER_TOKEN: ${{ secrets.FCR_CLOUDFLARE_REQUEST_TRACER_TOKEN }}",
    );
    expect(workflow).toContain(
      "CF_DNS_INVENTORY_TOKEN: ${{ secrets.FCR_CLOUDFLARE_DNS_INVENTORY_TOKEN }}",
    );
    expect(workflow).toContain(
      "CF_REQUEST_TRACE_POLICY: config/cloudflare-request-trace-host-policy.json",
    );
    expect(tracer).toContain("process.env.CF_REQUEST_TRACER_TOKEN");
    expect(tracer).toContain("process.env.CF_DNS_INVENTORY_TOKEN");
    expect(tracer).not.toContain("process.env.CF_API_TOKEN");
  });

  it("detects newly added, missing required, and proxy-state-drift hostnames", () => {
    expect(tracer).toContain("newHosts");
    expect(tracer).toContain("missingRequiredHosts");
    expect(tracer).toContain("proxyStateDrift");
    expect(tracer).toContain("REQUEST_TRACE_NEW_UNREVIEWED_HOSTS");
    expect(tracer).toContain("REQUEST_TRACE_REQUIRED_HOSTS_MISSING");
    expect(tracer).toContain("REQUEST_TRACE_PROXY_STATE_DRIFT");
    expect(tracer).toContain('createHash("sha256")');
    expect(tracer).toContain("inventoryHash");
  });

  it("traces every discovered proxied HTTP hostname while classifying non-edge and wildcard records", () => {
    expect(tracer).toContain("existing.edgeProxied ||= record?.proxied === true");
    expect(tracer).toContain("traceEligible: entry.edgeProxied && directHttpHostname && !wildcard");
    expect(tracer).toContain("for (const host of traceEligibleHosts)");
    expect(tracer).toContain("await traceHost(host.hostname)");
    expect(tracer).toContain("WILDCARD_NOT_DIRECTLY_TRACEABLE");
    expect(tracer).toContain("DNS_ONLY_NOT_CLOUDFLARE_EDGE");
    expect(tracer).toContain("wildcardHosts");
    expect(tracer).toContain("dnsOnlyHosts");
  });

  it("keeps the Request Trace witness simulated, read-only, and non-authoritative", () => {
    expect(tracer).toContain("/request-tracer/trace");
    expect(tracer).not.toContain("/request-tracer/tracer");
    expect(tracer).toContain('new Set(["GET", "HEAD"])');
    expect(tracer).toContain("REQUEST_TRACE_METHOD_UNSAFE");
    expect(tracer).toContain("requestSimulation: true");
    expect(tracer).toContain("runtimeShaVerified: false");
    expect(tracer).toContain("canAuthorizeProviderMutation: false");
  });

  it("keeps optional enrichment from downgrading or upgrading core authority", () => {
    expect(workflow).toContain("Preserve core authority verdict before optional enrichment");
    expect(workflow).toContain("cloudflare-build-diagnostic.core.json");
    expect(workflow).toContain("id: trace_enrichment");
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain("Restore core authority verdict after optional enrichment");
    expect(workflow).toContain("receipt.ok = core.ok === true");
    expect(workflow).toContain("receipt.error = core.error ?? null");
    expect(workflow).toContain("optionalForCoreAuthority = true");
    expect(workflow).toContain("do not manufacture or upgrade authority truth");
  });

  it("uses zone-response semantics rather than implying origin proof", () => {
    expect(tracer).toContain("zoneResponseStatusCode");
    expect(tracer).toContain("zone response status code");
    expect(tracer).not.toContain("originStatusCode");
    expect(tracer).not.toContain("origin status code");
  });

  it("never persists raw DNS targets or free-form Cloudflare trace rule payloads", () => {
    expect(tracer).toContain("summarizeTrace(trace)");
    expect(tracer).not.toContain("record.content");
    expect(tracer).not.toContain("action_parameters");
    expect(tracer).not.toContain("item.expression");
    expect(tracer).not.toContain("item.name");
    expect(tracer).not.toContain("item.description");
    expect(tracer).toContain("Bearer [REDACTED]");
  });

  it("runs full host discovery only after exact-current-main verification", () => {
    expect(workflow).toContain("id: verify_head");
    expect(workflow).toContain("Discover and trace FCR Cloudflare host inventory");
    expect(workflow).toContain("node scripts/trace-cloudflare-request.mjs");
    expect(workflow).toContain(
      "if: always() && steps.verify_head.outcome == 'success'",
    );
    expect(tracer).toContain("receipt.requestTrace = requestTrace");
    expect(tracer).toContain("cloudflare-build-diagnostic.json");
  });
});
