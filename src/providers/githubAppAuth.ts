import { createSign } from "node:crypto";
import { Octokit } from "@octokit/rest";

interface CachedInstallationToken {
  token: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedInstallationToken>();

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
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
  const signature = signer.sign(normalizePrivateKey(privateKey));
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

/**
 * Resolves the installation owning one repository and returns a cached,
 * repository-scoped installation token. Tokens are refreshed five minutes
 * before GitHub's expiration timestamp.
 */
export async function getGitHubInstallationToken(
  appId: string,
  privateKey: string,
  repositoryIdentifier: string,
): Promise<string> {
  const [owner, repo, ...rest] = repositoryIdentifier.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new Error(`Malformed GitHub repository identifier: ${repositoryIdentifier}`);
  }

  const cached = tokenCache.get(repositoryIdentifier);
  if (cached && cached.expiresAtMs - Date.now() > 5 * 60_000) return cached.token;

  const appClient = new Octokit({
    auth: createGitHubAppJwt(appId, privateKey),
    userAgent: "founder-control-room-repo-brain",
  });
  const { data: installation } = await appClient.apps.getRepoInstallation({ owner, repo });
  const { data: access } = await appClient.apps.createInstallationAccessToken({
    installation_id: installation.id,
    repositories: [repo],
  });
  const expiresAtMs = Date.parse(access.expires_at);
  if (!access.token || !Number.isFinite(expiresAtMs)) {
    throw new Error(`GitHub App returned an invalid installation token for ${repositoryIdentifier}`);
  }

  tokenCache.set(repositoryIdentifier, { token: access.token, expiresAtMs });
  return access.token;
}
