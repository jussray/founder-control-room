#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const accountId = process.env.CF_ACCOUNT_ID?.trim() || "";
const authToken = process.env.CF_REQUEST_TRACER_TOKEN ?? "";
const dnsInventoryToken = process.env.CF_DNS_INVENTORY_TOKEN ?? "";
const traceMethod = (
  process.env.CF_REQUEST_TRACE_METHOD?.trim() || "GET"
).toUpperCase();
const policyPath =
  process.env.CF_REQUEST_TRACE_POLICY?.trim() ||
  "config/cloudflare-request-trace-host-policy.json";
const receiptPath =
  process.env.CF_AUTHORITY_RECEIPT_PATH?.trim() ||
  "test-results/cloudflare-build-diagnostic.json";
const apiBase = "https://api.cloudflare.com/client/v4";
const traceEndpoint = `/accounts/${accountId}/request-tracer/trace`;
const observedAt = new Date().toISOString();
const HTTP_RECORD_TYPES = new Set(["A", "AAAA", "CNAME"]);

function normalizeHostname(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
}

function redact(value) {
  let text = String(value ?? "");
  for (const token of [authToken, dnsInventoryToken].filter(Boolean)) {
    text = text.split(token).join("[REDACTED]");
  }

  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /(token|secret|password|private[_ -]?key|api[_ -]?key)(\s*[:=]\s*)\S+/gi,
      "$1$2[REDACTED]",
    )
    .replace(
      /\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/g,
      "[REDACTED_TOKEN]",
    )
    .slice(0, 1000);
}

function providerMessages(body) {
  return [
    ...(body?.errors ?? []).map((entry) =>
      typeof entry === "string" ? entry : entry?.message,
    ),
    ...(body?.messages ?? []).map((entry) =>
      typeof entry === "string" ? entry : entry?.message,
    ),
  ].filter(Boolean);
}

function summarizeTrace(trace) {
  const summary = [];
  const visit = (items, parentStep = null, depth = 0) => {
    if (!Array.isArray(items) || depth > 8 || summary.length >= 200) return;

    for (let index = 0; index < items.length && summary.length < 200; index += 1) {
      const item = items[index] ?? {};
      const step = `${parentStep ? `${parentStep}.` : ""}${index + 1}`;
      summary.push({
        step,
        type: redact(item.type ?? "") || null,
        stepName: redact(item.step_name ?? "") || null,
        kind: redact(item.kind ?? "") || null,
        matched: typeof item.matched === "boolean" ? item.matched : null,
        action: redact(item.action ?? "") || null,
      });
      visit(item.trace, step, depth + 1);
    }
  };

  visit(trace);
  return summary;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readAuthorityReceipt() {
  try {
    return await readJson(receiptPath);
  } catch {
    return {
      ok: false,
      scope: "cloudflare-worker-git-authority",
      error: "AUTHORITY_RECEIPT_UNAVAILABLE",
    };
  }
}

function validatePolicy(policy) {
  const zone = normalizeHostname(policy?.zone);
  if (policy?.schemaVersion !== 1) {
    throw new Error("REQUEST_TRACE_POLICY_INVALID: schemaVersion must equal 1.");
  }
  if (!zone || !zone.includes(".")) {
    throw new Error("REQUEST_TRACE_POLICY_INVALID: zone must be a DNS zone name.");
  }
  if (!Array.isArray(policy?.reviewedHosts) || policy.reviewedHosts.length === 0) {
    throw new Error("REQUEST_TRACE_POLICY_INVALID: reviewedHosts must be a non-empty array.");
  }

  const reviewedHosts = policy.reviewedHosts.map((entry) => {
    const hostname = normalizeHostname(entry?.hostname);
    if (!hostname || (hostname !== zone && !hostname.endsWith(`.${zone}`))) {
      throw new Error(
        `REQUEST_TRACE_POLICY_INVALID: reviewed hostname ${redact(hostname)} is outside ${zone}.`,
      );
    }
    if (typeof entry?.required !== "boolean") {
      throw new Error(
        `REQUEST_TRACE_POLICY_INVALID: reviewed hostname ${hostname} must declare required boolean.`,
      );
    }
    if (typeof entry?.expectedEdgeProxy !== "boolean") {
      throw new Error(
        `REQUEST_TRACE_POLICY_INVALID: reviewed hostname ${hostname} must declare expectedEdgeProxy boolean.`,
      );
    }
    return {
      hostname,
      required: entry.required,
      expectedEdgeProxy: entry.expectedEdgeProxy,
    };
  });

  const duplicates = reviewedHosts.filter(
    (entry, index) => reviewedHosts.findIndex((candidate) => candidate.hostname === entry.hostname) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(
      `REQUEST_TRACE_POLICY_INVALID: duplicate reviewed hosts: ${duplicates.map((entry) => entry.hostname).join(", ")}.`,
    );
  }

  const maxTraceHosts = Number(policy?.maxTraceHosts ?? 100);
  if (!Number.isInteger(maxTraceHosts) || maxTraceHosts < 1 || maxTraceHosts > 200) {
    throw new Error("REQUEST_TRACE_POLICY_INVALID: maxTraceHosts must be an integer from 1 to 200.");
  }

  return { zone, reviewedHosts, maxTraceHosts };
}

function isDirectHttpHostname(hostname) {
  if (hostname.startsWith("*.")) return false;
  if (hostname.length > 253) return false;
  const labels = hostname.split(".");
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

async function cloudflareGet(path, token, failureCode) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    throw new Error(
      `${failureCode}: Cloudflare API ${response.status}: ${redact(
        providerMessages(body).join("; ") || "request failed",
      )}`,
    );
  }
  return body;
}

