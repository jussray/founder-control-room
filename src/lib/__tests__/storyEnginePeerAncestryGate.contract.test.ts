import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/playwright.yml', import.meta.url), 'utf8');

function gateStep(): string {
  const start = workflow.indexOf('- name: Verify pinned StoryEngine peer is still in live history');
  expect(start).toBeGreaterThan(-1);
  const end = workflow.indexOf('- name: Check out exact StoryEngine federation peer', start);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe('StoryEngine peer ancestry gate', () => {
  it('fails closed unless the pin is equal to or an ancestor of live StoryEngine main', () => {
    const step = gateStep();
    expect(step).toContain('test -n "$live"');
    expect(step).toContain('merge-base --is-ancestor "$STORYENGINE_PEER_SHA" "$live"');
    expect(step).toContain('exit 1');
  });

  it('binds the fetched history to the live ref it reported', () => {
    expect(gateStep()).toContain('test "$(git -C "$probe" rev-parse FETCH_HEAD)" = "$live"');
  });

  it('no longer requires live main to equal the pin exactly', () => {
    expect(gateStep()).not.toMatch(/^\s*test "\$live" = "\$STORYENGINE_PEER_SHA"\s*$/m);
  });

  it('still checks out and verifies the exact pinned peer for browser proof', () => {
    expect(workflow).toContain('ref: ${{ env.STORYENGINE_PEER_SHA }}');
    expect(workflow).toContain('test "$actual" = "$STORYENGINE_PEER_SHA"');
  });
});
