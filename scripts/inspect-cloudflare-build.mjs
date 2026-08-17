#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";

const accountId = process.env.CF_ACCOUNT_ID?.trim();
const apiToken = process.env.CF_API_TOKEN ?? "";
const expectedHeadSha =
  process.env.EXPECTED_HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim();
const workerName = process.env.CF_WORKER_NAME?.trim() || "founder-control-room";
const apiHostname =
  process.env.CF_API_HOSTNAME?.trim() || "api.foundercontrolroom.org";
const expectedWorkerGitMode =
  process.env.CF_EXPECT_WORKER_GIT_MODE?.trim() ||
  "disconnected-or-non-promoting";
const receiptPath = "test-results/cloudflare-build-diagnostic.json";
const apiBase = "https://api.cloudflare.com/client/v4";

function redact(value) {
  let text = String(value ?? "");
  for (const secret of [apiToken, accountId]) {
    if (secret) text = text.split(secret).join("[REDACTED]");
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
    hasWrappingQuote: /^(?:"(?:.|\n)*"|'(?:.|\n)*')$/.test(token),
    looksLikeAssignment: /^[A-Za-z_][A-Za-z0-9_]*=/.test(token),
  };

  return {
    ...shape,
    headerSafe:
      !shape.matchesAccountId &&
      !shape.hasBearerPrefix &&
      !shape.hasWhitespace &&
      !shape.hasNonAscii &&
      !shape.hasWrappingQuote &&
      !shape.looksLikeAssignment,
  };
}

function tokenPreflightFailure(shape) {
  if (shape.matchesAccountId) {
    return {
      classification: "provider-token-account-id",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token equals the Cloudflare account ID.",
    };
  }
  if (shape.hasNonAscii) {
    return {
      classification: "provider-token-header-unsafe",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token contains non-ASCII characters and cannot be used as an HTTP Authorization value.",
    };
  }
  if (shape.hasBearerPrefix) {
    return {
      classification: "provider-token-header-unsafe",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token includes a Bearer prefix; store only the token value.",
    };
  }
  if (shape.hasWhitespace) {
    return {
      classification: "provider-token-header-unsafe",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token contains whitespace.",
    };
  }
  if (shape.hasWrappingQuote) {
    return {
      classification: "provider-token-header-unsafe",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token is wrapped in quotes.",
    };
  }
  if (shape.looksLikeAssignment) {
    return {
      classification: "provider-token-header-unsafe",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: configured token looks like a variable assignment rather than a token value.",
    };
  }
  if (shape.credentialType === "account-token") {
    return {
      classification: "provider-token-type-unsupported",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: Workers Builds inspection requires a user-scoped Cloudflare API token; account-scoped tokens are unsupported.",
    };
  }
  if (shape.credentialType === "global-key") {
    return {
      classification: "provider-token-type-unsupported",
      message:
        "CLOUDFLARE_BUILDS_TOKEN_PREFLIGHT_FAILED: Workers Builds inspection requires a user-scoped Cloudflare API token; a global API key is unsupported.",
    };
  }
  return null;
}

async function verifyToken(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const body = await response.json().catch(() => null);
  const status =
    typeof body?.result?.status === "string" ? body.result.status : null;
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
      `Cloudflare API ${response.status}: ${redact(
        providerMessages(body).join("; ") || "request failed",
      )}`,
    );
  }
  return body?.result;
}

function normalizeDomains(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.domains)) return result.domains;
  return [];
}

function normalizeTriggers(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.triggers)) return result.triggers;
  return [];
}

function isNonPromotingDeployCommand(command) {
  return /\bwrangler\s+versions\s+upload\b/i.test(String(command ?? ""));
}

function canTargetProductionBranch(trigger) {
  const includes = Array.isArray(trigger?.branch_includes)
    ? trigger.branch_includes.map((value) => String(value).trim())
    : [];

  if (includes.length === 0) return true;

  return includes.some((branch) => branch === "main" || branch === "*");
}

function sanitizeTrigger(trigger) {
  const deployCommand = redact(trigger?.deploy_command ?? "");
  const branchIncludes = Array.isArray(trigger?.branch_includes)
    ? trigger.branch_includes.map((value) => redact(value))
    : [];
  const branchExcludes = Array.isArray(trigger?.branch_excludes)
    ? trigger.branch_excludes.map((value) => redact(value))
    : [];

  return {
    triggerUuid: trigger?.trigger_uuid ?? null,
    triggerName: redact(trigger?.trigger_name ?? "") || null,
    repoName: redact(trigger?.repo_connection?.repo_name ?? "") || null,
    providerType: trigger?.repo_connection?.provider_type ?? null,
    rootDirectory: redact(trigger?.root_directory ?? "") || null,
    branchIncludes,
    branchExcludes,
    buildCommand: redact(trigger?.build_command ?? "") || null,
    deployCommand: deployCommand || null,
    nonPromotingDeployCommand: isNonPromotingDeployCommand(deployCommand),
    canTargetProductionBranch: canTargetProductionBranch(trigger),
  };
}

const failures = [];
function fail(message) {
  const safe = redact(message);
  failures.push(safe);
  console.error(safe);
}

