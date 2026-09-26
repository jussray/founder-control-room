import { describe, expect, it } from 'vitest';
import {
  nextStandingMissionRun,
  normalizeStandingMissionCadence,
  standingMissionDefinitionFingerprint,
} from '../standingMissionSchedule.js';

describe('standing mission schedule contract', () => {
  it('keeps interval schedules anchored instead of drifting from completion time', () => {
    const next = nextStandingMissionRun(
      { kind: 'interval', minutes: 240, anchor: '2026-09-15T00:31:38Z' },
      'America/New_York',
      '2026-09-26T17:40:00Z',
    );
    expect(next.toISOString()).toBe('2026-09-26T20:31:38.000Z');
  });

  it('resolves a daily local-time schedule in America/New_York', () => {
    const next = nextStandingMissionRun(
      { kind: 'daily', hour: 8, minute: 0 },
      'America/New_York',
      '2026-09-26T11:55:00Z',
    );
    expect(next.toISOString()).toBe('2026-09-26T12:00:00.000Z');
  });

  it('rolls a daily schedule to the next local day after the due time', () => {
    const next = nextStandingMissionRun(
      { kind: 'daily', hour: 8, minute: 0 },
      'America/New_York',
      '2026-09-26T12:01:00Z',
    );
    expect(next.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });

  it('resolves weekly local-time schedules without treating UTC weekday as local weekday', () => {
    const next = nextStandingMissionRun(
      { kind: 'weekly', weekdays: [1, 3, 5], hour: 15, minute: 0 },
      'America/New_York',
      '2026-09-26T17:00:00Z',
    );
    expect(next.toISOString()).toBe('2026-09-28T19:00:00.000Z');
  });

  it('keeps wall-clock time stable across the autumn DST transition', () => {
    const before = nextStandingMissionRun(
      { kind: 'daily', hour: 8, minute: 0 },
      'America/New_York',
      '2026-10-31T13:00:00Z',
    );
    const after = nextStandingMissionRun(
      { kind: 'daily', hour: 8, minute: 0 },
      'America/New_York',
      '2026-11-01T13:01:00Z',
    );
    expect(before.toISOString()).toBe('2026-11-01T13:00:00.000Z');
    expect(after.toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('normalizes duplicate weekly weekdays', () => {
    expect(normalizeStandingMissionCadence({
      kind: 'weekly',
      weekdays: [5, 1, 3, 1],
      hour: 15,
      minute: 0,
    })).toEqual({ kind: 'weekly', weekdays: [1, 3, 5], hour: 15, minute: 0 });
  });

  it('fingerprints private prompt content without returning it', () => {
    const base = {
      missionId: 'mission-1',
      sourceTaskRef: 'legacy-task-1',
      timingMode: 'condition_watch' as const,
      cadence: { kind: 'interval' as const, minutes: 60, anchor: '2026-09-20T06:24:25Z' },
      timezone: 'America/New_York',
      executionProfile: 'chatgpt-sol',
      privatePrompt: 'private mission prompt',
      capabilityManifest: ['web-research', 'portfolio-truth'],
    };
    const first = standingMissionDefinitionFingerprint(base);
    const second = standingMissionDefinitionFingerprint({ ...base, capabilityManifest: ['portfolio-truth', 'web-research'] });
    const changed = standingMissionDefinitionFingerprint({ ...base, privatePrompt: 'changed private mission prompt' });

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(second);
    expect(changed).not.toBe(first);
    expect(first).not.toContain('private');
  });
});
