import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/deterministic-review-core-advisory.yml', import.meta.url),
  'utf8',
);
const witnessScript = readFileSync(
  new URL('../../../scripts/publish-deterministic-review-witness.mjs', import.meta.url),
  'utf8',
);
const publisher = readFileSync(
  new URL('../../review/deterministicReviewWitnessPublisher.ts', import.meta.url),
  'utf8',
);

describe('trusted review witness exact-head dispatch contract', () => {
  it('carries the founder-observed PR head through workflow dispatch', () => {
    expect(workflow).toContain('expected_pr_head_sha:');
    expect(workflow).toContain('Exact PR head observed before trusted witness dispatch');
    expect(workflow).toContain('--arg expected_pr_head_sha "$TARGET_HEAD_SHA"');
    expect(workflow).toContain(
      "'{ref:$ref, inputs:{pull_request_number:$pr, expected_pr_head_sha:$expected_pr_head_sha, expected_main_sha:$expected_main_sha}}'",
    );
    expect(workflow).toContain('EXPECTED_REVIEW_HEAD_SHA: ${{ inputs.expected_pr_head_sha }}');
    expect(workflow).toContain('[[ "$EXPECTED_REVIEW_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]]');
  });

  it('binds both success and failure receipts to the immutable expected PR head', () => {
    expect(witnessScript).toContain('expectedReviewHeadSha = required("EXPECTED_REVIEW_HEAD_SHA").toLowerCase();');
    expect(witnessScript).toContain('expectedHeadSha: expectedReviewHeadSha');
    expect(witnessScript.match(/expectedReviewHeadSha,/g)?.length).toBeGreaterThanOrEqual(2);
    expect(witnessScript).toContain('PULL_REQUEST_IDENTITY_MOVED');
  });

  it('rejects provider-derived review identity drift before any witness publication', () => {
    const guard = publisher.indexOf('assertFounderBoundExpectedHead(receipt, input.expectedHeadSha);');
    const publication = publisher.indexOf('await input.provider.publishDeterministicReviewWitness');

    expect(publisher).toContain('expectedHeadSha?: string;');
    expect(publisher).toContain('founder-bound expected head does not match provider review head');
    expect(guard).toBeGreaterThan(-1);
    expect(publication).toBeGreaterThan(guard);
  });
});