async function resolveZone(policy) {
  const query = new URLSearchParams({ name: policy.zone });
  const body = await cloudflareGet(
    `/zones?${query.toString()}`,
    dnsInventoryToken,
    "REQUEST_TRACE_ZONE_DISCOVERY_FAILED",
  );
  const candidates = Array.isArray(body?.result)
    ? body.result.filter((zone) => normalizeHostname(zone?.name) === policy.zone)
    : [];
  if (candidates.length !== 1) {
    throw new Error(
      `REQUEST_TRACE_ZONE_DISCOVERY_AMBIGUOUS: expected exactly one ${policy.zone} zone, found ${candidates.length}.`,
    );
  }
  const zone = candidates[0];
  if (!/^[0-9a-f]{32}$/i.test(String(zone?.id ?? ""))) {
    throw new Error("REQUEST_TRACE_ZONE_DISCOVERY_INVALID: Cloudflare returned an invalid zone ID.");
  }
  if (
    accountId &&
    String(zone?.account?.id ?? "").toLowerCase() !== accountId.toLowerCase()
  ) {
    throw new Error("REQUEST_TRACE_ZONE_ACCOUNT_MISMATCH: discovered zone belongs to a different account.");
  }
  return { id: String(zone.id), name: policy.zone };
}

async function listDnsRecords(zoneId) {
  const records = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({ page: String(page), per_page: "100" });
    const body = await cloudflareGet(
      `/zones/${zoneId}/dns_records?${query.toString()}`,
      dnsInventoryToken,
      "REQUEST_TRACE_DNS_DISCOVERY_FAILED",
    );
    if (!Array.isArray(body?.result)) {
      throw new Error("REQUEST_TRACE_DNS_DISCOVERY_INVALID: Cloudflare returned no DNS record array.");
    }
    records.push(...body.result);
    totalPages = Number(body?.result_info?.total_pages ?? 1);
    if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 1000) {
      throw new Error("REQUEST_TRACE_DNS_DISCOVERY_INVALID: Cloudflare returned invalid pagination metadata.");
    }
    page += 1;
  } while (page <= totalPages);

  return records;
}

