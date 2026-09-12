import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entrypoint = readFileSync('AGENTS_FOUNDER_INTELLIGENCE.md', 'utf8');

const requiredPhrases = [
  '## Intent sovereignty / founder agency',
  "Founder Control Room exists to increase the founder's reachable, truthful option space",
  'Founder intent is the canonical outcome signal, not unlimited authority.',
  'Freedom is bounded by reality, not product appetite.',
  '`REAL_BOUNDARY`, `CAPABILITY_GAP`, `EVIDENCE_GAP`, `PRODUCT_FRICTION`, or `PREFERENCE`',
  'Preserve the goal when the path fails.',
  'Prefer the smallest direct reversible path.',
  'No artificial dependency.',
  'Automation reduces burden; it does not confiscate control.',
  'Unknown stays unknown.',
  'Economic friction is evidence-bearing.',
  'Capability growth compounds.',
  'INTENT SOVEREIGNTY',
  'REAL BOUNDARIES',
  'ARTIFICIAL FRICTION',
  'OPTION SPACE',
  'DEPENDENCY',
  'FOUNDER CAPABILITY',
];

describe('founder intent sovereignty contract', () => {
  it('keeps founder agency load-bearing in the canonical portfolio entrypoint', () => {
    for (const phrase of requiredPhrases) {
      expect(entrypoint).toContain(phrase);
    }
  });

  it('keeps agency subordinate to real authority and truth boundaries', () => {
    expect(entrypoint).toContain('not unlimited authority');
    expect(entrypoint).toContain('privacy, safety, law, product isolation, live permissions, consequence rules, budget, and evidence requirements');
    expect(entrypoint).toContain('Any system behavior that narrows founder choice for its own convenience, monetization, architecture purity, or local optimization is a control-room defect');
  });
});
