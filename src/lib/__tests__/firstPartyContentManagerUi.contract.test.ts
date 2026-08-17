import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/control-room/content-manager.html', 'utf8');
const playwrightWorkflow = readFileSync('.github/workflows/playwright.yml', 'utf8');

describe('first-party founder content shop UI contract', () => {
  it('presents Chief as story intelligence and FCR as the independent authority boundary', () => {
    expect(source).toContain('Chief AI is the story brain.');
    expect(source).toContain('FCR is the authority boundary.');
    expect(source).toContain('Providers own');
    expect(source).toContain('Actual schedule/publication state.');
    expect(source).not.toContain('Cambiante is the actuator');
  });

  it('defaults every unproven state to unknown or not requested', () => {
    expect(source).toContain('data-content-authority-state="awaiting-proposal"');
    expect(source).toContain('data-internal-evidence-state="unknown"');
    expect(source).toContain('data-sauce-state="unknown"');
    expect(source).toContain('data-current-you-state="not-requested"');
    expect(source).toContain('data-review-window-state="not-handed-off"');
    expect(source).toContain('data-provider-state="unknown"');
    expect(source).toContain('data-outcome-state="unknown"');
    expect(source).toContain('No verified proposal loaded');
    expect(source).not.toContain('<span class="pill good">Verified</span>');
  });

  it('keeps public proof editorially optional without exposing a fake active toggle', () => {
    expect(source).toContain('data-public-proof-state="optional-off"');
    expect(source).toContain('Optional · off');
    expect(source).toContain('Internal proof remains mandatory');
    expect(source).not.toContain('data-public-proof-link-toggle');
  });

  it('shows Current You, review-window, provider, and analytics truth boundaries', () => {
    expect(source).toContain('Fresh authenticated intent binds to the exact public-copy hash.');
    expect(source).toContain('Share-now remains forbidden.');
    expect(source).toContain('A provider receipt must still be read back before “published” becomes true.');
    expect(source).toContain('Missing values stay UNKNOWN, not zero.');
    expect(source).toContain('analytics can never increase authority');
    expect(source).toContain('UNKNOWN ≠ 0');
  });

  it('binds Product Design browser proof to the exact reviewed head', () => {
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