function buildInventory(records, policy) {
  const reviewedByHost = new Map(policy.reviewedHosts.map((entry) => [entry.hostname, entry]));
  const byHost = new Map();

  for (const record of records) {
    const type = String(record?.type ?? "").toUpperCase();
    if (!HTTP_RECORD_TYPES.has(type)) continue;
    const hostname = normalizeHostname(record?.name);
    if (!hostname || (hostname !== policy.zone && !hostname.endsWith(`.${policy.zone}`))) continue;

    const existing = byHost.get(hostname) ?? {
      hostname,
      recordTypes: new Set(),
      edgeProxied: false,
      recordCount: 0,
    };
    existing.recordTypes.add(type);
    existing.edgeProxied ||= record?.proxied === true;
    existing.recordCount += 1;
    byHost.set(hostname, existing);
  }

  const hosts = [...byHost.values()]
    .map((entry) => {
      const reviewed = reviewedByHost.get(entry.hostname) ?? null;
      const wildcard = entry.hostname.startsWith("*.");
      const directHttpHostname = isDirectHttpHostname(entry.hostname);
      return {
        hostname: entry.hostname,
        recordTypes: [...entry.recordTypes].sort(),
        recordCount: entry.recordCount,
        edgeProxied: entry.edgeProxied,
        wildcard,
        directHttpHostname,
        traceEligible: entry.edgeProxied && directHttpHostname && !wildcard,
        reviewed: Boolean(reviewed),
        required: reviewed?.required ?? false,
      };
    })
    .sort((left, right) => left.hostname.localeCompare(right.hostname));

  const discovered = new Set(hosts.map((host) => host.hostname));
  const newHosts = hosts
    .filter((host) => !reviewedByHost.has(host.hostname))
    .map((host) => host.hostname);
  const missingRequiredHosts = policy.reviewedHosts
    .filter((host) => host.required && !discovered.has(host.hostname))
    .map((host) => host.hostname)
    .sort();
  const proxyStateDrift = policy.reviewedHosts
    .map((reviewed) => {
      const observed = hosts.find((host) => host.hostname === reviewed.hostname);
      if (!observed || observed.edgeProxied === reviewed.expectedEdgeProxy) return null;
      return {
        hostname: reviewed.hostname,
        expectedEdgeProxy: reviewed.expectedEdgeProxy,
        observedEdgeProxy: observed.edgeProxied,
      };
    })
    .filter(Boolean);
  const wildcardHosts = hosts.filter((host) => host.wildcard).map((host) => host.hostname);
  const dnsOnlyHosts = hosts
    .filter((host) => !host.edgeProxied && host.directHttpHostname)
    .map((host) => host.hostname);
  const untraceableHosts = hosts
    .filter((host) => !host.traceEligible)
    .map((host) => ({
      hostname: host.hostname,
      reason: host.wildcard
        ? "WILDCARD_NOT_DIRECTLY_TRACEABLE"
        : host.edgeProxied
          ? "HOSTNAME_NOT_HTTP_SAFE"
          : "DNS_ONLY_NOT_CLOUDFLARE_EDGE",
    }));
  const inventoryHash = createHash("sha256")
    .update(
      JSON.stringify(
        hosts.map((host) => [
          host.hostname,
          host.recordTypes,
          host.edgeProxied,
          host.wildcard,
        ]),
      ),
    )
    .digest("hex");

  return {
    hosts,
    newHosts,
    missingRequiredHosts,
    proxyStateDrift,
    wildcardHosts,
    dnsOnlyHosts,
    untraceableHosts,
    inventoryHash,
    policyClean:
      newHosts.length === 0 &&
      missingRequiredHosts.length === 0 &&
      proxyStateDrift.length === 0,
  };
}

