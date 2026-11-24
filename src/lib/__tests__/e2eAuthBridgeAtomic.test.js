import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';

describe('E2E fake magic-link bridge', () => {
  it('publishes complete JSON without exposing a partially written bridge', () => {
    // Force the original race deterministically in a separate Node process.
    // No real auth client, provider, credentials or user data are involved.
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      const dir = fs.mkdtempSync(join(tmpdir(), 'fcr-bridge-'));
      const bridge = join(dir, 'bridge.json');
      process.env.E2E_AUTH_BRIDGE_FILE = bridge;
      const realWrite = fs.writeFileSync;
      let observedPartial = false;
      try {
        fs.writeFileSync = (path, contents, options) => {
          realWrite(path, '', options);
          if (fs.existsSync(bridge)) observedPartial = true;
          return realWrite(path, contents, options);
        };
        syncBuiltinESMExports();
        const { createSupabaseAuthClient } = await import('./e2e/fakeSupabaseAuthClient.mjs');
        const result = await createSupabaseAuthClient().auth.signInWithOtp({ email: 'fixture@example.invalid' });
        assert.equal(result.error, null);
        assert.equal(observedPartial, false, 'reader-visible bridge must not exist until complete');
        const receipt = JSON.parse(fs.readFileSync(bridge, 'utf8'));
        assert.equal(receipt.email, 'fixture@example.invalid');
        assert.equal(typeof receipt.tokenHash, 'string');
        assert.deepEqual(fs.readdirSync(dir), ['bridge.json']);
      } finally {
        fs.writeFileSync = realWrite;
        syncBuiltinESMExports();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    `], { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 });
  });
});
