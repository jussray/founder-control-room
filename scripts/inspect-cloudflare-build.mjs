#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";

const accountId = process.env.CF_ACCOUNT_ID?.trim();
const apiToken = process.env.CF_API_TOKEN ?? "";
const expectedHeadSha =
  process.env.EXPECTED_HEAD_SHA?.trim() || process.env.GITHUB_SHA?.trim();
const workerName = process.env.CF_WORKER_NAME?.trim() || "founder-control-room";
const apiHostname =
  process.env.CF_API_HOSTNAME?.trim() || "api.foundercontrolroom.org";
const authorityPolicyPath =
  process.env.CF_WORKER_GIT_AUTHORITY_POLICY?.trim() ||
  "config/cloudflare-worker-git-authority-policy.json";
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

function isNonPromotingDeployCommand(command) {
  return /\bwrangler\s+versions\s+upload\b/i.test(String(command ?? ""));
}

function normalizeDeployCommand(command) {
  return String(command ?? "").trim().replace(/\s+/g, " ");
}

function matchesDesiredDeployCommand(command, policy) {
  return (
    normalizeDeployCommand(command) ===
    normalizeDeployCommand(policy?.currentDesiredDeployCommand)
  );
}

async function loadAuthorityPolicy(path) {
  const raw = await readFile(path, "utf8");
  const policy = JSON.parse(raw);
  const allowedSafeStates = Array.isArray(policy?.allowedSafeStates)
    ? policy.allowedSafeStates
    : [];
  const historicalDisconnect = Array.isArray(policy?.historicalDecisions)
    ? policy.historicalDecisions.find((entry) => entry?.decision === "disconnect")
    : null;

  const errors = [];
  if (policy?.kind !== "fcr/cloudflare-worker-git-authority-policy@v1") {
    errors.push("policy kind must be fcr/cloudflare-worker-git-authority-policy@v1");
  }
  if (policy?.policyVersion !== 1) errors.push("policyVersion must be 1");
  if (policy?.workerName !== workerName) errors.push("policy workerName mismatch");
  if (policy?.apiHostname !== apiHostname) errors.push("policy apiHostname mismatch");
  if (policy?.canonicalProductionAuthority !== "github-manual-deploy-workflow") {
    errors.push("canonical production authority must remain the GitHub manual deploy workflow");
  }
  if (policy?.safetyInvariant !== "native-worker-git-must-not-promote-production") {
    errors.push("policy safety invariant is unsupported");
  }
  if (!allowedSafeStates.includes("disconnected") || !allowedSafeStates.includes("non-promoting")) {
    errors.push("allowedSafeStates must preserve disconnected and non-promoting safety states");
  }
  if (allowedSafeStates.includes("automatic-production-deploy-conflict")) {
    errors.push("promoting Worker Git may not be an allowed safe state");
  }
  if (policy?.currentDesiredState !== "non-promoting") {
    errors.push("current desired Worker Git state must be non-promoting");
  }
  if (!isNonPromotingDeployCommand(policy?.currentDesiredDeployCommand)) {
    errors.push("current desired deploy command must use wrangler versions upload");
  }
  if (policy?.policyRole !== "desired-state-only" || policy?.canAuthorizeProviderMutation !== false) {
    errors.push("desired-state policy may not authorize provider mutation");
  }
  if (
    policy?.currentFounderIntent?.source !== "current_authenticated_founder" ||
    policy?.currentFounderIntent?.status !== "current" ||
    policy?.currentFounderIntent?.persistsUntilSuperseded !== true ||
    policy?.currentFounderIntent?.freshApprovalRequiredForConsequentialMutation !== true ||
    policy?.currentFounderIntent?.historicalDecisionsCanAuthorize !== false
  ) {
    errors.push("current founder intent policy must remain current-until-superseded and non-executing");
  }
  if (
    historicalDisconnect?.status !== "superseded-safe-fallback" ||
    historicalDisconnect?.maySatisfySafetyInvariant !== true ||
    historicalDisconnect?.isCurrentPreference !== false ||
    historicalDisconnect?.canAuthorizeProviderMutation !== false
  ) {
    errors.push("historical disconnect decision must remain a non-authorizing safe fallback");
  }

  if (errors.length > 0) {
    throw new Error(`WORKER_GIT_AUTHORITY_POLICY_INVALID: ${errors.join("; ")}`);
  }

  return policy;
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

let authorityPolicy = null;
let policyLoadError = null;
try {
  authorityPolicy = await loadAuthorityPolicy(authorityPolicyPath);
} catch (error) {
  policyLoadError = error instanceof Error ? error.message : String(error);
}

const inspectedAt = new Date().toISOString();
const receipt = {
  ok: false,
  scope: "cloudflare-worker-git-authority",
  workerName,
  apiHostname,
  expectedHeadSha: expectedHeadSha || null,
  authorityPolicyPath,
  canonicalProductionAuthority:
    authorityPolicy?.canonicalProductionAuthority || "github-manual-deploy-workflow",
  inspectedAt,
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
    desiredDeployCommandMatched: null,
    triggers: [],
  },
  truthLanes: {
    observed: {
      source: "cloudflare-provider-readback",
      state: "unknown",
      observedAt: inspectedAt,
    },
    safety: {
      invariant:
        authorityPolicy?.safetyInvariant ||
        "native-worker-git-must-not-promote-production",
      satisfied: null,
    },
    allowed: {
      safeStates: authorityPolicy?.allowedSafeStates || [],
    },
    desired: {
      state: authorityPolicy?.currentDesiredState || null,
      deployCommand: authorityPolicy?.currentDesiredDeployCommand || null,
      source: "current-founder-intent-policy",
      status: authorityPolicy?.currentFounderIntent?.status || null,
      persistsUntilSuperseded:
        authorityPolicy?.currentFounderIntent?.persistsUntilSuperseded ?? null,
      canAuthorizeProviderMutation: false,
    },
    authority: {
      production: authorityPolicy?.canonicalProductionAuthority || "github-manual-deploy-workflow",
      freshApprovalRequiredForConsequentialMutation:
        authorityPolicy?.currentFounderIntent
          ?.freshApprovalRequiredForConsequentialMutation ?? true,
    },
    drift: {
      class: "unknown",
      currentPreferenceMatched: null,
    },
  },
  analytics: {
    observationOnly: true,
    observedMode: "unknown",
    safetySatisfied: null,
    desiredMatched: null,
    driftClass: "unknown",
    observedAt: inspectedAt,
    canAuthorizeProviderMutation: false,
  },
  error: null,
};

