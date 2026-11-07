#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const endpoint = process.env.CF_MCP_API_URL?.trim() || "https://mcp.cloudflare.com/mcp";
const token = process.env.CF_MCP_API_TOKEN?.trim() || "";
const accountId = process.env.CF_ACCOUNT_ID?.trim() || "";
const expectedHeadSha =
  process.env.EXPECTED_HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim() || "";
const receiptPath = "test-results/cloudflare-mcp-read-receipt.json";
const protocolVersion = "2025-06-18";
let sessionId = "";

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function validateInputs() {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    fail("CLOUDFLARE_MCP_ENDPOINT_INVALID", "CF_MCP_API_URL must be an absolute URL.");
  }

  if (url.protocol !== "https:" || url.hostname !== "mcp.cloudflare.com" || url.pathname !== "/mcp") {
    fail(
      "CLOUDFLARE_MCP_ENDPOINT_UNTRUSTED",
      "provider probe is pinned to https://mcp.cloudflare.com/mcp",
    );
  }
  if (url.search || url.hash) {
    fail(
      "CLOUDFLARE_MCP_ENDPOINT_UNTRUSTED",
      "provider probe does not accept endpoint query strings or fragments",
    );
  }
  if (!/^[0-9a-f]{32}$/.test(accountId)) {
    fail("CLOUDFLARE_ACCOUNT_ID_INVALID", "CF_ACCOUNT_ID must be a lowercase 32-character hex identifier.");
  }
  if (expectedHeadSha && !/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
    fail("EXPECTED_HEAD_SHA_INVALID", "EXPECTED_HEAD_SHA must be a lowercase 40-character commit SHA.");
  }
  if (!token) {
    fail("CLOUDFLARE_MCP_TOKEN_MISSING", "CF_MCP_API_TOKEN is required.");
  }
  if (/^Bearer\s+/i.test(token) || /\s/.test(token) || /[^\x20-\x7E]/.test(token)) {
    fail(
      "CLOUDFLARE_MCP_TOKEN_HEADER_UNSAFE",
      "store only the raw API token value without Bearer prefix or whitespace",
    );
  }
}

function redact(value) {
  let text = String(value ?? "");
  for (const secret of [token, accountId]) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:cfut_|cfat_|cfk_)?[A-Za-z0-9_-]{32,}\b/g, "[REDACTED_TOKEN]")
    .slice(0, 4000);
}

function parseSsePayload(text) {
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  if (!dataLines.length) {
    fail("CLOUDFLARE_MCP_EMPTY_EVENT_STREAM", "provider returned an empty event stream");
  }
  return JSON.parse(dataLines[dataLines.length - 1]);
}

function headers() {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
    "mcp-protocol-version": protocolVersion,
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  };
}

async function post(body, readBody = true) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  const returnedSessionId = response.headers.get("mcp-session-id")?.trim();
  if (returnedSessionId) sessionId = returnedSessionId;

  const text = readBody ? await response.text() : "";
  if (!readBody) await response.body?.cancel();
  if (!response.ok) {
    fail(
      "CLOUDFLARE_MCP_HTTP_FAILURE",
      `provider returned HTTP ${response.status}${text ? `: ${redact(text)}` : ""}`,
    );
  }
  return { response, text };
}

async function rpc(method, params) {
  const { response, text } = await post({
    jsonrpc: "2.0",
    id: randomUUID(),
    method,
    ...(params ? { params } : {}),
  });

  if (!text.trim()) {
    fail("CLOUDFLARE_MCP_EMPTY_RESPONSE", `provider returned no body for ${method}`);
  }

  const payload = response.headers.get("content-type")?.includes("text/event-stream")
    ? parseSsePayload(text)
    : JSON.parse(text);

  if (payload?.error) {
    fail(
      "CLOUDFLARE_MCP_RPC_FAILURE",
      `${method} failed with ${payload.error.code}: ${redact(payload.error.message)}`,
    );
  }
  if (payload?.result === undefined) {
    fail("CLOUDFLARE_MCP_RESULT_MISSING", `${method} returned no result`);
  }
  return payload.result;
}

