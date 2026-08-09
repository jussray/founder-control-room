import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const receiptWorkflow = readFileSync(
  '.github/workflows/proof-of-ship-downstream-receipt.yml',
  'utf8',
);

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `missing section end: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('proof-of-ship publication authority', () => {
  it('defaults the deploy proof lane to founder review with publication disabled', () => {
    expect(deployWorkflow).toContain('Proof of Ship — Verify and Hold for Founder Review');
    expect(deployWorkflow).toMatch(/^\s+PUBLISH_ALLOWED: 'false'$/m);

    const reviewHold = section(
      deployWorkflow,
      '      - name: Retain verified proof for founder review',
      '      - name: Upload founder-review proof artifact',
    );

    expect(reviewHold).toContain("if: steps.classify.outputs.meaningful == 'true' && env.PUBLISH_ALLOWED != 'true'");
    expect(reviewHold).toContain('.publish_allowed = false');
    expect(reviewHold).toContain('.PUBLISH_ALLOWED = false');
    expect(reviewHold).toContain('.authorization_mode = "founder-review-required"');
    expect(reviewHold).toContain('.destination_mode = "founder_review"');
    expect(reviewHold).toContain('.buffer_method = "none"');
    expect(reviewHold).toContain('.buffer_terminal_action = "hold"');
    expect(reviewHold).not.toContain('ZAPIER_CATCH_HOOK_URL');
    expect(reviewHold).not.toMatch(/\bcurl\b/);
  });

  it('keeps the legacy scheduled-publication code unreachable under the default authority state', () => {
    const scheduledPublish = section(
      deployWorkflow,
      '      - name: POST verified proof payload to Zapier Catch Hook',
      '  # ── 5. Post-deploy database reconciliation inspection',
    );

    expect(scheduledPublish).toContain(
      "if: steps.classify.outputs.meaningful == 'true' && env.PUBLISH_ALLOWED == 'true'",
    );
    expect(scheduledPublish).toContain('.PUBLISH_ALLOWED = true');
    expect(scheduledPublish).toContain('.buffer_terminal_action = "schedule"');
  });

  it('retains an immutable founder-review artifact instead of sending downstream', () => {
    expect(deployWorkflow).toContain('name: proof-of-ship-founder-review-${{ inputs.expected_head_sha }}');
    expect(deployWorkflow).toContain('path: proof-review.json');
    expect(deployWorkflow).toContain('retention-days: 30');
    expect(deployWorkflow).toContain(
      'No Zapier Catch Hook or Buffer scheduling request was sent. Publication remains blocked until a separately reviewed authority change.',
    );
  });

  it('treats review-only mode as an intentional downstream hold, not a missing receipt failure', () => {
    expect(receiptWorkflow).toContain('Resolve exact-head publication mode');
    expect(receiptWorkflow).toContain("PUBLISH_ALLOWED: 'false'");
    expect(receiptWorkflow).toContain("echo 'receipt_required=false' >> \"$GITHUB_OUTPUT\"");
    expect(receiptWorkflow).toContain('The deployed exact head is intentionally review-only. No Zapier or Buffer scheduling receipt is expected.');

    for (const stepName of [
      'Validate exact-head receipt configuration',
      'Verify checkout and resolve expected LinkedIn baseline',
      'Wait for canonical downstream receipt',
      'Publish exact-head downstream proof summary',
    ]) {
      const index = receiptWorkflow.indexOf(`      - name: ${stepName}`);
      expect(index, `missing receipt step: ${stepName}`).toBeGreaterThanOrEqual(0);
      const after = receiptWorkflow.slice(index, index + 300);
      expect(after).toContain("if: steps.mode.outputs.receipt_required == 'true'");
    }
  });
});
