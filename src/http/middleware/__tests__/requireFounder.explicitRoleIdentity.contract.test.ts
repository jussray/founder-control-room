import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/http/middleware/requireFounder.ts'), 'utf8');

describe('explicit founder role identity binding', () => {
  it('requires the exact immutable user id before any explicit role is honored', () => {
    const binding = source.indexOf("if (!boundUserId || boundUserId !== identity.userId)");
    const roleValidation = source.indexOf("if (rawRole !== 'platform_owner' && rawRole !== 'workspace_owner')");

    expect(source).toContain("const boundUserId = typeof record.user_id === 'string'");
    expect(binding).toBeGreaterThan(-1);
    expect(roleValidation).toBeGreaterThan(binding);
  });

  it('does not use email as the authority comparison', () => {
    expect(source).not.toContain('record.email === identity.email');
    expect(source).not.toContain('record.email !== identity.email');
  });
});
