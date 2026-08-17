import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/control-room/content-manager.html', 'utf8');
const playwrightWorkflow = readFileSync('.github/workflows/playwright.yml', 'utf8');

describe('first-party founder content truth UI contract', () => {
  it('distinguishes contract readiness from proposal/evidence readiness', () => {
    expect(source).toContain('data-founder-engine-state="contract-ready"');
    expect(source).toContain('data-founder-evidence-state="unknown"');
    expect(source).toContain('data-founder-sauce-state="unknown"');
    expect(source).toContain('Founder progress contract ready');
    expect(source).toContain('Evidence UNKNOWN until proposal');
    expect(source).toContain('Sauce receipt UNKNOWN until proposal');
    expect(source).not.toContain('Founder progress engine ready');
    expect(source).not.toContain('Sauce-safe by contract');
  });

  it('keeps Current You, provider, review-window, and outcome states fail-closed', () => {
    expect(source).toContain('data-current-you-state="not-requested"');
    expect(source).toContain('data-provider-state="unknown"');
    expect(source).toContain('data-review-window-state="not-handed-off"');
    expect(source).toContain('data-outcome-state="unknown"');
    expect(source).toContain('Exact-copy approval required');
    expect(source).toContain('Share-now is forbidden for this lane');
    expect(source).toContain('Missing metrics stay UNKNOWN');
  });

  it('keeps disclosure and analytics authority bounded', () => {
    expect(source).toContain('data-public-proof-state="optional-off"');
    expect(source).toContain('data-analytics-authority="observation-only"');
    expect(source).toContain('FutureYou is advisory only');
    expect(source).toContain('analytics can improve later drafts, never authorize them');
    expect(source).toContain('Provider state stays external.');
  });

  it('binds browser proof to the exact reviewed head', () => {
    expect(playwrightWorkflow).toContain('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(playwrightWorkflow).toContain('group: playwright-e2e-${{ github.event.pull_request.number || github.ref }}');
    expect(playwrightWorkflow).toContain('cancel-in-progress: true');
    expect(playwrightWorkflow).toContain('uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
    expect(playwrightWorkflow).toContain('ref: ${{ env.EXPECTED_HEAD_SHA }}');
    expect(playwrightWorkflow).toContain('persist-credentials: false');
    expect(playwrightWorkflow).toContain('test "$actual" = "$EXPECTED_HEAD_SHA"');
    expect(playwrightWorkflow).toContain('uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020');
    expect(playwrightWorkflow).toContain('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  });
});
