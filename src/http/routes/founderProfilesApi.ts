import { createPublicKey, sign, verify } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { hashFcrApiToken } from '../../connectionVault/tokens.js';
import { supabase } from '../../lib/supabaseClient.js';

export const founderProfilesApiRouter = Router();
// FCR's existing connection-vault tokens are SHA-256 hashed, short-lived,
// project-scoped and revocable. Cloudflare Access JWT is an independent gate.
type Dictionary = Record<string, unknown>;
type Authed = Request & { founderUserId?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const B64 = /^[A-Za-z0-9_-]+$/;
const COLUMNS = 'id,display_name,headline,bio,website_url,created_at,updated_at';
let cachedKeys: { issuer: string; expires: number; values: JsonWebKey[] } | null = null;

function object(value: unknown): Dictionary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_input');
  return value as Dictionary;
}
function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
    ? value.trim() : null;
}
function permitted(input: Dictionary, allowed: string[]): boolean {
  return Object.keys(input).every(key => allowed.includes(key));
}
function failure(res: Response, status: number, error: string) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error });
}
export function parseProfile(input: unknown, partial = false): Dictionary {
  const data = object(input);
  if (!permitted(data, ['displayName','headline','bio','websiteUrl']) ||
      (partial && Object.keys(data).length === 0) ||
      (!partial && !text(data.displayName, 120))) throw new Error('invalid_input');
  const out: Dictionary = {};
  if ('displayName' in data) {
    const name = text(data.displayName, 120);
    if (!name) throw new Error('invalid_input');
    out.display_name = name;
  }
  for (const [field, column, max] of [['headline','headline',200],['bio','bio',1200]] as const) {
    if (field in data) {
      if (data[field] !== null && data[field] !== '' && !text(data[field], max)) throw new Error('invalid_input');
      out[column] = text(data[field], max) ?? '';
    }
  }
  if ('websiteUrl' in data) {
    const website = data.websiteUrl === '' || data.websiteUrl === null ? null : text(data.websiteUrl, 300);
    if (data.websiteUrl !== null && data.websiteUrl !== '' && !website) throw new Error('invalid_input');
    if (website) {
      let parsed: URL;
      try { parsed = new URL(website); } catch { throw new Error('invalid_input'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid_input');
    }
    out.website_url = website;
  }
  return out;
}
export function parseLead(input: unknown) {
  const data = object(input);
  if (!permitted(data, ['name','email','interest','source','consent'])) throw new Error('invalid_input');
  const name = text(data.name, 120);
  const email = text(data.email, 254)?.toLowerCase();
  const interest = text(data.interest, 200);
  const source = data.source === undefined ? 'fcr-api' : text(data.source, 80);
  if (!name || !email || !EMAIL.test(email) || !interest || !source || data.consent !== true) {
    throw new Error('invalid_input');
  }
  return { name, email, interest, source };
}
function decode(segment: string): Dictionary {
  if (!B64.test(segment) || segment.length > 6000) throw new Error('invalid_jwt');
  return object(JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')));
}
async function accessKeys(issuer: string) {
  if (cachedKeys?.issuer === issuer && cachedKeys.expires > Date.now()) return cachedKeys.values;
  const reply = await fetch(issuer + '/cdn-cgi/access/certs', {
    headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(3500),
  });
  if (!reply.ok) throw new Error('access_jwks_unavailable');
  const value: unknown = await reply.json();
  const keys = object(value).keys;
  if (!Array.isArray(keys) || keys.length > 20) throw new Error('access_jwks_invalid');
  const values = keys.filter((key): key is JsonWebKey => {
    if (!key || typeof key !== 'object') return false;
    const obj = key as Dictionary;
    return obj.kty === 'RSA' && obj.alg === 'RS256' &&
      typeof obj.kid === 'string' && typeof obj.n === 'string' && typeof obj.e === 'string';
  });
  if (!values.length) throw new Error('access_jwks_invalid');
  cachedKeys = { issuer, values, expires: Date.now() + 5 * 60_000 };
  return values;
}
export async function verifyAccessAssertion(jwt: string, env = process.env): Promise<string> {
  const issuer = env.FCR_PROFILES_ACCESS_ISSUER?.trim();
  const aud = env.FCR_PROFILES_ACCESS_AUD?.trim();
  if (!issuer || !aud || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(issuer)) {
    throw new Error('access_not_configured');
  }
  if (!jwt || jwt.length > 9000) throw new Error('unauthorized');
  const parts = jwt.split('.');
  if (parts.length !== 3 || !parts.every(p => B64.test(p))) throw new Error('unauthorized');
  const header = decode(parts[0]), claims = decode(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  const audienceAllowed = claims.aud === aud ||
    (Array.isArray(claims.aud) && claims.aud.includes(aud));
  const email = text(claims.email, 254)?.toLowerCase();
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      claims.iss !== issuer || !audienceAllowed || typeof claims.sub !== 'string' ||
      typeof claims.exp !== 'number' || claims.exp <= now ||
      (typeof claims.nbf === 'number' && claims.nbf > now + 30) ||
      !email || !EMAIL.test(email)) throw new Error('unauthorized');
  const jwk = (await accessKeys(issuer)).find(k => k.kid === header.kid);
  if (!jwk || !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
    createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) {
    throw new Error('unauthorized');
  }
  return email;
}
function gate(scope: string) {
  return async (req: Authed, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const key = req.get('x-api-key') ?? '';
    const assertion = req.get('cf-access-jwt-assertion') ?? '';
    if (!process.env.FCR_PROFILES_ACCESS_ISSUER || !process.env.FCR_PROFILES_ACCESS_AUD) {
      return failure(res, 503, 'founder_api_not_configured');
    }
    if (!/^fcr_[a-z]{3}_[A-Za-z0-9_-]{40,55}$/.test(key) || !assertion) {
      return failure(res, 401, 'unauthorized');
    }
    let email: string;
    try { email = await verifyAccessAssertion(assertion); }
    catch { return failure(res, 401, 'unauthorized'); }
    try {
      const { data: founder, error: founderError } = await supabase.from('founder_users')
        .select('user_id').eq('email', email).maybeSingle();
      if (founderError) throw founderError;
      if (!founder?.user_id || !UUID.test(founder.user_id)) return failure(res, 403, 'forbidden');
      const { data: project, error: projectError } = await supabase.from('projects')
        .select('id').eq('slug', 'founder-control-room').maybeSingle();
      if (projectError || !project?.id) throw new Error('project_not_found');
      const { data: token, error: tokenError } = await supabase.from('fcr_api_tokens')
        .select('id,project_id,environment,scopes,expires_at,revoked_at')
        .eq('token_hash', hashFcrApiToken(key)).maybeSingle();
      if (tokenError) throw tokenError;
      if (!token || token.project_id !== project.id || token.environment !== 'production' ||
          token.revoked_at || Date.parse(token.expires_at) <= Date.now()) {
        return failure(res, 401, 'unauthorized');
      }
      if (!Array.isArray(token.scopes) || !token.scopes.includes(scope)) {
        return failure(res, 403, 'insufficient_scope');
      }
      // Existing vault function records an admitted attempt (202), not a fabricated outcome.
      const { error: auditError } = await supabase.rpc('record_fcr_api_token_usage', {
        p_token_id: token.id, p_project_id: project.id,
        p_route: req.path.startsWith('/leads') ? '/api/v1/leads' : '/api/v1/founder-profiles',
        p_method: req.method, p_capability: scope, p_status_code: 202, p_connection_count: 0,
      });
      if (auditError) throw auditError;
      req.founderUserId = founder.user_id;
      next();
    } catch {
      return failure(res, 503, 'founder_api_unavailable');
    }
  };
}
function present(row: Dictionary) {
  return {
    id: row.id, displayName: row.display_name, headline: row.headline,
    bio: row.bio, websiteUrl: row.website_url,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function bad(res: Response) { return failure(res, 400, 'invalid_input'); }
function missing(res: Response) { return failure(res, 404, 'profile_not_found'); }
// Liveness only, no provider or database readiness claim.
founderProfilesApiRouter.get('/health', (_req, res) =>
  res.set('Cache-Control', 'no-store').json({ ok: true, service: 'founder-profiles-api' }));
founderProfilesApiRouter.get('/founder-profiles', gate('founder_profiles:read'), async (req: Authed, res) => {
  const { data, error } = await supabase.from('founder_profiles').select(COLUMNS)
    .eq('owner_user_id', req.founderUserId!).is('deleted_at', null).limit(1);
  if (error) return failure(res, 503, 'profile_storage_unavailable');
  return res.json({ profiles: (data ?? []).map(present) });
});
founderProfilesApiRouter.get('/founder-profiles/:id', gate('founder_profiles:read'), async (req: Authed, res) => {
  if (!UUID.test(req.params.id)) return bad(res);
  const { data, error } = await supabase.from('founder_profiles').select(COLUMNS)
    .eq('id', req.params.id).eq('owner_user_id', req.founderUserId!)
    .is('deleted_at', null).maybeSingle();
  if (error) return failure(res, 503, 'profile_storage_unavailable');
  return data ? res.json({ profile: present(data) }) : missing(res);
});
founderProfilesApiRouter.post('/founder-profiles', gate('founder_profiles:write'), async (req: Authed, res) => {
  let value: Dictionary;
  try { value = parseProfile(req.body); } catch { return bad(res); }
  const { data, error } = await supabase.from('founder_profiles')
    .insert({ ...value, owner_user_id: req.founderUserId }).select(COLUMNS).single();
  if (error?.code === '23505') return failure(res, 409, 'profile_already_exists');
  if (error || !data) return failure(res, 503, 'profile_storage_unavailable');
  return res.status(201).json({ profile: present(data) });
});
async function updateProfile(req: Authed, res: Response, partial: boolean) {
  if (!UUID.test(req.params.id)) return bad(res);
  let value: Dictionary;
  try { value = parseProfile(req.body, partial); } catch { return bad(res); }
  const { data, error } = await supabase.from('founder_profiles')
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('owner_user_id', req.founderUserId!)
    .is('deleted_at', null).select(COLUMNS).maybeSingle();
  if (error) return failure(res, 503, 'profile_storage_unavailable');
  return data ? res.json({ profile: present(data) }) : missing(res);
}
founderProfilesApiRouter.put('/founder-profiles/:id', gate('founder_profiles:write'),
  async (req: Authed, res) => { await updateProfile(req, res, false); });
founderProfilesApiRouter.patch('/founder-profiles/:id', gate('founder_profiles:write'),
  async (req: Authed, res) => { await updateProfile(req, res, true); });
founderProfilesApiRouter.delete('/founder-profiles/:id', gate('founder_profiles:write'), async (req: Authed, res) => {
  if (!UUID.test(req.params.id)) return bad(res);
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase.from('founder_profiles')
    .update({ deleted_at: timestamp, updated_at: timestamp })
    .eq('id', req.params.id).eq('owner_user_id', req.founderUserId!)
    .is('deleted_at', null).select('id').maybeSingle();
  if (error) return failure(res, 503, 'profile_storage_unavailable');
  return data ? res.status(204).end() : missing(res);
});

async function sendLead(lead: ReturnType<typeof parseLead>): Promise<boolean> {
  const spreadsheetId = process.env.FCR_LEADS_SHEET_ID ?? '';
  const raw = process.env.FCR_LEADS_GOOGLE_SERVICE_ACCOUNT_JSON ?? '';
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(spreadsheetId) || !raw) throw new Error('sheets_unconfigured');
  const credentials = object(JSON.parse(raw));
  if (credentials.type !== 'service_account' || !text(credentials.client_email, 254) ||
      !text(credentials.private_key, 8000)) throw new Error('sheets_unconfigured');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
    iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600,
  });
  const assertion = unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned),
    credentials.private_key as string).toString('base64url');
  const oauth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!oauth.ok) throw new Error('oauth_unverified');
  const access = object(await oauth.json());
  if (!text(access.access_token, 4000)) throw new Error('oauth_unverified');
  const append = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' +
    spreadsheetId + '/values/Leads%21A%3AF:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Bearer ' + access.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ majorDimension: 'ROWS', values: [[
        new Date().toISOString(), lead.name, lead.email, lead.interest, lead.source, 'yes',
      ]] }),
    });
  if (!append.ok) throw new Error('append_unverified');
  const body = object(await append.json());
  return object(body.updates).updatedRows === 1;
}
founderProfilesApiRouter.post('/leads', gate('leads:write'), async (req: Authed, res) => {
  let lead: ReturnType<typeof parseLead>;
  try { lead = parseLead(req.body); } catch { return bad(res); }
  try {
    if (!await sendLead(lead)) throw new Error('append_unverified');
    return res.status(201).json({ accepted: true, destination: 'google-sheets', followUpSent: false });
  } catch {
    // A timeout is ambiguous. We never auto-retry, claim success, or send outreach.
    return failure(res, 503, 'lead_delivery_unverified');
  }
});
