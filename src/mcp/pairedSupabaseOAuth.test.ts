import { describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../lib/supabaseAuthClient.js', () => ({
  supabaseAuth: { auth: { getUser: mockGetUser } },
}));
vi.mock('../lib/supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}));

import {
  PAIRED_MCP_OAUTH_AUDIENCE,
  PAIRED_MCP_OAUTH_SCOPE,
  usesLegacyStaticMcpToken,
  verifyPairedSupabaseOauthToken,
} from './pairedSupabaseOAuth.js';

const CHIEF = 'chief-ai-machine';
const FCR = 'founder-control-room';
const ISSUER = 'https://oojzfmmywbvficgybaxd.supabase.co/auth/v1';

function jwt(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.test-signature`;
}

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: 'https://oojzfmmywbvficgybaxd.supabase.co',
    FCR_REMOTE_MCP_READ_PROJECTS: `${CHIEF},${FCR}`,
    FCR_REMOTE_MCP_OAUTH_AUDIENCE: PAIRED_MCP_OAUTH_AUDIENCE,
    FCR_REMOTE_MCP_OAUTH_REQUIRED_SCOPE: PAIRED_MCP_OAUTH_SCOPE,
    ...overrides,
  };
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER,
    aud: PAIRED_MCP_OAUTH_AUDIENCE,
    sub: 'founder-user-1',
    client_id: 'dcr-client-generated-by-supabase',
    scope: `openid ${PAIRED_MCP_OAUTH_SCOPE}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function allowFounder() {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: 'founder-user-1', email: 'founder@example.com' } },
    error: null,
  });
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { email: 'founder@example.com', user_id: 'founder-user-1' },
          error: null,
        }),
      }),
    }),
  });
}

describe('auto-dynamic compatibility token selection', () => {
  const legacyToken = 'legacy-server-held-token';

  it('selects static auth only for an exact bearer match', () => {
    expect(usesLegacyStaticMcpToken(`Bearer ${legacyToken}`, legacyToken)).toBe(true);
  });

  it.each([
    [undefined, legacyToken],
    ['Bearer wrong-token', legacyToken],
    ['Bearer legacy-server-held-token.extra', legacyToken],
    ['Basic legacy-server-held-token', legacyToken],
    [`Bearer ${legacyToken}`, undefined],
  ])('routes every non-exact credential to OAuth instead of static fallback', (header, configured) => {
    expect(usesLegacyStaticMcpToken(header, configured)).toBe(false);
  });
});

describe('paired Supabase OAuth verifier', () => {
  it('accepts a dynamically registered client after current-user and founder checks', async () => {
    allowFounder();

    await expect(verifyPairedSupabaseOauthToken(jwt(claims()), env())).resolves.toEqual({
      userId: 'founder-user-1',
      email: 'founder@example.com',
      clientId: 'dcr-client-generated-by-supabase',
      projectIds: [CHIEF, FCR],
      authMode: 'oauth',
    });
  });

  it('lets an optional mcp_projects claim narrow but never widen server scope', async () => {
    allowFounder();

    await expect(verifyPairedSupabaseOauthToken(jwt(claims({
      mcp_projects: [CHIEF, 'not-a-real-project'],
    })), env())).resolves.toMatchObject({ projectIds: [CHIEF] });
  });

  it('can opt into an exact client allowlist without making it the DCR default', async () => {
    mockGetUser.mockClear();
    mockFrom.mockClear();
    await expect(verifyPairedSupabaseOauthToken(jwt(claims()), env({
      FCR_REMOTE_MCP_OAUTH_ENFORCE_CLIENT_ALLOWLIST: 'true',
      FCR_REMOTE_MCP_OAUTH_CLIENT_IDS: 'other-client',
    }))).rejects.toThrow('OAuth client is not allowed');
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it.each([
    ['issuer', { iss: 'https://attacker.example/auth/v1' }, 'issuer'],
    ['audience', { aud: 'wrong-audience' }, 'audience'],
    ['client identity', { client_id: '' }, 'client identity'],
    ['expiry', { exp: Math.floor(Date.now() / 1000) - 1 }, 'expired'],
    ['scope', { scope: 'profile' }, 'scope'],
  ])('fails closed on invalid %s before founder data access', async (_label, override, message) => {
    mockGetUser.mockClear();
    mockFrom.mockClear();
    await expect(verifyPairedSupabaseOauthToken(jwt(claims(override)), env())).rejects.toThrow(message);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects a valid-looking token when Supabase reports the user revoked', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('revoked') });
    await expect(verifyPairedSupabaseOauthToken(jwt(claims()), env())).rejects.toThrow('invalid or revoked');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
