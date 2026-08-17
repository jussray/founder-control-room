import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('public/control-room/content-manager.html', 'utf8');
const playwrightWorkflow = readFileSync('.github/workflows/playwright.yml', 'utf8');

describe('first-party founder content shop UI contract', () => {
  it('makes Chief the story brain and FCR the canonical content shop', () => {
    expect(source).toContain('Chief AI is the story brain.');
    expect(source).toContain('FCR is the canonical shop.');
    expect(source).toContain('LinkedIn, Buffer, and Cambiante are replaceable delivery hands.');
  });

  it('separates internal evidence from optional public proof links', () => {
    expect(source).toContain('Internal evidence required');
    expect(source).toContain('Public proof link optional');
    expect(source).toContain('data-public-proof-link-toggle');
    expect(source).toContain('The post can be fully verified without showing a GitHub link.');
  });

  it('makes sauce protection and Current-You approval visible', () => {
    expect(source).toContain('Sauce protected');
    expect(source).toContain('Private implementation removed');
    expect(source).toContain('Current You approval');
    expect(source).toContain('Any edit after approval changes the content hash');
  });

  it('keeps provider publication as a separate read-back boundary', () => {
    expect(source).toContain('First-party authority does not mean a provider write already happened.');
    expect(source).toContain('LinkedIn OAuth/API authorization remains a separate provider capability');
    expect(source).toContain('Never the canonical copy or founder authority.');
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
