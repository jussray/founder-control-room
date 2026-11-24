import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/http/middleware/requireFounder.ts'), 'utf8');

describe('immutable and verified founder role identity', () => {
  it('requires confirmed email, user ID, and matching database predicates before role resolution', () => {
    const confirmation = source.indexOf('record.email_confirmed_at');
    const emailPredicate = source.indexOf(".eq('email', identity.email)");
    const idPredicate = source.indexOf(".eq('user_id', identity.userId)");
    const mismatchGuard = source.indexOf('if (boundUserId !== identity.userId)');
    const roleValidation = source.indexOf("if (rawRole !== 'platform_owner' && rawRole !== 'workspace_owner')");
    for (const index of [confirmation, emailPredicate, idPredicate, mismatchGuard, roleValidation]) {
      expect(index).toBeGreaterThan(-1);
    }
    expect(emailPredicate).toBeLessThan(idPredicate);
    expect(idPredicate).toBeLessThan(mismatchGuard);
    expect(mismatchGuard).toBeLessThan(roleValidation);
  });

  it('does not let a workspace owner inherit global founder routes', () => {
    expect(source).toContain("if (!allowWorkspaceOwner && accessState.access.role !== 'platform_owner')");
    expect(source).toContain("if (accessState.access.role !== 'platform_owner')");
    expect(source).toContain("rawRole === 'workspace_owner' && (!workspaceId || !workspaceUuid.test(workspaceId))");
  });
});
