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
  '## Bidirectional continuity and proof-cookie reconciliation',
  'Continuity fingerprints and proof cookies must work in both directions',
  '### Inbound truth reconciliation',
  'Fresh evidence may prove that code, configuration, documentation, an issue, a runtime assumption, a merge candidate, or a prior proof claim is stale, wrong, incomplete, or already resolved.',
  '### Approval-to-action gate',
  'A verified fingerprint or proof cookie is evidence, not approval.',
  'Under valid current founder approval, verified evidence may be used to take the smallest reversible action that aligns project state with reality',
  'Founder approval never converts a stale fingerprint into current proof',
  '### Outbound continuity reconciliation',
  'mint or record the successor continuity fingerprint or proof cookie linked to the predecessor',
  'It cannot replay the founder\'s approval, grant standing merge authority, authorize another mutation, or make future evidence current automatically.',
  'Required reconciliation loop:',
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

  it('keeps continuity bidirectional without turning evidence into authority', () => {
    expect(entrypoint).toContain('They never create, renew, inherit, or widen authority.');
    expect(entrypoint).toContain('It does not authorize the proposal by itself.');
    expect(entrypoint).toContain('If the approved proposal\'s scope, subject, head, authority, or required evidence moves, reacquire evidence and approval as required before mutation.');
    expect(entrypoint).toContain('re-resolve the authoritative repository/provider/runtime state instead of assuming the write succeeded');
  });
});