import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/control-room/content-manager.html', 'utf8');
const playwrightWorkflow = readFileSync('.github/workflows/playwright.yml', 'utf8');

describe('first-party founder content truth UI contract', () => {
  it('shows Buffer as the only active transport without pretending publication happened', () => {
    expect(source).toContain('data-founder-engine-state="contract-ready"');
    expect(source).toContain('data-buffer-transport="active"');
    expect(source).toContain('data-direct-linkedin-state="inactive"');
    expect(source).toContain('data-founder-evidence-state="unknown"');
    expect(source).toContain('data-founder-sauce-state="unknown"');
    expect(source).toContain('data-temporal-truth-state="unknown"');
    expect(source).toContain('data-provider-state="unknown"');
    expect(source).toContain('data-outcome-state="unknown"');
    expect(source).toContain('Buffer transport active');
    expect(source).toContain('Direct LinkedIn inactive');
    expect(source).toContain('Buffer is transport, not authority.');
    expect(source).not.toContain('First-party LinkedIn publish capability implemented');
  });

  it('keeps Current You and publication outcome fail-closed', () => {
    expect(source).toContain('data-current-you-state="not-requested"');
    expect(source).toContain('data-provider-write-state="buffer-only"');
    expect(source).toContain('data-review-window-state="not-handed-off"');
    expect(source).toContain('Exact-copy + temporal approval required');
    expect(source).toContain('Buffer preflight happens before the one-shot approval is consumed');
    expect(source).toContain('Cambiante and direct LinkedIn are not active fallback paths');
    expect(source).toContain('publication state remains UNKNOWN');
  });

  it('keeps public proof editorial and private evidence mandatory', () => {
    expect(source).toContain('data-public-proof-state="optional-off"');
    expect(source).toContain('Public proof link only when it improves the story');
    expect(source).toContain('Internal proof remains mandatory even when no public link is shown.');
    expect(source).toContain('Private implementation and prompts');
    expect(source).toContain('FutureYou is advisory only');
  });

  it('keeps analytics observation-only and UNKNOWN-safe', () => {
    expect(source).toContain('data-content-learning-loop');
    expect(source).toContain('data-analytics-authority="observation-only"');
    expect(source).toContain('data-private-metrics-state="withheld"');
    expect(source).toContain('data-metric-claim-state="fresh-verifier-required"');
    expect(source).toContain('Missing metrics stay UNKNOWN; analytics can improve later drafts, never authorize them');
    expect(source).toContain('repository proof may support repository claims, not analytics claims');
    expect(source).toContain('that claim stays BLOCKED for first-party publication');
  });

  it('states the Buffer-only lifecycle and no-lie readback boundary', () => {
    expect(source).toContain('Proof → draft → review → approval → schedule → Buffer → metrics');
    expect(source).toContain('Buffer handoff');
    expect(source).toContain('Buffer receives only the exact FCR-approved payload.');
    expect(source).toContain('An accepted schedule is not treated as a published LinkedIn post.');
    expect(source).toContain('Chief proposes. FCR authorizes. Buffer transports. Publication truth still requires readback.');
    expect(source).toContain('Publication requires terminal readback bound to the authorized execution.');
    expect(source).not.toContain('Cambiante, Buffer, or another approved actuator owns');
  });

  it('binds browser proof to the exact reviewed head', () => {
    expect(playwrightWorkflow).toContain('EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(playwrightWorkflow).toContain('group: playwright-e2e-${{ github.event.pull_request.number || github.event.workflow_run.id || github.ref }}');
    expect(playwrightWorkflow).toContain('cancel-in-progress: true');
    expect(playwrightWorkflow).toContain('uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
    expect(playwrightWorkflow).toContain('ref: ${{ env.EXPECTED_HEAD_SHA }}');
    expect(playwrightWorkflow).toContain('persist-credentials: false');
    expect(playwrightWorkflow).toContain('test "$actual" = "$EXPECTED_HEAD_SHA"');
    expect(playwrightWorkflow).toContain('uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020');
    expect(playwrightWorkflow).toContain('uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  });
});
