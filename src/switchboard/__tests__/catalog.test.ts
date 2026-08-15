import { describe, expect, it } from 'vitest';
import { portfolioSwitchCatalog } from '../catalog.js';

describe('portfolio switch catalog', () => {
  it('keeps every switch id unique and every evidence boundary explicit', () => {
    const ids = portfolioSwitchCatalog.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of portfolioSwitchCatalog) {
      expect(item.label.length).toBeGreaterThan(3);
      expect(item.offEffect.length).toBeGreaterThan(10);
      expect(item.onCondition.length).toBeGreaterThan(10);
      expect(item.evidenceRef.length).toBeGreaterThan(3);
      if (item.auditedSha) expect(item.auditedSha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('never lets a locked-off capability default to on', () => {
    const locked = portfolioSwitchCatalog.filter((item) => item.controlMode === 'locked_off');
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((item) => item.defaultDesiredState === 'off')).toBe(true);
  });

  it('keeps high-consequence unproven capabilities locked off', () => {
    const byId = new Map(portfolioSwitchCatalog.map((item) => [item.id, item]));
    for (const id of [
      'fcr-founder-signal-publication',
      'fcr-vanta-compliance-provider',
      'sekret-l4-continuity',
      'sekret-streaming-voice',
      'sekret-governed-media',
      'sekret-store-release',
      'chief-compliance-chief',
    ]) {
      expect(byId.get(id)).toMatchObject({ controlMode: 'locked_off', defaultDesiredState: 'off' });
    }
  });

  it('has exactly one v1 server-enforced master execution switch', () => {
    const enforced = portfolioSwitchCatalog.filter((item) => item.controlMode === 'enforced');
    expect(enforced).toHaveLength(1);
    expect(enforced[0]).toMatchObject({
      id: 'fcr-privileged-execution-master',
      defaultDesiredState: 'on',
    });
  });
});
