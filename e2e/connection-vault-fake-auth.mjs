const FOUNDER_TOKEN = 'founder-e2e-session';
const FOUNDER_EMAIL = 'founder@example.com';

export function connectionVaultFounderToken() {
  return FOUNDER_TOKEN;
}

export function createSupabaseAuthClient() {
  return {
    auth: {
      async getUser(token) {
        if (token !== FOUNDER_TOKEN) {
          return { data: { user: null }, error: { message: 'Invalid session' } };
        }
        return {
          data: { user: { id: 'founder-e2e-user', email: FOUNDER_EMAIL } },
          error: null,
        };
      },
      async refreshSession() {
        return { data: { session: null, user: null }, error: { message: 'Refresh disabled in vault proof' } };
      },
    },
  };
}

export const supabaseAuth = createSupabaseAuthClient();