const receipt = {
  ok: false,
  scope: "cloudflare-worker-git-authority",
  workerName,
  apiHostname,
  expectedHeadSha: expectedHeadSha || null,
  expectedWorkerGitMode,
  canonicalProductionAuthority: "github-manual-deploy-workflow",
  inspectedAt: new Date().toISOString(),
  providerCredentials: {
    accountIdPresent: Boolean(accountId),
    apiTokenPresent: Boolean(apiToken),
    tokenShape: classifyTokenShape(apiToken),
    userTokenVerification: null,
    accountTokenVerification: null,
    classification: null,
  },
  domain: null,
  workerGitAuthority: {
    state: "unknown",
    activeTriggerCount: null,
    promotingTriggerCount: null,
    triggers: [],
  },
  error: null,
};

try {
  if (!expectedHeadSha || !/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
    throw new Error(
      "EXPECTED_HEAD_SHA or GITHUB_SHA must be an exact 40-character lowercase commit SHA.",
    );
  }

  if (expectedWorkerGitMode !== "disconnected-or-non-promoting") {
    throw new Error(
      `Unsupported CF_EXPECT_WORKER_GIT_MODE: ${expectedWorkerGitMode}.`,
    );
  }

  if (!accountId || !apiToken) {
    receipt.providerCredentials.classification =
      "provider-credentials-unavailable";
    fail(
      "PROVIDER_CREDENTIALS_UNAVAILABLE: CF_ACCOUNT_ID and the dedicated FCR_CLOUDFLARE_BUILDS_USER_TOKEN-derived CF_API_TOKEN are required for read-only Worker Git authority inspection.",
    );
  } else {
    const preflight = tokenPreflightFailure(
      receipt.providerCredentials.tokenShape,
    );
    if (preflight) {
      receipt.providerCredentials.classification = preflight.classification;
      fail(preflight.message);
    } else {
      const userVerification = await verifyToken("/user/tokens/verify");
      receipt.providerCredentials.userTokenVerification = userVerification;

      if (!(userVerification.success && userVerification.status === "active")) {
        if (
          receipt.providerCredentials.tokenShape.credentialType ===
          "legacy-or-unknown"
        ) {
          const accountVerification = await verifyToken(
            `/accounts/${accountId}/tokens/verify`,
          );
          receipt.providerCredentials.accountTokenVerification =
            accountVerification;
          if (
            accountVerification.success &&
            accountVerification.status === "active"
          ) {
            receipt.providerCredentials.classification =
              "provider-token-type-unsupported";
            fail(
              "CLOUDFLARE_BUILDS_TOKEN_VERIFICATION_FAILED: credential verifies as an account token, but Workers Builds inspection requires a user-scoped token.",
            );
          } else {
            receipt.providerCredentials.classification =
              "provider-token-invalid";
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
              `/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(
                apiHostname,
              )}`,
            ),
          );
          const matchingDomains = domains.filter(
            (entry) =>
              String(entry?.hostname ?? "").toLowerCase() ===
              apiHostname.toLowerCase(),
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
                `Custom domain ${apiHostname} is attached to Worker ${
                  domain?.service || "unknown"
                }; expected ${workerName}.`,
              );
            }
          }

          const scripts = await cloudflare(
            `/accounts/${accountId}/workers/scripts`,
          );
          const worker = (Array.isArray(scripts) ? scripts : []).find(
            (entry) => entry?.id === workerName,
          );

          if (!worker?.tag) {
            fail(`Worker ${workerName} was not found or has no immutable tag.`);
          } else {
            const triggerResult = await cloudflare(
              `/accounts/${accountId}/builds/workers/${worker.tag}/triggers`,
            );
            const activeTriggers = normalizeTriggers(triggerResult).filter(
              (trigger) =>
                !trigger?.deleted_on && !trigger?.repo_connection?.deleted_on,
            );
            const sanitizedTriggers = activeTriggers.map(sanitizeTrigger);
            const promotingTriggers = sanitizedTriggers.filter(
              (trigger) =>
                trigger.canTargetProductionBranch &&
                !trigger.nonPromotingDeployCommand,
            );

            receipt.workerGitAuthority.activeTriggerCount =
              sanitizedTriggers.length;
            receipt.workerGitAuthority.promotingTriggerCount =
              promotingTriggers.length;
            receipt.workerGitAuthority.triggers = sanitizedTriggers;

            if (sanitizedTriggers.length === 0) {
              receipt.workerGitAuthority.state = "disconnected";
            } else if (promotingTriggers.length === 0) {
              receipt.workerGitAuthority.state = "non-promoting";
            } else {
              receipt.workerGitAuthority.state =
                "automatic-production-deploy-conflict";
              fail(
                `WORKER_GIT_AUTO_DEPLOY_AUTHORITY_CONFLICT: found ${promotingTriggers.length} active Worker Git trigger(s) that can promote production. Disconnect Worker Builds or use a non-promoting "wrangler versions upload" deploy command.`,
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
console.log(`Cloudflare Worker Git authority receipt: ${receiptPath}`);
