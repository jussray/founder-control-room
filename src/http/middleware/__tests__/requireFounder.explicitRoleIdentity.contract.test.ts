import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/http/middleware/requireFounder.ts'), 'utf8');

describe('explicit founder role identity binding', () => {
  it('binds authority to the exact immutable user id before any explicit role is honored', () => {
    const immutablePredicate = source.indexOf(".eq('user_id', identity.userId)");
    const mismatchGuard = source.indexOf('if (boundUserId && boundUserId !== identity.userId)');
    const roleValidation = source.indexOf("if (rawRole !== 'platform_owner' && rawRole !== 'workspace_owner')");

    expect(immutablePredicate).toBeGreaterThan(-1);
    expect(mismatchGuard).toBeGreaterThan(immutablePredicate);
    expect(roleValidation).toBeGreaterThan(mismatchGuard);
  });

  it('does not use email as the authority predicate', () => {
    expect(source).not.toContain(".eq('email', identity.email)");
    expect(source).not.toContain('record.email === identity.email');
    expect(source).not.toContain('record.email !== identity.email');
  });
});
