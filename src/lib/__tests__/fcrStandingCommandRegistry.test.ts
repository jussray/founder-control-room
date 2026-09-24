import { describe, expect, it } from 'vitest';

import {
  FCR_ALWAYS_ON_STANDING_COMMAND_IDS,
  FCR_OPERATING_SYSTEM_REGISTRY,
  FCR_STANDING_COMMAND_REGISTRY,
  routeFcrStandingCommands,
} from '../fcrStandingCommandRegistry.js';

describe('FCR standing command and OS registry', () => {
  it('keeps OS identity explicit and separate from runtime status', () => {
    expect(FCR_OPERATING_SYSTEM_REGISTRY.map((entry) => entry.id)).toEqual([
      'founder-control-room',
      'council-os',
      'preflight-os',
      'video-production-os',
      'media-router-os',
      'promptos',
      'design-os',
    ]);
    expect(FCR_OPERATING_SYSTEM_REGISTRY.every((entry) => entry.class === 'operating-system')).toBe(true);
    expect(FCR_OPERATING_SYSTEM_REGISTRY.every((entry) => entry.identityLocked)).toBe(true);
    expect(FCR_OPERATING_SYSTEM_REGISTRY.every((entry) => !('status' in entry))).toBe(true);
  });

  it('registers standing commands as non-authorizing behavior instead of manual activation gates', () => {
    const ids = new Set(FCR_STANDING_COMMAND_REGISTRY.map((entry) => entry.id));
    for (const id of [
      'ultrathink', 'truthmode', 'confess', 'redteam', 'lindymode', 'ooda', 'l99',
      'goalfix', 'attack', 'makevideo', 'leevize', 'garyvee', 'billgates', 'elonmusk',
      'devil', 'steelman', 'human', 'ghost', 'futureyou', 'steal', 'hormozi',
      'firstprinciples', 'socrates', 'antiadvice', 'unlearn', 'visualize', 'artifact',
      'compact', 'btw', 'effort', 'caveman', 'v10', 'insights', 'sales', 'expert',
      'teacher', 'brief', 'strategy', 'critic', 'brainstorm', 'promptengineer',
      'skill-creator', 'ship', 'grow', 'handoff', 'plan', 'resume', 'cont',
      'approved', 'next', 'review', 'merge', 'fix', 'prove',
    ]) expect(ids.has(id), id).toBe(true);
    expect(FCR_STANDING_COMMAND_REGISTRY.every((entry) => entry.mayExecute === false)).toBe(true);
    expect(FCR_ALWAYS_ON_STANDING_COMMAND_IDS).toContain('ultrathink');
    expect(FCR_ALWAYS_ON_STANDING_COMMAND_IDS).toContain('truthmode');
    expect(FCR_ALWAYS_ON_STANDING_COMMAND_IDS).toContain('confess');
  });

  it('auto-routes repair and attack behavior without requiring slash commands', () => {
    const decision = routeFcrStandingCommands(
      'Audit and repair this repository. Attack 48000 and prove the exact state.',
      'write',
    );

    expect(decision.standingCommandIds).toEqual(expect.arrayContaining([
      'ultrathink',
      'truthmode',
      'confess',
      'redteam',
      'lindymode',
      'l99',
      'ooda',
      'goalfix',
      'prove',
      'attack',
      'devil',
    ]));
    expect(decision.attackIntensity).toBe(48000);
    expect(decision.operatingSystemIds).toEqual(expect.arrayContaining([
      'founder-control-room',
      'council-os',
      'preflight-os',
    ]));
  });

  it('auto-routes video intent through Video Production OS plus Media Router OS', () => {
    const decision = routeFcrStandingCommands(
      'Continue the cinematic YouTube video and preserve shot continuity.',
      'write',
    );

    expect(decision.standingCommandIds).toEqual(expect.arrayContaining(['makevideo', 'leevize']));
    expect(decision.operatingSystemIds).toEqual(expect.arrayContaining([
      'video-production-os',
      'media-router-os',
    ]));
  });

  it('preserves composed commands while keeping manual invocation optional', () => {
    const decision = routeFcrStandingCommands(
      'ULTRATHINK/steal this strategy then /truthmode/confess.',
      'plan',
    );

    expect(decision.explicitCommandIds).toEqual(expect.arrayContaining([
      'ultrathink',
      'steal',
      'truthmode',
      'confess',
    ]));
    expect(decision.standingCommandIds).toContain('plan');
  });
});
