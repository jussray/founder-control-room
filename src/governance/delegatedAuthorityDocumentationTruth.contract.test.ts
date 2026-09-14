import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('delegated authority Documentation Truth registration', () => {
  it('keeps delegated authority source and manifest truth-sensitive', () => {
    const verifier = read('scripts/verify-documentation-truth.mjs');

    expect(verifier).toContain("{ domain: 'capability-authority', match: /^src\\/authority\\/(?!__tests__\\/)(?!.*\\.test\\.ts$)/ }");
    expect(verifier).toContain("{ domain: 'capability-authority', match: /^security\\/delegated-agent-authority\\.json$/ }");
  });

  it('keeps the delegated policy non-authorizing while documentation coverage expands', () => {
    const policy = read('src/authority/delegatedAgentAuthority.ts');

    expect(policy).toContain('executionAuthorized: false');
    expect(policy).toContain('completionClaimAllowed: false');
    expect(policy).toContain('activationRequired: true');
  });
});
