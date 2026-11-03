import { describe, expect, it, vi } from 'vitest';
import { runClaimedJiraAction, type JiraActionStore } from '../jiraActionExecutor.js';
import type { JiraActionClaimState } from '../jiraActionReplayGate.js';

function setup(state: JiraActionClaimState = 'absent', won = true) {
  const store: JiraActionStore = {
    read: vi.fn().mockResolvedValue(state),
    claimOnce: vi.fn().mockResolvedValue(won),
    markUnknown: vi.fn().mockResolvedValue(undefined),
    markProviderAccepted: vi.fn().mockResolvedValue(undefined),
  };
  const write = vi.fn().mockResolvedValue(undefined);
  return { store, write };
}

const key = 'fcr-jira-action:123';

describe('claim-gated Jira execution', () => {
  it('writes only after winning a durable claim', async () => {
    const { store, write } = setup();
    expect(await runClaimedJiraAction(key, store, write)).toBe('provider-accepted');
    expect(store.claimOnce).toHaveBeenCalledWith(key);
    expect(write).toHaveBeenCalledOnce();
    expect(store.markProviderAccepted).toHaveBeenCalledWith(key);
  });

  it('does not write if another worker owns the claim', async () => {
    const { store, write } = setup('absent', false);
    expect(await runClaimedJiraAction(key, store, write)).toBe('verify-provider-state');
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['claimed', 'provider-accepted', 'outcome-unknown'] as const)(
    'does not retry an existing %s action', async (state) => {
      const { store, write } = setup(state);
      expect(await runClaimedJiraAction(key, store, write)).toBe('verify-provider-state');
      expect(store.claimOnce).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('records unknown outcome after a provider timeout without replay', async () => {
    const { store, write } = setup();
    vi.mocked(write).mockRejectedValueOnce(new Error('timeout'));
    expect(await runClaimedJiraAction(key, store, write)).toBe('verify-provider-state');
    expect(store.markUnknown).toHaveBeenCalledWith(key);
    expect(store.markProviderAccepted).not.toHaveBeenCalled();
  });

  it('permits only one provider write across simultaneous deliveries', async () => {
    let claimed = false;
    const store = setup().store;
    vi.mocked(store.claimOnce).mockImplementation(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });
    const write = vi.fn().mockResolvedValue(undefined);
    const outcomes = await Promise.all([
      runClaimedJiraAction(key, store, write),
      runClaimedJiraAction(key, store, write),
    ]);
    expect(outcomes.sort()).toEqual(['provider-accepted', 'verify-provider-state']);
    expect(write).toHaveBeenCalledOnce();
  });

  it('does not write when claim storage is unavailable', async () => {
    const { store, write } = setup();
    vi.mocked(store.claimOnce).mockRejectedValueOnce(new Error('db unavailable'));
    await expect(runClaimedJiraAction(key, store, write)).rejects.toThrow('db unavailable');
    expect(write).not.toHaveBeenCalled();
  });


  it.each(['verified', 'denied'] as const)(
    'does not claim or write when action is %s', async (state) => {
      const { store, write } = setup(state);
      expect(await runClaimedJiraAction(key, store, write))
        .toBe(state === 'verified' ? 'already-verified' : 'stop');
      expect(store.claimOnce).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('does not falsely report provider acceptance when recording it fails', async () => {
    const { store, write } = setup();
    vi.mocked(store.markProviderAccepted).mockRejectedValueOnce(new Error('db offline'));
    await expect(runClaimedJiraAction(key, store, write)).rejects.toThrow('db offline');
    expect(write).toHaveBeenCalledOnce();
    expect(store.markUnknown).not.toHaveBeenCalled();
  });

  it('does not falsely report verification when unknown outcome persistence fails', async () => {
    const { store, write } = setup();
    vi.mocked(write).mockRejectedValueOnce(new Error('timeout'));
    vi.mocked(store.markUnknown).mockRejectedValueOnce(new Error('db offline'));
    await expect(runClaimedJiraAction(key, store, write)).rejects.toThrow('db offline');
    expect(write).toHaveBeenCalledOnce();
    expect(store.markProviderAccepted).not.toHaveBeenCalled();
  });

  it('rejects invalid action keys before claiming', async () => {
    const { store, write } = setup();
    await expect(runClaimedJiraAction('', store, write)).rejects.toThrow('invalid_jira_action_key');
    expect(store.read).not.toHaveBeenCalled();
  });
});
