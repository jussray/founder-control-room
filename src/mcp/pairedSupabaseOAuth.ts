import { timingSafeEqual } from 'node:crypto';
import { supabaseAuth } from '../lib/supabaseAuthClient.js';
import { supabase } from '../lib/supabaseClient.js';
import type { ExternalMcpIdentity } from './externalTools.js';

const PROJECT_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export const PAIRED_MCP_OAUTH_AUDIENCE = 'authenticated';
export const PAIRED_MCP_OAUTH_SCOPE = 'email';

export interface PairedSupabaseOauthIdentity extends ExternalMcpIdentity {
  projectIds: string[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function commaList(value: string | undefined): string[] {
  return [...new Set((value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean))];
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * The compatibility endpoint is auto-dynamic: every bearer token goes through
 * OAuth/DCR unless it exactly matches the one server-held legacy token. A failed
 * OAuth token never downgrades into static authentication.
 */
export function usesLegacyStaticMcpToken(
  authorizationHeader: string | undefined,
  configuredStaticToken: string | undefined,
): boolean {
  const expected = configuredStaticToken?.trim();
  if (!expected || !authorizationHeader?.startsWith('Bearer ')) return false;
  const actual = authorizationHeader.slice('Bearer '.length).trim();
  return Boolean(actual) && secureEqual(actual, expected);
}

function decodeJwtPayload(token: string): JsonRecord {
  const segments = token.split('.');
  if (segments.length !== 3) throw new Error('OAuth access token must be a JWT');
  try {
    const value: unknown = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    if (!isRecord(value)) throw new Error('claims');
    return value;
  } catch {
    throw new Error('OAuth access token payload is malformed');
  }
}

function claimAudience(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
  return [];
}

function claimScopes(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
  return [];
}

function claimProjects(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) return [];
  return [...new Set(value.map((entry) => entry.trim()).filter((entry) => PROJECT_SLUG.test(entry)))];
}

function configuredServerProjects(env: NodeJS.ProcessEnv): string[] {
  const projects = commaList(env.FCR_REMOTE_MCP_READ_PROJECTS);
  if (projects.length === 0 || projects.some((project) => !PROJECT_SLUG.test(project))) {
    throw new Error('OAuth server project scope is not configured');
  }
  return projects;
}

function authorizationIssuer(env: NodeJS.ProcessEnv): string | null {
  const configured = env.FCR_REMOTE_MCP_OAUTH_ISSUER?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const supabaseUrl = env.SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
}

/**
 * Canonical ChatGPT + Claude OAuth verifier.
 *
 * Supabase performs OAuth 2.1, PKCE, DCR, token signing and user consent. FCR
 * then verifies the current Supabase user and founder allowlist before granting
 * only the server-owned portfolio scope. A custom `mcp_projects` claim may
 * narrow that scope when present, but it is never required and can never widen
 * the server grant.
 *
 * Dynamic clients are accepted by default after Supabase registration and
 * founder consent. Operators may opt into a static client allowlist by setting
 * FCR_REMOTE_MCP_OAUTH_ENFORCE_CLIENT_ALLOWLIST=true.
 */
export async function verifyPairedSupabaseOauthToken(
  token: string,
  env: NodeJS.ProcessEnv,
): Promise<PairedSupabaseOauthIdentity> {
  const issuer = authorizationIssuer(env);
  const audience = env.FCR_REMOTE_MCP_OAUTH_AUDIENCE?.trim() || PAIRED_MCP_OAUTH_AUDIENCE;
  const requiredScope = env.FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE?.trim() || PAIRED_MCP_OAUTH_SCOPE;
  if (!issuer) throw new Error('OAuth issuer is not configured');

  const serverProjects = configuredServerProjects(env);
  const claims = decodeJwtPayload(token);
  const now = Math.floor(Date.now() / 1000);
  const clientId = boundedString(claims.client_id);
  const subject = boundedString(claims.sub);

  if (claims.iss !== issuer) throw new Error('OAuth issuer is not allowed');
  if (!claimAudience(claims.aud).includes(audience)) throw new Error('OAuth audience is not allowed');
  if (!clientId) throw new Error('OAuth client identity is missing');
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('OAuth access token is expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) throw new Error('OAuth access token is not active');
  if (!claimScopes(claims.scope).includes(requiredScope)) throw new Error('OAuth scope is insufficient');

  if (env.FCR_REMOTE_MCP_OAUTH_ENFORCE_CLIENT_ALLOWLIST?.trim() === 'true') {
    const allowedClients = new Set(commaList(env.FCR_REMOTE_MCP_OAUTH_CLIENT_IDS));
    if (allowedClients.size === 0 || !allowedClients.has(clientId)) {
      throw new Error('OAuth client is not allowed');
    }
  }

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
  const user = userData?.user;
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  const userId = typeof user?.id === 'string' ? user.id.trim() : '';
  if (userError || !email || !userId || !subject || subject !== userId) {
    throw new Error('OAuth access token is invalid or revoked');
  }

  const { data: allowRow, error: allowError } = await supabase
    .from('founder_users')
    .select('email,user_id')
    .eq('email', email)
    .maybeSingle();
  if (allowError) throw new Error('Founder allowlist check failed');
  if (!allowRow || (allowRow.user_id && allowRow.user_id !== userId)) {
    throw new Error('OAuth identity is not on the founder allowlist');
  }

  const tokenProjects = claimProjects(claims.mcp_projects);
  const projectIds = tokenProjects.length > 0
    ? tokenProjects.filter((project) => serverProjects.includes(project))
    : serverProjects;
  if (projectIds.length === 0) throw new Error('OAuth project grant does not overlap server scope');

  return { userId, email, clientId, projectIds, authMode: 'oauth' };
}
