import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

describe('Founder Control Room + Chief AI master build v1.3 authority', () => {
  it('keeps the current base document and explicit v1.3 reconciliation distinct', async () => {
    const [base, addendum] = await Promise.all([
      read('docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC.md'),
      read('docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_3_ADDENDUM.md'),
    ]);

    expect(base).toContain('Version: 1.2');
    expect(addendum).toContain('Effective approved version: **v1.3**');
    expect(addendum).toContain('v1.2 base');
    expect(addendum).toContain('effective master specification v1.3');
    expect(addendum).toContain('does not manufacture implementation, deployment, provider, database, runtime, review, or launch evidence');
  });

  it('locks the governed V10 FutureYOU / Me model', async () => {
    const addendum = await read('docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_3_ADDENDUM.md');

    for (const token of [
      'Me Now',
      'FutureYOU',
      'verified gap',
      'V10 bridge',
      'smallest compounding move',
      'DRIFT WATCH',
      'NEXT REVIEW',
      'Changing the canonical V10 vision requires explicit founder approval',
    ]) {
      expect(addendum).toContain(token);
    }
  });

  it('locks Product Design as a launch track without broadening proof scope', async () => {
    const addendum = await read('docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_3_ADDENDUM.md');

    for (const token of [
      'exactly three genuinely distinct visual directions',
      'founder-selected visual target',
      'source-to-render design QA',
      'accessibility review',
      'Playwright screenshots and traces',
      'reduced-motion',
      'screen-reader',
    ]) {
      expect(addendum).toContain(token);
    }

    expect(addendum).toContain('Product Design evidence proves visual and UX behavior only');
    expect(addendum).toContain('does not prove authentication, authorization, RLS');
  });

  it('keeps the checked-in directive and V10 prompt as supporting authority', async () => {
    const [directive, prompt] = await Promise.all([
      read('docs/CODEX_JUSS_FLOW_FULL_APP_LAUNCH_DIRECTIVE.md'),
      read('docs/CODEX_V10_FUTUREYOU_ME_LAUNCH_PROMPT.md'),
    ]);

    expect(directive).toContain('V10 Vision: FutureYOU / Me Model');
    expect(directive).toContain('Product Design');
    expect(prompt).toContain('V10 VISION MODEL');
    expect(prompt).toContain('PRODUCT DESIGN');
  });

  it('preserves the launch truth ladder and evidence boundaries', async () => {
    const addendum = await read('docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_3_ADDENDUM.md');

    for (const state of [
      'specified',
      'implemented',
      'unit-verified',
      'integration-verified',
      'browser-verified',
      'CI-verified',
      'merged',
      'deployed',
      'runtime-verified',
      'launch-ready',
      'launched',
    ]) {
      expect(addendum).toContain(state);
    }

    expect(addendum).toContain('No state may inherit verification from a broader or older claim without fresh evidence');
  });
});
