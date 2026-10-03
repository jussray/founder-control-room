import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

const documentationTruth = read('.github/workflows/documentation-truth.yml');
const ci = read('.github/workflows/ci.yml');

function expectLiveBaseResolver(workflow: string): void {
  expect(workflow).not.toContain('github.event.pull_request.base.sha');
  expect(workflow).toContain("BASE_REF: ${{ github.event.pull_request.base.ref || '' }}");
  expect(workflow).toContain('git check-ref-format "refs/heads/${BASE_REF}"');
  expect(workflow).toContain('git ls-remote --heads origin "refs/heads/${BASE_REF}"');
  expect(workflow).toContain('git fetch --no-tags origin "$live_base_sha"');
  expect(workflow).toContain('git merge-base --is-ancestor "$live_base_sha" "$EXPECTED_HEAD_SHA"');
  expect(workflow).toContain('PUSH_BEFORE_SHA: ${{ github.event.before || \'\' }}');
  expect(workflow).toContain('0000000000000000000000000000000000000000');
}

describe('live proof base resolution contract', () => {
  it('binds the standalone Documentation Truth gate to the live target branch instead of the event snapshot', () => {
    expectLiveBaseResolver(documentationTruth);
    expect(documentationTruth).toContain("printf 'DOC_TRUTH_BASE_SHA=%s\\n' \"$live_base_sha\" >> \"$GITHUB_ENV\"");
  });

  it('binds both CI proof consumers to the live target branch instead of the event snapshot', () => {
    expectLiveBaseResolver(ci);
    expect(ci).toContain("printf 'DOC_TRUTH_BASE_SHA=%s\\n' \"$live_base_sha\" >> \"$GITHUB_ENV\"");
    expect(ci).toContain("printf 'TEST_DISCOVERY_BASE_SHA=%s\\n' \"$live_base_sha\" >> \"$GITHUB_ENV\"");
  });
});
