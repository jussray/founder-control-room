/** Resource-bound, non-cookie authentication for the separate ChatGPT Site. */
export const COMMAND_CENTER_SITE_RESOURCE = 'https://api.foundercontrolroom.org/site/command-center';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BEARER_LENGTH = 8192;

type Claims = Record<string, unknown>;
export type CommandCenterVerifiedUser = Readonly<{
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
}>;
export type CommandCenterActor =
  | Readonly<{ role: 'owner'; userId: string; clientId: string }>
  | Readonly<{ role: 'customer'; userId: string; clientId: string }>;
export type CommandCenterAccessConfig = Readonly<{
  issuer: string;
  ownerUserId: string;
  allowedClientIds: readonly string[];
  now?: number;
}>;

function parseClaims(token: string): Claims | null {
  if (token.length > MAX_BEARER_LENGTH || token.split('.').length !== 3) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as Claims : null;
  } catch {
    return null;
  }
}

/**
 * JWT decoding is only for early rejection. The caller MUST verify the live
 * user with the issuer, including token signature and session status.
 */
export async function resolveCommandCenterActor(
  token: string,
  config: CommandCenterAccessConfig,
  verify: (token: string) => Promise<CommandCenterVerifiedUser | null>,
  founderAllowlisted: (immutableUserId: string) => Promise<boolean>,
): Promise<CommandCenterActor | null> {
  if (!config.issuer || !UUID.test(config.ownerUserId) || !config.allowedClientIds.length) return null;
  const claims = parseClaims(token);
  if (!claims || claims.iss !== config.issuer || !UUID.test(String(claims.sub ?? ''))) return null;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.resource !== undefined && claims.resource !== COMMAND_CENTER_SITE_RESOURCE) return null;
  // Supabase OAuth JWTs normally have aud=authenticated plus a signed client_id.
  // scope/resource are NOT standard access-token claims; they are optional custom
  // hook claims. The exact registered OAuth client ID is mandatory either way.
  const validAudience = audience.includes(COMMAND_CENTER_SITE_RESOURCE) || audience.includes('authenticated');
  if (!validAudience) return null;
  if (typeof claims.client_id !== 'string' || !config.allowedClientIds.includes(claims.client_id)) return null;
  const now = config.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > now + 30) return null;
  const verified = await verify(token).catch(() => null);
  if (!verified || verified.is_anonymous || verified.id !== claims.sub) return null;
  if (verified.id === config.ownerUserId) {
    // Never promote by mutable email; this must be bound in founder_users
    // to the exact immutable auth.users UUID of the authenticated actor.
    const allowed = await founderAllowlisted(verified.id).catch(() => false);
    return allowed ? { role: 'owner', userId: verified.id, clientId: claims.client_id } : null;
  }
  return { role: 'customer', userId: verified.id, clientId: claims.client_id };
}
