import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readRepo = (path: string): string =>
  readFileSync(new URL(\`../../../\${path}\`, import.meta.url), 'utf8');

// Source-only guard. GitHub, not an agent, executes native auto-merge after
// its live required conditions pass. No provider state is fabricated here.
describe('founder-selected GitHub native Auto-merge contract', () => {
  it('preserves the authenticated founder one-click queue', () => {
    const policy = readRepo('GLOBAL_AI.md');
    expect(policy).toContain('FOUNDER_NATIVE_AUTO_MERGE_V1');
    expect(policy).toContain('authenticated \`jussray\` GitHub account');
    expect(policy).toContain('no second manual merge click');
    expect(policy).toContain('only GitHub performs the eventual merge');
    expect(policy).toContain('required deployments');
    expect(policy).toContain('bypass a gate, or fabricate a successful check');
  });

  it('keeps policy, live provider enforcement and constitutional review distinct', () => {
    const policy = readRepo('GLOBAL_AI.md');
    const authority = readRepo('docs/FOUNDER_MERGE_AUTHORITY.md');
    expect(authority).toMatch(/When the founder explicitly selects \*\*Enable auto-merge\*\*/);
    expect(authority).toMatch(/The founder should not have to perform a second manual merge click/);
    expect(policy).toContain('live GitHub ruleset readback');
    expect(policy).toContain('not a permanent guarantee against an administrator changing settings');
    expect(policy).toContain('exact-head checks');
    expect(policy).toContain('independent review');
    expect(policy).toContain('constitutional');
  });

  it('observes queue changes without creating an agent merge executor', () => {
    const workflow = readRepo('.github/workflows/pr-continuity.yml');
    const continuity = readRepo('scripts/pr-continuity.mjs');
    expect(workflow).toContain('auto_merge_enabled, auto_merge_disabled');
    expect(workflow).toContain("if: github.event_name == 'pull_request_target'");
    expect(workflow).toContain('permissions: {}');
    expect(continuity).toContain("return 'QUEUED'");
    expect(continuity).toContain("'- merge_approved: **false**'");
    expect(continuity).toContain("'- authorizes_merge: **false**'");
    expect(workflow).not.toMatch(/\bgh\s+pr\s+merge\b|\bmerge[_-]pull[_-]request\b/i);
  });
});
