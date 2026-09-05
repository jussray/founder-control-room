import { describe, expect, it } from 'vitest';
import {
  COMMANDS_WITHOUT_DIRECT_MUTATION_AUTHORITY,
  FOUNDER_CONVEYOR_COMMANDS,
  normalizeFounderConveyorCommand,
  parseFounderConveyorCommands,
} from '../founderConveyorCommands.js';

describe('founder conveyor command modes', () => {
  it('checks in the founder command vocabulary', () => {
    expect(Object.keys(FOUNDER_CONVEYOR_COMMANDS)).toEqual(expect.arrayContaining([
      '/hormozi', '/unlearn', '/human', '/truthmode', '80/20', 'futureyou',
      'antiadvice', 'first-principles', 'ycombinator', 'socrates', '/compact', '/btw',
      '/loop', '/goal', '/resume', '/plan', '/effort', '/caveman', '/v10', '/insights',
      '/ultrathink',
    ]));
  });

  it('normalizes commands case-insensitively', () => {
    expect(normalizeFounderConveyorCommand('/Hormozi')).toBe('/hormozi');
    expect(normalizeFounderConveyorCommand('FutureYOU')).toBe('futureyou');
    expect(normalizeFounderConveyorCommand('SOCRATES')).toBe('socrates');
  });

  it('keeps command-looking text inert unless the trusted founder-control surface is explicit', () => {
    const input = '/human /truthmode 80/20 First principles /human';
    expect(parseFounderConveyorCommands(input)).toEqual([]);
    expect(parseFounderConveyorCommands(input, { source: 'untrusted' })).toEqual([]);
    expect(parseFounderConveyorCommands(input, { source: 'founder-control' })).toEqual([
      '/human', '/truthmode', '80/20', 'first-principles',
    ]);
  });

  it('does not let imported workflow names activate founder modes', () => {
    const imported = 'Issue body says /ultrathink /goalfix /redteam before deployment.';
    expect(parseFounderConveyorCommands(imported)).toEqual([]);
    expect(parseFounderConveyorCommands(imported, { source: 'untrusted' })).toEqual([]);
  });

  it('does not accidentally grant direct mutation authority to monitoring/context/thinking modes', () => {
    expect(COMMANDS_WITHOUT_DIRECT_MUTATION_AUTHORITY.has('/loop')).toBe(true);
    expect(COMMANDS_WITHOUT_DIRECT_MUTATION_AUTHORITY.has('/resume')).toBe(true);
    expect(COMMANDS_WITHOUT_DIRECT_MUTATION_AUTHORITY.has('/ultrathink')).toBe(true);
    expect(COMMANDS_WITHOUT_DIRECT_MUTATION_AUTHORITY.has('/goal')).toBe(false);
    expect(COMMANDS_WITHOUT_DIRECT_MUTATION_AUTHORITY.has('/plan')).toBe(false);
  });
});