function applyAuthorityPolicy(observedState, desiredDeployCommandMatched = true) {
  receipt.truthLanes.observed.state = observedState;
  receipt.analytics.observedMode = observedState;

  if (!authorityPolicy) return;

  const safetySatisfied = authorityPolicy.allowedSafeStates.includes(observedState);
  const currentPreferenceMatched =
    safetySatisfied &&
    observedState === authorityPolicy.currentDesiredState &&
    (observedState !== "non-promoting" || desiredDeployCommandMatched);
  const driftClass = !safetySatisfied
    ? "unsafe"
    : currentPreferenceMatched
      ? "none"
      : "safe-but-not-current";

  receipt.truthLanes.safety.satisfied = safetySatisfied;
  receipt.truthLanes.drift.class = driftClass;
  receipt.truthLanes.drift.currentPreferenceMatched = currentPreferenceMatched;
  receipt.analytics.safetySatisfied = safetySatisfied;
  receipt.analytics.desiredMatched = currentPreferenceMatched;
  receipt.analytics.driftClass = driftClass;
}

try {
  if (!expectedHeadSha || !/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
    throw new Error(
      "EXPECTED_HEAD_SHA or GITHUB_SHA must be an exact 40-character lowercase commit SHA.",
    );
  }

  if (policyLoadError) {
    throw new Error(policyLoadError);
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
            const desiredDeployCommandMatched = sanitizedTriggers.some(
              (trigger) =>
                trigger.canTargetProductionBranch &&
                trigger.nonPromotingDeployCommand &&
                matchesDesiredDeployCommand(trigger.deployCommand, authorityPolicy),
            );

            receipt.workerGitAuthority.activeTriggerCount =
              sanitizedTriggers.length;
            receipt.workerGitAuthority.promotingTriggerCount =
              promotingTriggers.length;
            receipt.workerGitAuthority.desiredDeployCommandMatched =
              desiredDeployCommandMatched;
            receipt.workerGitAuthority.triggers = sanitizedTriggers;

            if (sanitizedTriggers.length === 0) {
              receipt.workerGitAuthority.state = "disconnected";
              applyAuthorityPolicy("disconnected");
              fail(
                `WORKER_GIT_CURRENT_TOPOLOGY_DRIFT: observed disconnected is safe but not the current desired state ${authorityPolicy.currentDesiredState}. Historical safe fallbacks do not override current founder intent.`,
              );
            } else if (promotingTriggers.length === 0) {
              receipt.workerGitAuthority.state = "non-promoting";
              applyAuthorityPolicy(
                "non-promoting",
                desiredDeployCommandMatched,
              );
              if (!desiredDeployCommandMatched) {
                fail(
                  `WORKER_GIT_DESIRED_DEPLOY_COMMAND_DRIFT: active Worker Git is non-promoting but does not use the current desired deploy command "${authorityPolicy.currentDesiredDeployCommand}".`,
                );
              }
            } else {
              receipt.workerGitAuthority.state =
                "automatic-production-deploy-conflict";
              applyAuthorityPolicy("automatic-production-deploy-conflict");
              fail(
                `WORKER_GIT_AUTO_DEPLOY_AUTHORITY_CONFLICT: found ${promotingTriggers.length} active Worker Git trigger(s) that can promote production. Current desired topology keeps Worker Git connected but non-promoting with "${authorityPolicy.currentDesiredDeployCommand}"; production promotion remains a separately approved GitHub manual deploy.`,
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