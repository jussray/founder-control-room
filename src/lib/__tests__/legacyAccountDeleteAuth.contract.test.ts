import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The legacy Next.js route is excluded from the active FCR TypeScript build.
// Keep its deletion authorization fail-closed if the route is re-enabled.
const accountRoute = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/api/account/route.ts'),
  'utf8',
);

describe('legacy Next account deletion authorization boundary', () => {
  it('requires an identity verified by Supabase Auth, not a cookie-derived session', () => {
    expect(accountRoute).toContain('supabase.auth.getUser()');
    expect(accountRoute).not.toMatch(/supabase\.auth\.getSession\s*\(/);
    expect(accountRoute).toMatch(/if\s*\(error\s*\|\|\s*!user\?\.id\)/);
  });

  it('only forwards the verified Auth user ID to the privileged deletion handler', () => {
    expect(accountRoute).toContain('handleDeleteAccountRequest(request, user.id)');
    expect(accountRoute).not.toContain('handleDeleteAccountRequest(request, session.user.id)');
    expect(accountRoute).toContain("error: 'Unauthorized'");
  });
});
