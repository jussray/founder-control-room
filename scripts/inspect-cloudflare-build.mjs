#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const accountId = process.env.CF_ACCOUNT_ID?.trim();
const apiToken = process.env.CF_API_TOKEN ?? "";
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

function classifyTokenShape(token) {
  if (!token) {
    return {
      credentialType: "missing",
      matchesAccountId: false,
      hasBearerPrefix: false,
      hasWhitespace: false,
      hasLeadingOrTrailingWhitespace: false,
      hasNonAscii: false,
      hasWrappingQuote: false,
      looksLikeAssignment: false,
      headerSafe: false,
    };
  }

  const shape = {
    credentialType: token.startsWith("cfut_")
      ? "user-token"
      : token.startsWith("cfat_")
        ? "account-token"
        : token.startsWith("cfk_")
          ? "global-key"
          : "legacy-or-unknown",
    matchesAccountId: Boolean(accountId && token === accountId),
    hasBearerPrefix: /^Bearer\s+/i.test(token),
    hasWhitespace: /\s/.test(token),
    hasLeadingOrTrailingWhitespace: token !== token.trim(),
    hasNonAscii: /[^\x20-\x7E]/.test(token),
    hasWrappingQuote: /^(?:".*"|'.*')$/.test(token),
    looksLikeAssignment: /^[A-Za-z_][A-Za-z0-9_]*=/.test(token),
  };

  return {
    ...shape,
    headerSafe: !shape.matchesAccountId
      && !shape.hasBearerPrefix
      && !shape.hasWhitespace
      && !shape.hasNonAscii
      && !shape.hasWrappingQuote
      && !shape.looksLikeAssignment,
  };
}

function tokenPreflightFailure(shape) {
  if (shape.matchesAccountId) {
    return {
      classification: "provider-token-account-id",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token equals the Cloudflare account ID.",
    };
  }
  if (shape.hasNonAscii) {
    return {
      classification: "provider-token-header-unsafe",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token contains non-ASCII characters and cannot be used as an HTTP Authorization value.",
    };
  }
  if (shape.hasBearerPrefix) {
    return {
      classification: "provider-token-header-unsafe",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token includes a Bearer prefix; store only the token value.",
    };
  }
  if (shape.hasWhitespace) {
    return {
      classification: "provider-token-header-unsafe",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token contains whitespace.",
    };
  }
  if (shape.hasWrappingQuote) {
    return {
      classification: "provider-token-header-unsafe",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token is wrapped in quotes.",
    };
  }
  if (shape.looksLikeAssignment) {
    return {
      classification: "provider-token-header-unsafe",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token looks like a variable assignment rather than a token value.",
    };
  }
  if (shape.credentialType === "account-token") {
    return {
      classification: "provider-token-type-unsupported",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: Workers Builds inspection requires a user-scoped Cloudflare API token; account-scoped tokens are unsupported.",
    };
  }
  if (shape.credentialType === "global-key") {
    return {
      classification: "provider-token-type-unsupported",
      message: "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: Workers Builds inspection requires a user-scoped Cloudflare API token; a global API key is unsupported.",
    };
  }
  return null;
}

async function verifyToken(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const body = await response.json().catch(() => null);
  const status = typeof body?.result?.status === "string" ? body.result.status : null;
  return {
    httpStatus: response.status,
    success: body?.success === true,
    status,
    error: redact(providerMessages(body).join("; ") || "") || null,
  };
}

