import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/deploy.yml'), 'utf8');

function section(start: string, end: string): string {
  const startIndex = workflow.indexOf(start);
  const endIndex = workflow.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return workflow.slice(startIndex, endIndex);
}

describe('production deploy recovery contract', () => {
  it('includes every local migration missing from a newer remote history in preview and push', () => {
    const preview = section('      - name: Preview migrations', '      - name: Push migrations');
    const push = section('      - name: Push migrations', '      - name: Verify post-push migration ledger');

    expect(preview).toContain('supabase db push');
    expect(preview).toContain('--dry-run');
    expect(preview).toContain('--include-all');

    expect(push).toContain('supabase db push');
    expect(push).toContain('--yes');
    expect(push).toContain('--include-all');
  });

  it('validates and carries the founder review ingress secret into the production Worker deploy', () => {
    const authority = section(
      '      - name: Validate required production configuration',
      '      - name: Record authority receipt',
    );
    const worker = section('  worker-deploy:', '  # ── 3.');
    const secret = 'FOUNDER_REVIEW_EMAIL_INGRESS_SECRET';
    const secretMapping = `${secret}: ` + '${{ secrets.' + secret + ' }}';

    expect(authority).toContain(secretMapping);
    expect(authority).toMatch(new RegExp(`\\n\\s+${secret}\\n`));

    expect(worker).toMatch(new RegExp(`\\n\\s+${secret}\\n`));
    expect(worker).toContain(secretMapping);
  });
});
