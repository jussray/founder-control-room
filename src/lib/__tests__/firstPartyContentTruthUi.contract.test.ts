import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/control-room/content-manager.html', 'utf8');
const playwrightWorkflow = readFileSync('.github/workflows/playwright.yml', 'utf8');

describe('first-party founder content truth UI contract', () => {
  it('separates implemented capability from evidence, temporal, provider, and outcome truth', () => {
    expect(source).toContain('data-founder-engine-state="contract-ready"');
    expect(source).toContain('data-first-party-linkedin-capability="implemented"');
    expect(source).toContain('data-founder-evidence-state="unknown"');
    expect(source).toContain('data-founder-sauce-state="unknown"');
    expect(source).toContain('data-temporal-truth-state="unknown"');
    expect(source).toContain('data-provider-state="unknown"');
    expect(source).toContain('data-outcome-state="unknown"');
    expect(source).toContain('First-party LinkedIn publish capability implemented');
    expect(source).toContain('Temporal truth UNKNOWN until execution');
    expect(source).toContain('Provider state UNKNOWN');
    expect(source).toContain('Outcome UNKNOWN');
    expect(source).toContain('Capability is not publication proof.');
  });

  it('keeps Current You and publication outcome fail-closed while allowing the implemented direct path', () => {
    expect(source).toContain('data-current-you-state="not-requested"');
    expect(source).toContain('data-provider-write-state="capability-implemented"');
    expect(source).toContain('data-review-window-state="not-handed-off"');
    expect(source).toContain('Exact-copy + temporal approval required');
    expect(source).toContain('publish_founder_content');
    expect(source).toContain('temporal truth revalidation');
    expect(source).toContain('one-shot reservation');
    expect(source).toContain('provider readback');
    expect(source).toContain('provider and publication state remain UNKNOWN');
    expect(source).not.toContain('first-party founder-progress lane above remains review-window only');
    expect(source).not.toContain('Live provider writes remain a separate server-side authorization and credential gate');
  });

  it('keeps sauce, analytics, and external platform authority bounded', () => {
    expect(source).toContain('data-public-proof-state="optional-off"');
    expect(source).toContain('data-analytics-authority="observation-only"');
    expect(source).toContain('FutureYou is advisory only');
    expect(source).toContain('Missing metrics stay UNKNOWN; analytics can improve later drafts, never authorize them');
    expect(source).toContain('Private implementation and prompts');
    expect(source).toContain('External platform owns');
    expect(source).toContain('Terminal platform state');
    expect(source).not.toContain('Cambiante, Buffer, or another approved actuator owns');
  });

  it('turns private analytics into draft learning without turning it into claim authority', () => {
    expect(source).toContain('data-content-learning-loop');
    expect(source).toContain('data-private-metrics-state="withheld"');
    expect(source).toContain('data-metric-claim-state="fresh-verifier-required"');
    expect(source).toContain('data-learning-axis="distribution"');
    expect(source).toContain('data-learning-axis="resonance"');
    expect(source).toContain('data-learning-axis="compounding"');
    expect(source).toContain('data-story-archetype="founder-thesis"');
    expect(source).toContain('data-story-archetype="build-correct"');
    expect(source).toContain('data-story-archetype="proof-lesson"');
    expect(source).toContain('data-story-archetype="human-product-stake"');
    expect(source).toContain('Metrics stay private by default');
    expect(source).toContain('repository proof may support repository claims, not analytics claims');
    expect(source).toContain('those claims stay BLOCKED for first-party publication');
  });

  it('states the no-lie boundary between capability, authorization, dispatch, and publication', () => {
    expect(source).toContain('Capability, authorization, dispatch, and publication remain separate truths.');
    expect(source).toContain('FCR must never translate capability, approval, dispatch, a provider request, or missing provider evidence into “published.”');
    expect(source).toContain('Publication requires terminal provider readback bound to the authorized execution.');
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
