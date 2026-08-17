import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/control-room/content-manager.html', 'utf8');
const playwrightWorkflow = readFileSync('.github/workflows/playwright.yml', 'utf8');

describe('first-party founder content shop UI contract', () => {
  it('makes Chief the story brain, FCR the canonical shop, and providers replaceable delivery', () => {
    expect(source).toContain('Chief AI is the story brain.');
    expect(source).toContain('FCR is the canonical shop.');
    expect(source).toContain('Providers own');
    expect(source).toContain('Actual publication state.');
  });

  it('defaults to unknown rather than displaying false-green evidence or sauce status', () => {
    expect(source).toContain('data-content-authority-state="awaiting-draft"');
    expect(source).toContain('data-internal-evidence-state="unknown"');
    expect(source).toContain('data-sauce-state="unknown"');
    expect(source).toContain('No canonical draft loaded');
    expect(source).toContain('Awaiting evidence');
    expect(source).not.toContain('<span class="pill good">Verified</span>');
  });

  it('keeps public proof editorially optional without presenting a fake active control', () => {
    expect(source).toContain('data-public-proof-state="optional-off"');
    expect(source).toContain('Optional · off');
    expect(source).toContain('Internal proof can stay strict without turning every post into a repo receipt.');
    expect(source).not.toContain('data-public-proof-link-toggle');
  });

  it('shows the exact Current-You and provider truth boundaries', () => {
    expect(source).toContain('data-current-you-state="not-requested"');
    expect(source).toContain('data-provider-state="not-handed-off"');
    expect(source).toContain('Any edit invalidates it.');
    expect(source).toContain('A provider receipt must still be read back before “published” becomes true.');
  });

  it('communicates analytics unknown semantics and non-escalation', () => {
    expect(source).toContain('Missing metrics stay UNKNOWN');
    expect(source).toContain('UNKNOWN ≠ 0');
    expect(source).toContain('analytics can never increase authority');
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
