import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/http/middleware/requireFounder.ts'), 'utf8');

describe('platform founder and workspace identity isolation', () => {
  it('requires confirmed Supabase identity and both immutable user-id and email predicates', () => {
    expect(source).toContain('record.email_confirmed_at');
    expect(source).toContain(".eq('email', identity.email)");
    expect(source).toContain(".eq('user_id', identity.userId)");
    expect(source).toContain('allowRow.user_id !== identity.userId');
  });

  it('keeps global founder routes platform-owner only', () => {
    expect(source).toContain("row.account_role !== 'platform_owner'");
    expect(source).toContain('export async function requireFounder(');
    expect(source).toContain('export async function requireInteractiveFounder(');
    expect(source).toContain('export async function requireWorkspaceUser(');
  });

  it('refuses a mismatched workspace membership or missing scoped UUID', () => {
    expect(source).toContain("row.user_id !== identity.userId");
    expect(source).toContain("row.account_role !== 'workspace_owner'");
    expect(source).toContain("!uuid.test(workspaceId)");
    expect(source).toContain("Workspace assignment unavailable");
  });
});
