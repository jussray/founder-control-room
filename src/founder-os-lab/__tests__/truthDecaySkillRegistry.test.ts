import { describe, expect, it } from 'vitest';
import { buildFounderOsSkillRegistry } from '../skillRegistry.js';
import { FOUNDER_OS_LAB_SKILLS } from '../registry.js';

describe('Founder OS truth-decay skill registry', () => {
  it('exposes truth-decay as a prompt/resource skill with no execution authority', () => {
    const descriptor = FOUNDER_OS_LAB_SKILLS.find((entry) => entry.id === 'truth-decay-audit');
    const registry = buildFounderOsSkillRegistry();
    const entry = registry.entries.find((candidate) => candidate.id === 'skill:truth-decay-audit');

    expect(descriptor).toMatchObject({
      id: 'truth-decay-audit',
      mayExecute: false,
    });
    expect(entry).toMatchObject({
      id: 'skill:truth-decay-audit',
      kind: 'skill',
      exposure: { fcr: true, chief: true },
      mcp: { prompt: true, resource: true, tool: false },
    });
  });
});
