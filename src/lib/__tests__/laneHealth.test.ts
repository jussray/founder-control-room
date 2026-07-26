import { describe, expect, it } from 'vitest';
import { deriveLaneHealth, LANE_STALE_AFTER_MS } from '../laneHealth.js';

describe('deriveLaneHealth', () => {
  const now = new Date('2026-07-26T00:00:00Z');

  it('maps green/yellow/red to healthy/waiting/blocked when recently updated', () => {
    const recent = new Date(now.getTime() - 1000).toISOString();
    expect(deriveLaneHealth({ risk: 'green', updatedAt: recent }, now)).toBe('healthy');
    expect(deriveLaneHealth({ risk: 'yellow', updatedAt: recent }, now)).toBe('waiting');
    expect(deriveLaneHealth({ risk: 'red', updatedAt: recent }, now)).toBe('blocked');
  });

  it('falls back to the plain risk mapping when updatedAt is absent', () => {
    expect(deriveLaneHealth({ risk: 'green' }, now)).toBe('healthy');
    expect(deriveLaneHealth({ risk: 'yellow' }, now)).toBe('waiting');
  });

  it('reports unknown once a lane goes stale past the threshold, regardless of risk', () => {
    const stale = new Date(now.getTime() - LANE_STALE_AFTER_MS - 1).toISOString();
    expect(deriveLaneHealth({ risk: 'green', updatedAt: stale }, now)).toBe('unknown');
    expect(deriveLaneHealth({ risk: 'red', updatedAt: stale }, now)).toBe('unknown');
  });

  it('does not flip to unknown right at the threshold boundary', () => {
    const justInside = new Date(now.getTime() - LANE_STALE_AFTER_MS + 1).toISOString();
    expect(deriveLaneHealth({ risk: 'yellow', updatedAt: justInside }, now)).toBe('waiting');
  });

  it('falls back to the plain risk mapping on an unparseable updatedAt', () => {
    expect(deriveLaneHealth({ risk: 'red', updatedAt: 'not-a-date' }, now)).toBe('blocked');
  });
});
