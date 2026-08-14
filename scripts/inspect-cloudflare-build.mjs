#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const accountId = process.env.CF_ACCOUNT_ID?.trim();
const apiToken = process.env.CF_API_TOKEN?.trim();
const expectedHeadSha =
  process.env.EXPECTED_HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim();
const workerName = process.env.CF_WORKER_NAME?.trim() || "founder-control-room";
const apiHostname =
  process.env.CF_API_HOSTNAME?.trim() || "api.foundercontrolroom.org";
const receiptPath = "test-results/cloudflare-build-diagnostic.json";
const apiBase = "https://api.cloudflare.com/client/v4";

function redact(value) {
  let text = String(value ?? "");
  for (const secret of [apiToken, accountId]) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }

  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|password|private[_ -]?key|api[_ -]?key)(\s*[:=]\s*)\S+/gi, "$1$2[REDACTED]")
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, "[REDACTED_HEX]")
    .slice(0, 4000);
}

async function cloudflare(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const messages = [
      ...(body?.errors ?? []).map((entry) => entry?.message),
      ...(body?.messages ?? []),
    ].filter(Boolean);
    throw new Error(
      `Cloudflare API ${response.status}: ${redact(messages.join("; ") || "request failed")}`,
    );
  }
  return body?.result;
}

function normalizeBuilds(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.builds)) return result.builds;
  if (result?.builds && typeof result.builds === "object") {
    return Object.values(result.builds);
  }
  if (result && typeof result === "object") {
    return Object.values(result).filter((value) => value?.build_uuid);
  }
  return [];
}

function normalizeDomains(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.domains)) return result.domains;
  return [];
}

function normalizeLogLine(line) {
  if (Array.isArray(line)) return line.map((part) => String(part)).join(" ");
  return String(line ?? "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const receipt = {
  ok: false,
  workerName,
  apiHostname,
  expectedHeadSha: expectedHeadSha || null,
  inspectedAt: new Date().toISOString(),
  origin: null,
  domain: null,
  build: null,
  relevantLogLines: [],
  error: null,
};

try {
  if (!expectedHeadSha) {
    throw new Error("EXPECTED_HEAD_SHA or GITHUB_SHA is required.");
  }

  let originResponse;
  try {
    originResponse = await fetch(`https://${apiHostname}/version`, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
  } catch (error) {
    throw new Error(
      `PUBLIC_ORIGIN_TRANSPORT_FAILURE: ${redact(error instanceof Error ? error.message : error)}`,
    );
  }

  const originBody = Buffer.from(await originResponse.arrayBuffer());
  const originText = originBody.toString("utf8");
  const originContentType = originResponse.headers.get("content-type");
  const originServiceIdentity = originResponse.headers.get(
    "x-founder-control-room-service",
  );
  let originJson = null;
  try {
    originJson = JSON.parse(originText);
  } catch {
    originJson = null;
  }

  const liveSha =
    originJson && typeof originJson.gitSha === "string" ? originJson.gitSha : null;
  receipt.origin = {
    httpStatus: originResponse.status,
    contentType: originContentType,
    serviceIdentity: originServiceIdentity,
    responseBytes: originBody.byteLength,
    responseSha256: sha256(originBody),
    liveSha,
  };

  if (!originResponse.ok) {
    throw new Error(
      `PUBLIC_ORIGIN_HTTP_FAILURE: ${apiHostname}/version returned HTTP ${originResponse.status}.`,
    );
  }

  if (originServiceIdentity !== workerName || originJson?.service !== workerName) {
    throw new Error(
      `WRONG_SERVICE_ORIGIN: ${apiHostname} is not reaching the canonical ${workerName} Worker.`,
    );
  }

  if (!/^[0-9a-f]{40}$/.test(liveSha ?? "")) {
    throw new Error(
      `INVALID_VERSION_DOCUMENT: ${apiHostname}/version did not return a valid exact gitSha.`,
    );
  }

  if (liveSha !== expectedHeadSha) {
    throw new Error(
      `STALE_LIVE_DEPLOYMENT: live Worker SHA ${liveSha} does not match expected head ${expectedHeadSha}.`,
    );
  }

  if (!accountId || !apiToken) {
    throw new Error(
      "PROVIDER_CREDENTIALS_UNAVAILABLE: CF_ACCOUNT_ID and CF_API_TOKEN are required for Cloudflare domain/build ownership inspection after public-origin proof passes.",
    );
  }

  const domains = normalizeDomains(
    await cloudflare(
      `/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(apiHostname)}`,
    ),
  );
  const matchingDomains = domains.filter(
    (entry) => String(entry?.hostname ?? "").toLowerCase() === apiHostname.toLowerCase(),
  );

  if (matchingDomains.length !== 1) {
    throw new Error(
      `Expected exactly one Cloudflare Worker domain for ${apiHostname}; found ${matchingDomains.length}.`,
    );
  }

  const domain = matchingDomains[0];
  receipt.domain = {
    hostname: domain?.hostname ?? null,
    service: domain?.service ?? null,
    environment: domain?.environment ?? null,
    zoneName: domain?.zone_name ?? null,
  };

  if (domain?.service !== workerName) {
    throw new Error(
      `Custom domain ${apiHostname} is attached to Worker ${domain?.service || "unknown"}; expected ${workerName}.`,
    );
  }

  const scripts = await cloudflare(`/accounts/${accountId}/workers/scripts`);
  const worker = (Array.isArray(scripts) ? scripts : []).find(
    (entry) => entry?.id === workerName,
  );
  if (!worker?.tag) {
    throw new Error(`Worker ${workerName} was not found or has no immutable tag.`);
  }

  const buildResult = await cloudflare(
    `/accounts/${accountId}/builds/workers/${worker.tag}/builds`,
  );
  const builds = normalizeBuilds(buildResult);
  const build = builds.find(
    (entry) => entry?.build_trigger_metadata?.commit_hash === expectedHeadSha,
  );
  if (!build?.build_uuid) {
    throw new Error(`No Cloudflare build matched exact head ${expectedHeadSha}.`);
  }

  const logs = await cloudflare(
    `/accounts/${accountId}/builds/builds/${build.build_uuid}/logs`,
  );
  const lines = (logs?.lines ?? []).map(normalizeLogLine).map(redact);
  const relevant = lines.filter((line) =>
    /error|fail|fatal|exception|permission|unauthor|route|domain|zone|wrangler|deploy|node|limit|quota/i.test(
      line,
    ),
  );

  receipt.ok = true;
  receipt.build = {
    buildUuid: build.build_uuid,
    outcome: build.build_outcome ?? null,
    createdOn: build.created_on ?? null,
    stoppedOn: build.stopped_on ?? null,
    branch: build.build_trigger_metadata?.branch ?? null,
    commitHash: build.build_trigger_metadata?.commit_hash ?? null,
    buildCommand: build.build_trigger_metadata?.build_command ?? null,
    deployCommand: build.build_trigger_metadata?.deploy_command ?? null,
    rootDirectory: build.build_trigger_metadata?.root_directory ?? null,
    triggerSource: build.build_trigger_metadata?.build_trigger_source ?? null,
  };
  receipt.relevantLogLines = (relevant.length > 0 ? relevant : lines.slice(-40)).slice(
    -120,
  );
} catch (error) {
  receipt.error = redact(error instanceof Error ? error.message : error);
  console.error(receipt.error);
  process.exitCode = 1;
}

await mkdir("test-results", { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`Cloudflare diagnostic receipt: ${receiptPath}`);