async function cloudflare(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    throw new Error(
      `Cloudflare API ${response.status}: ${redact(providerMessages(body).join("; ") || "request failed")}`,
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

const failures = [];
function fail(message) {
  const safe = redact(message);
  failures.push(safe);
  console.error(safe);
}

const receipt = {
  ok: false,
  workerName,
  apiHostname,
  expectedHeadSha: expectedHeadSha || null,
  inspectedAt: new Date().toISOString(),
  providerCredentials: {
    accountIdPresent: Boolean(accountId),
    apiTokenPresent: Boolean(apiToken),
    tokenShape: classifyTokenShape(apiToken),
    userTokenVerification: null,
    accountTokenVerification: null,
    classification: null,
  },
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

  let originResponse = null;
  try {
    originResponse = await fetch(`https://${apiHostname}/version`, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
  } catch (error) {
    fail(
      `PUBLIC_ORIGIN_TRANSPORT_FAILURE: ${error instanceof Error ? error.message : error}`,
    );
  }

  if (originResponse) {
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
      fail(
        `PUBLIC_ORIGIN_HTTP_FAILURE: ${apiHostname}/version returned HTTP ${originResponse.status}.`,
      );
    }

    if (originServiceIdentity !== workerName || originJson?.service !== workerName) {
      fail(
        `WRONG_SERVICE_ORIGIN: ${apiHostname} is not reaching the canonical ${workerName} Worker.`,
      );
    }

    if (!/^[0-9a-f]{40}$/.test(liveSha ?? "")) {
      fail(
        `INVALID_VERSION_DOCUMENT: ${apiHostname}/version did not return a valid exact gitSha.`,
      );
    } else if (liveSha !== expectedHeadSha) {
      fail(
        `STALE_LIVE_DEPLOYMENT: live Worker SHA ${liveSha} does not match expected head ${expectedHeadSha}.`,
      );
    }
  }

  if (!accountId || !apiToken) {
    receipt.providerCredentials.classification = "provider-credentials-unavailable";
    fail(
      "PROVIDER_CREDENTIALS_UNAVAILABLE: CF_ACCOUNT_ID and the dedicated CLOUDFLARE_BUILDS_API_TOKEN-derived CF_API_TOKEN are required for read-only Cloudflare build inspection.",
    );
  } else {
    const preflight = tokenPreflightFailure(receipt.providerCredentials.tokenShape);
    if (preflight) {
      receipt.providerCredentials.classification = preflight.classification;
      fail(preflight.message);
    } else {
      const userVerification = await verifyToken("/user/tokens/verify");
      receipt.providerCredentials.userTokenVerification = userVerification;

      if (!(userVerification.success && userVerification.status === "active")) {
        if (receipt.providerCredentials.tokenShape.credentialType === "legacy-or-unknown") {
          const accountVerification = await verifyToken(
            `/accounts/${accountId}/tokens/verify`,
          );
          receipt.providerCredentials.accountTokenVerification = accountVerification;
          if (accountVerification.success && accountVerification.status === "active") {
            receipt.providerCredentials.classification = "provider-token-type-unsupported";
            fail(
              "CLOUDFLARE_BUILDS_TOKEN_VERIFICATION_FAILED: credential verifies as an account token, but Workers Builds inspection requires a user-scoped token.",
            );
          } else {
            receipt.providerCredentials.classification = "provider-token-invalid";
            fail(
              `CLOUDFLARE_BUILDS_TOKEN_VERIFICATION_FAILED: user token verification HTTP ${userVerification.httpStatus}; status ${userVerification.status || "unknown"}.`,
            );
          }
        } else {
          receipt.providerCredentials.classification = "provider-token-invalid";
          fail(
            `CLOUDFLARE_BUILDS_TOKEN_VERIFICATION_FAILED: user token verification HTTP ${userVerification.httpStatus}; status ${userVerification.status || "unknown"}.`,
          );
        }
      } else {
        receipt.providerCredentials.classification = "user-token-active";

        try {
          const domains = normalizeDomains(
            await cloudflare(
              `/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(apiHostname)}`,
            ),
          );
          const matchingDomains = domains.filter(
            (entry) => String(entry?.hostname ?? "").toLowerCase() === apiHostname.toLowerCase(),
          );

          if (matchingDomains.length !== 1) {
            fail(
              `Expected exactly one Cloudflare Worker domain for ${apiHostname}; found ${matchingDomains.length}.`,
            );
          } else {
            const domain = matchingDomains[0];
            receipt.domain = {
              hostname: domain?.hostname ?? null,
              service: domain?.service ?? null,
              environment: domain?.environment ?? null,
              zoneName: domain?.zone_name ?? null,
            };

            if (domain?.service !== workerName) {
              fail(
                `Custom domain ${apiHostname} is attached to Worker ${domain?.service || "unknown"}; expected ${workerName}.`,
              );
            }
          }

          const scripts = await cloudflare(`/accounts/${accountId}/workers/scripts`);
          const worker = (Array.isArray(scripts) ? scripts : []).find(
            (entry) => entry?.id === workerName,
          );
          if (!worker?.tag) {
            fail(`Worker ${workerName} was not found or has no immutable tag.`);
          } else {
            const buildResult = await cloudflare(
              `/accounts/${accountId}/builds/workers/${worker.tag}/builds`,
            );
            const builds = normalizeBuilds(buildResult);
            const build = builds.find(
              (entry) => entry?.build_trigger_metadata?.commit_hash === expectedHeadSha,
            );
            if (!build?.build_uuid) {
              fail(`No Cloudflare build matched exact head ${expectedHeadSha}.`);
            } else {
              const logs = await cloudflare(
                `/accounts/${accountId}/builds/builds/${build.build_uuid}/logs`,
              );
              const lines = (logs?.lines ?? []).map(normalizeLogLine).map(redact);
              const relevant = lines.filter((line) =>
                /error|fail|fatal|exception|permission|unauthor|route|domain|zone|wrangler|deploy|node|limit|quota/i.test(
                  line,
                ),
              );

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
            }
          }
        } catch (error) {
          fail(error instanceof Error ? error.message : error);
        }
      }
    }
  }

  receipt.ok = failures.length === 0;
  if (!receipt.ok) {
    receipt.error = failures.join(" | ");
    process.exitCode = 1;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : error);
  receipt.error = failures.join(" | ");
  process.exitCode = 1;
}

await mkdir("test-results", { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`Cloudflare diagnostic receipt: ${receiptPath}`);