async function notify(method, params) {
  await post(
    {
      jsonrpc: "2.0",
      method,
      ...(params ? { params } : {}),
    },
    false,
  );
}

function collectText(value, seen = new Set()) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectText(entry, seen));
  }
  return Object.values(value).flatMap((entry) => collectText(entry, seen));
}

function containsBoolean(value, key, expected, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key)) {
    return value[key] === expected;
  }
  const entries = Array.isArray(value) ? value : Object.values(value);
  return entries.some((entry) => containsBoolean(entry, key, expected, seen));
}

function resultProvesRead(result) {
  if (result?.isError === true) return false;
  if (containsBoolean(result, "providerSuccess", true) && containsBoolean(result, "accountMatched", true)) {
    return true;
  }

  for (const text of collectText(result)) {
    try {
      const parsed = JSON.parse(text);
      if (
        containsBoolean(parsed, "providerSuccess", true) &&
        containsBoolean(parsed, "accountMatched", true)
      ) {
        return true;
      }
    } catch {
      if (
        /["']?providerSuccess["']?\s*[:=]\s*true/i.test(text) &&
        /["']?accountMatched["']?\s*[:=]\s*true/i.test(text)
      ) {
        return true;
      }
    }
  }
  return false;
}

async function writeReceipt(receipt) {
  await mkdir("test-results", { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

const receipt = {
  kind: "fcr/cloudflare-api-mcp-read-receipt@v1",
  expectedHeadSha: expectedHeadSha || null,
  provider: "cloudflare",
  endpoint: "https://mcp.cloudflare.com/mcp",
  protocolVersion,
  authMode: "bearer-api-token",
  operation: {
    mcpTool: "execute",
    httpMethod: "GET",
    resource: "account-details",
  },
  capability: {
    searchAdvertised: false,
    executeAdvertised: false,
  },
  providerRead: {
    accountMatched: false,
  },
  status: "failed",
  errorCode: null,
  error: null,
  observedAt: new Date().toISOString(),
};

try {
  validateInputs();

  await rpc("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "founder-control-room-provider-probe", version: "1.0.0" },
  });
  await notify("notifications/initialized");

  const toolsResult = await rpc("tools/list");
  const toolNames = Array.isArray(toolsResult?.tools)
    ? toolsResult.tools.map((tool) => tool?.name).filter(Boolean)
    : [];
  receipt.capability.searchAdvertised = toolNames.includes("search");
  receipt.capability.executeAdvertised = toolNames.includes("execute");

  if (!receipt.capability.searchAdvertised || !receipt.capability.executeAdvertised) {
    fail(
      "CLOUDFLARE_MCP_CAPABILITY_DRIFT",
      "official Cloudflare API MCP did not advertise both search and execute",
    );
  }

  const safeAccountId = accountId;
  const code = `async () => {
  const response = await cloudflare.request({
    method: "GET",
    path: "/accounts/${safeAccountId}"
  });
  return {
    providerSuccess: response?.success === true,
    accountMatched: response?.result?.id === "${safeAccountId}"
  };
}`;

  const executeResult = await rpc("tools/call", {
    name: "execute",
    arguments: {
      account_id: safeAccountId,
      code,
    },
  });

  if (!resultProvesRead(executeResult)) {
    fail(
      "CLOUDFLARE_MCP_READ_UNPROVEN",
      "MCP execute completed but did not prove the expected account via the fixed GET-only request",
    );
  }

  receipt.providerRead.accountMatched = true;
  receipt.status = "passed";
  await writeReceipt(receipt);
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  receipt.errorCode = error?.code || "CLOUDFLARE_MCP_PROBE_FAILED";
  receipt.error = redact(error instanceof Error ? error.message : String(error));
  await writeReceipt(receipt);
  console.error(JSON.stringify(receipt, null, 2));
  process.exitCode = 1;
}
