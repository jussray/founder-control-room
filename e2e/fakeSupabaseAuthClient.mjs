// Fake replacement for src/lib/supabaseAuthClient.ts. There is no real
// mailbox in this harness, so signInWithOtp writes the token_hash a real
// magic-link email would have carried to a small JSON bridge file the
// separate e2e driver process reads — simulating "click the link in your
// inbox" without needing a real SMTP provider.
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const pendingByTokenHash = new Map(); // tokenHash -> email
const sessionsByToken = new Map(); // accessToken -> { email, userId }

const bridgeFile = process.env.E2E_AUTH_BRIDGE_FILE;

export const supabaseAuth = {
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
      const accessToken = randomUUID();
      const userId = randomUUID();
      sessionsByToken.set(accessToken, { email, userId });
      return {
        data: {
          session: {
            access_token: accessToken,
            refresh_token: randomUUID(),
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
          user: { id: userId, email },
        },
        error: null,
      };
    },

    async getUser(token) {
      const session = sessionsByToken.get(token);
      if (!session) return { data: { user: null }, error: { message: 'Invalid or expired session' } };
      return { data: { user: { id: session.userId, email: session.email } }, error: null };
    },

    async signOut() {
      return { error: null };
    },
  },
};
