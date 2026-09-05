import { createPrivateKey, createSign, type KeyObject } from "node:crypto";
import { Octokit } from "@octokit/rest";

interface CachedInstallationToken {
  token: string;
  expiresAtMs: number;
}

export interface GitHubRepositoryInstallationEvidence {
  repository: string;
  appId: string;
  installationId: string;
  repositorySelection: string;
  permissions: Readonly<Record<string, string>>;
  accountLogin?: string;
  accountType?: string;
}

const tokenCache = new Map<string, CachedInstallationToken>();

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeJsonQuotedString(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  try {
    const decoded = JSON.parse(value) as unknown;
    return typeof decoded === "string" ? decoded : value;
  } catch {
    return value;
  }
}

function unwrapMatchingSingleQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

function decodeBase64Pem(value: string): string {
  const compact = value.replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return value;

  const standardBase64 = compact.replace(/-/g, "+").replace(/_/g, "/");
  if (standardBase64.length % 4 === 1) return value;
  const padded = standardBase64.padEnd(
    standardBase64.length + ((4 - (standardBase64.length % 4)) % 4),
    "=",
  );

  try {
    const decoded = Buffer.from(padded, "base64")
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .trim();
    return decoded.includes("-----BEGIN") && decoded.includes("PRIVATE KEY-----")
      ? decoded
      : value;
  } catch {
    return value;
  }
}

function normalizePrivateKey(value: string): string {
  let normalized = value.trim().replace(/^\uFEFF/, "");
  normalized = unwrapMatchingSingleQuotes(decodeJsonQuotedString(normalized))
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!normalized.includes("-----BEGIN")) {
    normalized = decodeBase64Pem(normalized);
  }

  return normalized.replace(/\r\n/g, "\n").trim();
}

function parseGitHubAppPrivateKey(value: string): KeyObject {
  const normalized = normalizePrivateKey(value);
  if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n/.test(normalized)) {
    throw new Error(
      "GITHUB_PRIVATE_KEY must contain the complete GitHub App RSA private-key PEM (raw PEM, escaped-newline PEM, JSON-quoted PEM, base64/base64url-encoded PEM, or a matching single-quoted transport wrapper)",
    );
  }

  let key: KeyObject;
  try {
    key = createPrivateKey({ key: normalized, format: "pem" });
  } catch {
    throw new Error(
      "GITHUB_PRIVATE_KEY could not be parsed as the complete GitHub App RSA private-key PEM; verify APP_PRIVATE_KEY contains the downloaded .pem contents or a supported transport encoding",
    );
  }

  if (key.type !== "private" || key.asymmetricKeyType !== "rsa") {
    throw new Error("GITHUB_PRIVATE_KEY must be an RSA private key for GitHub App RS256 authentication");
  }
  return key;
}

function parseRepositoryIdentifier(repositoryIdentifier: string): { owner: string; repo: string; canonical: string } {
  const [owner, repo, ...rest] = repositoryIdentifier.trim().split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new Error(`Malformed GitHub repository identifier: ${repositoryIdentifier}`);
  }
  return { owner, repo, canonical: `${owner}/${repo}` };
}

function createGitHubAppClient(appId: string, privateKey: string): Octokit {
  return new Octokit({
    auth: createGitHubAppJwt(appId, privateKey),
    userAgent: "founder-control-room-repo-brain",
  });
}

async function resolveGitHubRepositoryInstallation(
  appId: string,
  privateKey: string,
  repositoryIdentifier: string,
) {
  const normalizedAppId = appId.trim();
  const repository = parseRepositoryIdentifier(repositoryIdentifier);
  const appClient = createGitHubAppClient(normalizedAppId, privateKey);
  const { data: installation } = await appClient.apps.getRepoInstallation({
    owner: repository.owner,
    repo: repository.repo,
  });

  const observedAppId = String(installation.app_id ?? "");
  const installationId = String(installation.id ?? "");
  if (!/^\d+$/.test(installationId)) {
    throw new Error(`GitHub App returned an invalid installation id for ${repository.canonical}`);
  }
  if (observedAppId !== normalizedAppId) {
    throw new Error(
      `GitHub repository installation app identity mismatch for ${repository.canonical}: expected ${normalizedAppId}, observed ${observedAppId || "missing"}`,
    );
  }

  return { appClient, installation, repository, installationId, observedAppId };
}

/** Creates the short-lived RS256 JWT GitHub requires for App authentication. */
export function createGitHubAppJwt(
  appId: string,
  privateKey: string,
  nowMs = Date.now(),
): string {
  if (!/^\d+$/.test(appId.trim())) throw new Error("GITHUB_APP_ID must be numeric");
  const now = Math.floor(nowMs / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = encodeBase64Url(JSON.stringify({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId.trim(),
  }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(parseGitHubAppPrivateKey(privateKey));
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

/**
 * Provider-observed, read-only evidence that one GitHub App installation owns
 * the requested repository and which installation permissions GitHub reports.
 * This does not mint an installation token and cannot publish a Check Run.
 */
export async function observeGitHubRepositoryInstallation(
  appId: string,
  privateKey: string,
  repositoryIdentifier: string,
): Promise<GitHubRepositoryInstallationEvidence> {
  const {
    installation,
    repository,
    installationId,
    observedAppId,
  } = await resolveGitHubRepositoryInstallation(appId, privateKey, repositoryIdentifier);

  const repositorySelection = String(installation.repository_selection ?? "");
  if (!repositorySelection) {
    throw new Error(`GitHub App installation omitted repository selection for ${repository.canonical}`);
  }

  const permissions: Record<string, string> = {};
  for (const [name, value] of Object.entries(installation.permissions ?? {})) {
    if (typeof value === "string") permissions[name] = value;
  }
  const account = installation.account as { login?: string; slug?: string; type?: string } | null;
  const accountLogin = account?.login ?? account?.slug;

  return {
    repository: repository.canonical,
    appId: observedAppId,
    installationId,
    repositorySelection,
    permissions: Object.freeze(permissions),
    ...(accountLogin ? { accountLogin } : {}),
    ...(account?.type ? { accountType: account.type } : {}),
  };
}

/**
 * Resolves the installation owning one repository and returns a cached,
 * repository-scoped installation token. Tokens are refreshed five minutes
 * before GitHub's expiration timestamp. Cache identity includes BOTH App and
 * repository so credentials from separate Apps can never alias each other.
 */
export async function getGitHubInstallationToken(
  appId: string,
  privateKey: string,
  repositoryIdentifier: string,
): Promise<string> {
  const normalizedAppId = appId.trim();
  const repository = parseRepositoryIdentifier(repositoryIdentifier);
  const cacheKey = `${normalizedAppId}:${repository.canonical.toLowerCase()}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs - Date.now() > 5 * 60_000) return cached.token;

  const { appClient, installation } = await resolveGitHubRepositoryInstallation(
    normalizedAppId,
    privateKey,
    repository.canonical,
  );
  const { data: access } = await appClient.apps.createInstallationAccessToken({
    installation_id: installation.id,
    repositories: [repository.repo],
  });
  const expiresAtMs = Date.parse(access.expires_at);
  if (!access.token || !Number.isFinite(expiresAtMs)) {
    throw new Error(`GitHub App returned an invalid installation token for ${repository.canonical}`);
  }

  tokenCache.set(cacheKey, { token: access.token, expiresAtMs });
  return access.token;
}
