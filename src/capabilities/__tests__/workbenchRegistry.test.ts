import { describe, expect, it } from 'vitest';
import { capabilities } from '../workbenchRegistry.js';

describe('capability workbench registry', () => {
  it('keeps every reviewed capability complete and uniquely addressable', () => {
    const ids = capabilities.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(capabilities.length).toBeGreaterThanOrEqual(12);

    for (const capability of capabilities) {
      expect(capability.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/);
      expect(capability.inputs.length).toBeGreaterThan(0);
      expect(capability.proof.length).toBeGreaterThan(0);
      expect(capability.risk).toBeTruthy();
      expect(capability.implementation).toBeTruthy();
    }
  });

  it('keeps voice and future interaction surfaces inside the shared FCR authority runtime', () => {
    const runtime = capabilities.find((capability) => capability.id === 'shared-capability-runtime-v1');

    expect(runtime).toBeDefined();
    expect(runtime?.kind).toBe('Contract');
    expect(runtime?.purpose).toContain('same intent, live-authority, consequence, approval, execution-receipt, outcome-verification, and next-gate spine');
    expect(runtime?.environment).toContain('FCR remains the control plane');
    expect(runtime?.proof).toContain('Capability discovery is treated as a hint, never execution authority');
    expect(runtime?.proof).toContain('Live authority is rechecked immediately before execution');
    expect(runtime?.proof).toContain('Approvals bind to the exact proposal instead of an unscoped yes/no utterance');
    expect(runtime?.proof).toContain('Provider acceptance and verified founder outcome remain separate truth states');
    expect(runtime?.risk).toContain('does not expose provider credentials');
    expect(runtime?.risk).toContain('does not');
    expect(runtime?.implementation).toContain("type Surface = 'voice' | 'text' | 'mobile' | 'desktop' | 'automation' | 'future'");
    expect(runtime?.implementation).toContain("type Consequence = 'READ' | 'REVERSIBLE_WRITE' | 'CONSEQUENTIAL_WRITE'");
    expect(runtime?.implementation).toContain('Bind approval to proposalId');
  });
});