async function traceHost(hostname) {
  const url = `https://${hostname}/`;
  const result = {
    hostname,
    url,
    method: traceMethod,
    ok: false,
    zoneResponseStatusCode: null,
    traceStepCount: null,
    matchedStepCount: null,
    steps: [],
    error: null,
  };

  try {
    const response = await fetch(`${apiBase}${traceEndpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        method: traceMethod,
        skip_response: false,
      }),
    });
    const body = await response.json().catch(() => null);

    if (!response.ok || body?.success !== true) {
      throw new Error(
        `REQUEST_TRACE_PROVIDER_FAILURE: Cloudflare API ${response.status}: ${redact(
          providerMessages(body).join("; ") || "request failed",
        )}`,
      );
    }

    const trace = body?.result?.trace;
    const zoneResponseStatusCode = body?.result?.status_code;
    if (!Array.isArray(trace)) {
      throw new Error("REQUEST_TRACE_RESULT_INVALID: Cloudflare returned no trace array.");
    }
    if (!Number.isInteger(zoneResponseStatusCode)) {
      throw new Error(
        "REQUEST_TRACE_RESULT_INVALID: Cloudflare returned no zone response status code.",
      );
    }

    const steps = summarizeTrace(trace);
    result.ok = true;
    result.zoneResponseStatusCode = zoneResponseStatusCode;
    result.traceStepCount = steps.length;
    result.matchedStepCount = steps.filter((step) => step.matched === true).length;
    result.steps = steps;
  } catch (error) {
    result.error = redact(error instanceof Error ? error.message : error);
  }

  return result;
}

const receipt = await readAuthorityReceipt();
const failures = [];
const requestTrace = {
  ok: false,
  source: "cloudflare-request-tracer",
  discoverySource: "cloudflare-dns-records",
  endpoint: "/accounts/{account_id}/request-tracer/trace",
  dnsEndpoint: "/zones/{zone_id}/dns_records",
  observedAt,
  requestSimulation: true,
  runtimeShaVerified: false,
  canAuthorizeProviderMutation: false,
  zone: null,
  inventoryHash: null,
  policyClean: false,
  newHosts: [],
  missingRequiredHosts: [],
  proxyStateDrift: [],
  wildcardHosts: [],
  dnsOnlyHosts: [],
  untraceableHosts: [],
  hosts: [],
  traces: [],
  error: null,
};

function fail(message) {
  const safe = redact(message);
  failures.push(safe);
  console.error(safe);
}

try {
  if (!accountId || !/^[0-9a-f]{32}$/i.test(accountId)) {
    throw new Error(
      "REQUEST_TRACE_ACCOUNT_ID_INVALID: CF_ACCOUNT_ID must be a 32-character Cloudflare account ID.",
    );
  }
  if (!authToken) {
    throw new Error(
      "REQUEST_TRACE_TOKEN_UNAVAILABLE: FCR_CLOUDFLARE_REQUEST_TRACER_TOKEN-derived CF_REQUEST_TRACER_TOKEN is required.",
    );
  }
  if (!dnsInventoryToken) {
    throw new Error(
      "REQUEST_TRACE_DNS_TOKEN_UNAVAILABLE: FCR_CLOUDFLARE_DNS_INVENTORY_TOKEN-derived CF_DNS_INVENTORY_TOKEN is required.",
    );
  }
  if (!new Set(["GET", "HEAD"]).has(traceMethod)) {
    throw new Error(
      "REQUEST_TRACE_METHOD_UNSAFE: only GET or HEAD may be used by this read-only witness.",
    );
  }

  const policy = validatePolicy(await readJson(policyPath));
  const zone = await resolveZone(policy);
  const dnsRecords = await listDnsRecords(zone.id);
  const inventory = buildInventory(dnsRecords, policy);
  const traceEligibleHosts = inventory.hosts.filter((host) => host.traceEligible);

  if (traceEligibleHosts.length > policy.maxTraceHosts) {
    throw new Error(
      `REQUEST_TRACE_HOST_LIMIT_EXCEEDED: discovered ${traceEligibleHosts.length} trace-eligible hosts; policy limit is ${policy.maxTraceHosts}.`,
    );
  }

  requestTrace.zone = zone.name;
  requestTrace.inventoryHash = inventory.inventoryHash;
  requestTrace.policyClean = inventory.policyClean;
  requestTrace.newHosts = inventory.newHosts;
  requestTrace.missingRequiredHosts = inventory.missingRequiredHosts;
  requestTrace.proxyStateDrift = inventory.proxyStateDrift;
  requestTrace.wildcardHosts = inventory.wildcardHosts;
  requestTrace.dnsOnlyHosts = inventory.dnsOnlyHosts;
  requestTrace.untraceableHosts = inventory.untraceableHosts;
  requestTrace.hosts = inventory.hosts;

  for (const host of traceEligibleHosts) {
    requestTrace.traces.push(await traceHost(host.hostname));
  }

  const traceFailures = requestTrace.traces.filter((trace) => !trace.ok);
  if (inventory.newHosts.length > 0) {
    fail(`REQUEST_TRACE_NEW_UNREVIEWED_HOSTS: ${inventory.newHosts.join(", ")}`);
  }
  if (inventory.missingRequiredHosts.length > 0) {
    fail(`REQUEST_TRACE_REQUIRED_HOSTS_MISSING: ${inventory.missingRequiredHosts.join(", ")}`);
  }
  if (inventory.proxyStateDrift.length > 0) {
    fail(
      `REQUEST_TRACE_PROXY_STATE_DRIFT: ${inventory.proxyStateDrift
        .map((entry) => `${entry.hostname}:${entry.observedEdgeProxy ? "proxied" : "dns-only"}`)
        .join(", ")}`,
    );
  }
  if (traceFailures.length > 0) {
    fail(
      `REQUEST_TRACE_HOST_FAILURES: ${traceFailures
        .map((trace) => `${trace.hostname}:${trace.error ?? "unknown"}`)
        .join(" | ")}`,
    );
  }

  requestTrace.ok = inventory.policyClean && traceFailures.length === 0;
} catch (error) {
  fail(error instanceof Error ? error.message : error);
}

if (failures.length > 0) {
  requestTrace.error = failures.join(" | ");
}

receipt.requestTrace = requestTrace;
receipt.ok = receipt.ok === true && requestTrace.ok;
if (!requestTrace.ok) {
  receipt.error = [receipt.error, requestTrace.error].filter(Boolean).join(" | ");
  process.exitCode = 1;
}

await mkdir("test-results", { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(
  `Cloudflare request-trace inventory appended to authority receipt: ${receiptPath}`,
);
