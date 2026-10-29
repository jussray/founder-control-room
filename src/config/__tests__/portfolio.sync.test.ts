import { describe, expect, it } from 'vitest';
import { ACTIVE_PROJECT_SLUGS, getPortfolioProject } from '../portfolio.js';

describe('SYNC portfolio registration', () => {
  it('registers the authoritative Sync repo as an active bounded project', () => {
    expect(ACTIVE_PROJECT_SLUGS.has('sync-party')).toBe(true);
    expect(getPortfolioProject('sync-party')).toEqual({
      slug: 'sync-party',
      name: 'SYNC Party Game',
      repository: 'jussray/sync-party-game',
      status: 'active',
      capabilities: ['multiplayer-game', 'control-room', 'playwright', 'continuity'],
    });
  });
});
