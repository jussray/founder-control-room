import { describe, expect, it } from 'vitest';
import { listExternalSkills, inspectExternalSkill } from '../externalSkillIntake.js';

describe('external skill intake', () => {
  it('catalogues all fifteen distinct candidates without activating them', () => {
    const rows = listExternalSkills();
    expect(rows).toHaveLength(15);
    expect(new Set(rows.map(row => row.id)).size).toBe(15);
    expect(rows.every(row => row.state === 'QUARANTINED' && row.executionAllowed === false)).toBe(true);
    expect(rows.every(row => row.revision === null && row.license === null)).toBe(true);
  });
  it('filters candidates by destination', () => {
    expect(listExternalSkills('medusa').map(row => row.id)).toEqual(['skillspector']);
  });
  it('rejects unknown identifiers, including prototype keys', () => {
    expect(inspectExternalSkill('constructor')).toBeNull();
    expect(inspectExternalSkill('not-registered')).toBeNull();
  });
  it('returns independent records and requires all review gates', () => {
    const first = inspectExternalSkill('repomix');
    expect(first?.requiredGates).toEqual([
      'pin-revision', 'license-review', 'security-review', 'sandbox-proof',
      'runtime-compatibility', 'founder-approval'
    ]);
    expect(first?.executionAllowed).toBe(false);
    expect(inspectExternalSkill('repomix')).not.toBe(first);
  });
});
