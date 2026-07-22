export const CONTROL_ROOM_SUPABASE_PROJECT_REF = 'oojzfmmywbvficgybaxd';

export interface SupabaseProjectIdentityOptions {
  nodeEnv?: string;
  allowLocal?: boolean;
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const LOCAL_RUNTIME_ENVIRONMENTS = new Set(['development', 'test']);

function normalizedNodeEnv(value: string | undefined): string {
  return value?.trim().toLowerCase() || 'production';
}

function parseSupabaseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error('SUPABASE_URL must be a valid absolute URL');
  }
}

function assertMinimalUrlShape(url: URL): void {
  if (url.username || url.password) {
    throw new Error('SUPABASE_URL must not contain embedded credentials');
  }

  if (url.search || url.hash) {
    throw new Error('SUPABASE_URL must not contain query parameters or a fragment');
  }

  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('SUPABASE_URL must point to the project origin, not a nested path');
  }
}

/**
 * Enforces the Control Room's Supabase trust boundary before a privileged client
 * is created. The production project ref is code-owned so changing both the URL
 * and an environment variable cannot silently retarget the backend.
 *
 * Local Supabase is permitted only when the caller explicitly opts in and the
 * runtime identifies itself as development or test. Unknown environments are
 * treated as production and therefore fail closed.
 */
export function validateControlRoomSupabaseUrl(
  value: string,
  options: SupabaseProjectIdentityOptions = {},
): URL {
  const url = parseSupabaseUrl(value);
  assertMinimalUrlShape(url);

  const nodeEnv = normalizedNodeEnv(options.nodeEnv);
  const hostname = url.hostname.toLowerCase();
  const isLocal = LOCAL_HOSTNAMES.has(hostname);

  if (isLocal) {
    if (
      options.allowLocal === true &&
      LOCAL_RUNTIME_ENVIRONMENTS.has(nodeEnv)
    ) {
      return url;
    }

    throw new Error(
      'Local SUPABASE_URL requires SUPABASE_ALLOW_LOCAL=true with NODE_ENV=development or test',
    );
  }

  if (url.protocol !== 'https:') {
    throw new Error('Cloud SUPABASE_URL must use HTTPS');
  }

  if (url.port) {
    throw new Error('Cloud SUPABASE_URL must not specify a custom port');
  }

  const expectedHostname = `${CONTROL_ROOM_SUPABASE_PROJECT_REF}.supabase.co`;
  if (hostname !== expectedHostname) {
    throw new Error(
      `SUPABASE_URL does not match the Founder Control Room project ref ${CONTROL_ROOM_SUPABASE_PROJECT_REF}`,
    );
  }

  return url;
}
