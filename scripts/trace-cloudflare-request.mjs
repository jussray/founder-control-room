#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";

const accountId = process.env.CF_ACCOUNT_ID?.trim() || "";
const authToken = process.env.CF_REQUEST_TRACER_TOKEN ?? "";
const traceUrl =
  process.env.CF_REQUEST_TRACE_URL?.trim() ||
  "https://www.foundercontrolroom.org/";
const traceMethod = (
  process.env.CF_REQUEST_TRACE_METHOD?.trim() || "GET"
).toUpperCase();
const receiptPath =
  process.env.CF_AUTHORITY_RECEIPT_PATH?.trim() ||
  "test-results/cloudflare-build-diagnostic.json";
const apiBase = "https://api.cloudflare.com/client/v4";
const traceEndpoint = `/accounts/${accountId}/request-tracer/trace`;
const observedAt = new Date().toISOString();

function redact(value) {
  let text = String(value ?? "");
  if (authToken) text = text.split(authToken).join("[REDACTED]");

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
        name: redact(item.name ?? "") || null,
        kind: redact(item.kind ?? "") || null,
        matched: typeof item.matched === "boolean" ? item.matched : null,
        action: redact(item.action ?? "") || null,
        description: redact(item.description ?? "") || null,
      });
      visit(item.trace, step, depth + 1);
    }
  };

  visit(trace);
  return summary;
}

async function readAuthorityReceipt() {
  try {
    return JSON.parse(await readFile(receiptPath, "utf8"));
  } catch {
    return {
      ok: false,
      scope: "cloudflare-worker-git-authority",
      error: "AUTHORITY_RECEIPT_UNAVAILABLE",
    };
  }
}

const receipt = await readAuthorityReceipt();
const failures = [];
const requestTrace = {
  ok: false,
  source: "cloudflare-request-tracer",
  endpoint: "/accounts/{account_id}/request-tracer/trace",
  url: traceUrl,
  method: traceMethod,
  observedAt,
  requestSimulation: true,
  originStatusCode: null,
  traceStepCount: null,
  matchedStepCount: null,
  steps: [],
  runtimeShaVerified: false,
  canAuthorizeProviderMutation: false,
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

  if (!new Set(["GET", "HEAD"]).has(traceMethod)) {
    throw new Error(
      "REQUEST_TRACE_METHOD_UNSAFE: only GET or HEAD may be used by this read-only witness.",
    );
  }

  const parsedUrl = new URL(traceUrl);
  if (parsedUrl.protocol !== "https:") {
    throw new Error(
      "REQUEST_TRACE_URL_INVALID: CF_REQUEST_TRACE_URL must use https://.",
    );
  }

  const response = await fetch(`${apiBase}${traceEndpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: parsedUrl.toString(),
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
  const originStatusCode = body?.result?.status_code;
  if (!Array.isArray(trace)) {
    throw new Error(
      "REQUEST_TRACE_RESULT_INVALID: Cloudflare returned no trace array.",
    );
  }
  if (!Number.isInteger(originStatusCode)) {
    throw new Error(
      "REQUEST_TRACE_RESULT_INVALID: Cloudflare returned no origin status code.",
    );
  }

  const steps = summarizeTrace(trace);
  requestTrace.ok = true;
  requestTrace.originStatusCode = originStatusCode;
  requestTrace.traceStepCount = steps.length;
  requestTrace.matchedStepCount = steps.filter(
    (step) => step.matched === true,
  ).length;
  requestTrace.steps = steps;
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
console.log(`Cloudflare request trace appended to authority receipt: ${receiptPath}`);
