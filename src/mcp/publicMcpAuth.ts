/** Verify the Supabase Auth bearer token BEFORE trusting its decoded claims. */
import type { PublicMcpUser } from './publicTenantAccess.js';

// Only signed, resource-bound tokens may reach the public MCP tools.
// Generic Supabase aud=authenticated is NOT an MCP resource audience.
export const FCR_PUBLIC_MCP_RESOURCE = 'https://api.foundercontrolroom.org/mcp/public';
const REQUIRED_SCOPE = 'openid';
const MAX_BEARER_BYTES = 8192;

type JwtClaims = Record<string, unknown>;
export type VerifiedAuthUser = { id: string; is_anonymous?: boolean };
export type PublicTokenVerifier = (token: string) => Promise<VerifiedAuthUser | null>;

function jwtClaims(token: string): JwtClaims | null {
  if (token.length > MAX_BEARER_BYTES || token.split('.').length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch { return null; }
}

export async function authenticatePublicMcp(
  token: string,
  config: { issuer: string; allowedClientIds: readonly string[]; now?: number },
  verify: PublicTokenVerifier,
): Promise<PublicMcpUser | null> {
  if (!config.issuer || !config.allowedClientIds.length) return null;
  const claims = jwtClaims(token);
  if (!claims || claims.iss !== config.issuer) return null;
  // A token must identify the intended MCP resource in a signed audience or
  // resource claim, even when its generic Supabase audience is authenticated.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes('authenticated') && !audiences.includes(FCR_PUBLIC_MCP_RESOURCE)) return null;
  const boundToResource = audiences.includes(FCR_PUBLIC_MCP_RESOURCE)
    || claims.resource === FCR_PUBLIC_MCP_RESOURCE;
  if (!boundToResource) return null;
  const scope = typeof claims.scope === 'string' ? claims.scope.split(/\s+/) : [];
  if (!scope.includes(REQUIRED_SCOPE)) return null;
  if (typeof claims.sub !== 'string' || !claims.sub) return null;
  if (typeof claims.client_id !== 'string' || !config.allowedClientIds.includes(claims.client_id)) return null;
  const now = config.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) return null;
  // Validation of JWT payload is NOT authentication. The verifier calls
  // Supabase Auth getUser(token) to validate signature and live user status.
  const verified = await verify(token).catch(() => null);
  if (!verified || verified.is_anonymous || verified.id !== claims.sub) return null;
  return { id: verified.id, clientId: claims.client_id };
}
