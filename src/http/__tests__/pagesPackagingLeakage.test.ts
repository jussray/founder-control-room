import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function read(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Cloudflare Pages package leakage membrane', () => {
  it('scans every packaged artifact for credential signatures without a file-size bypass', () => {
    const buildScript = read('scripts/build-pages.mjs');

    expect(buildScript).not.toContain('if (info.size > MAX_SECRET_SCAN_BYTES) continue');
    expect(buildScript).not.toContain('MAX_SECRET_SCAN_BYTES');
    expect(buildScript).toContain('SECRET_SCAN_CHUNK_BYTES');
    expect(buildScript).toContain("open(absolutePath, 'r')");
    expect(buildScript).toContain("toString('latin1')");
    expect(buildScript).toContain('SECRET_SCAN_OVERLAP_CHARS');
    expect(buildScript).toContain("label: 'sensitive credential assignment'");
    expect(buildScript).toContain("label: 'OpenAI/Anthropic-style API key'");
    expect(buildScript).toContain('API_KEY|API_TOKEN');
    expect(buildScript).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(buildScript).toContain('FOUNDER_SESSION_ENCRYPTION_KEY');
    expect(buildScript).toContain('FOUNDER_SIGNAL_ENGINE_MCP_TOKEN');
    expect(buildScript).toContain('RECONCILE_SHARED_SECRET');
    expect(buildScript).toContain('await assertFileContainsNoLiteralSecret(absolutePath, packagedPath)');
  });
});
