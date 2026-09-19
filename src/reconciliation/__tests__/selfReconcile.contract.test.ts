import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('post-deploy reconciliation identity contract', () => {
  it('binds privileged Supabase inspection to the canonical deployed Worker identity', () => {
    const reconcile = read('src/reconciliation/scripts/self-reconcile.ts');
    const server = read('src/http/server.ts');

    expect(reconcile).toContain("const CONTROL_ROOM_DEPLOY_URL = 'https://api.foundercontrolroom.org'");
    expect(reconcile).toContain("validateControlRoomSupabaseUrl(SUPABASE_URL, { nodeEnv: 'production' })");
    expect(reconcile).toContain('await assertDeployedRuntimeSupabaseIdentity()');
    expect(reconcile).toContain('body.v10?.supabaseProjectRef !== CONTROL_ROOM_SUPABASE_PROJECT_REF');
    expect(reconcile).toContain('DEPLOY_URL does not match the canonical Founder Control Room Worker origin');
    expect(reconcile).not.toContain("if (DEPLOY_URL && SECRET)");

    expect(server).toContain('supabaseProjectRef: SUPABASE_PROJECT_REF.test(supabaseProjectRef) ? supabaseProjectRef : null');
  });
});
