// Fake replacement for src/lib/supabaseAuthClient.ts. There is no real
// mailbox in this harness, so signInWithOtp writes the token_hash a real
// magic-link email would have carried to a small JSON bridge file the
// separate e2e driver process reads — simulating "click the link in your
// inbox" without needing a real SMTP provider.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const pendingByTokenHash = new Map(); // tokenHash -> email
const sessionsByAccessToken = new Map(); // accessToken -> { email, userId, refreshToken }
const accessTokenByRefreshToken = new Map(); // refreshToken -> accessToken

const bridgeFile = process.env.E2E_AUTH_BRIDGE_FILE;

function issueSession(email, userId) {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  sessionsByAccessToken.set(accessToken, { email, userId, refreshToken });
  accessTokenByRefreshToken.set(refreshToken, accessToken);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

// requireFounder.ts calls createSupabaseAuthClient() to obtain a fresh
// client for refreshSession() while keeping the shared supabaseAuth
// singleton for stateless getUser() lookups — both need to see the same
// in-memory sessions, so state lives at module scope, not per-instance.
export function createSupabaseAuthClient() {
  return {
    auth: {
      async signInWithOtp({ email }) {
        const tokenHash = randomUUID();
        pendingByTokenHash.set(tokenHash, email);
        if (bridgeFile) {
          writeFileSync(bridgeFile, JSON.stringify({ email, tokenHash }));
        }
        return { data: {}, error: null };
      },

      async verifyOtp({ token_hash: tokenHash }) {
        const email = pendingByTokenHash.get(tokenHash);
        if (!email) {
          return { data: { session: null, user: null }, error: { message: 'Invalid or expired token_hash' } };
        }
        pendingByTokenHash.delete(tokenHash);
        const userId = randomUUID();
        const session = issueSession(email, userId);
        return { data: { session, user: { id: userId, email } }, error: null };
      },

      async getUser(token) {
        const session = sessionsByAccessToken.get(token);
        if (!session) return { data: { user: null }, error: { message: 'Invalid or expired session' } };
        return { data: { user: { id: session.userId, email: session.email } }, error: null };
      },

      async refreshSession({ refresh_token: refreshToken }) {
        const oldAccessToken = accessTokenByRefreshToken.get(refreshToken);
        const previous = oldAccessToken ? sessionsByAccessToken.get(oldAccessToken) : undefined;
        if (!previous) {
          return { data: { session: null, user: null }, error: { message: 'Invalid or expired refresh token' } };
        }
        sessionsByAccessToken.delete(oldAccessToken);
        accessTokenByRefreshToken.delete(refreshToken);

        const session = issueSession(previous.email, previous.userId);
        return { data: { session, user: { id: previous.userId, email: previous.email } }, error: null };
      },

      async signOut() {
        return { error: null };
      },
    },
  };
}

/**
 * Stateless token validation and magic-link delivery may reuse this client.
 * Request paths that call setSession or refreshSession must use the factory.
 */
export const supabaseAuth = createSupabaseAuthClient();
