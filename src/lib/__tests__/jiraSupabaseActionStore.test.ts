import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeSupabaseJiraActionStore } from '../jiraSupabaseActionStore.js';

function fakeClient() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const client = { from, rpc } as unknown as SupabaseClient;
  return { client, from, select, eq, maybeSingle, rpc };
}

describe('FCR Supabase Jira action store', () => {
  it('reads missing claim as absent', async () => {
    const { client } = fakeClient();
    expect(await makeSupabaseJiraActionStore(client).read('fcr-jira-action:1')).toBe('absent');
  });

  it('returns existing claimed state', async () => {
    const { client, maybeSingle } = fakeClient();
    maybeSingle.mockResolvedValueOnce({ data: { state: 'claimed' }, error: null });
    expect(await makeSupabaseJiraActionStore(client).read('fcr-jira-action:1')).toBe('claimed');
  });

  it('fails closed on unreadable or invalid claim', async () => {
    const { client, maybeSingle } = fakeClient();
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'network' } });
    await expect(makeSupabaseJiraActionStore(client).read('fcr-jira-action:1'))
      .rejects.toThrow('jira_action_claim_read_failed');
    maybeSingle.mockResolvedValueOnce({ data: { state: 'unexpected' }, error: null });
    await expect(makeSupabaseJiraActionStore(client).read('fcr-jira-action:1'))
      .rejects.toThrow('jira_action_claim_invalid_state');
  });

  it('uses atomic database RPC for first claim', async () => {
    const { client, rpc } = fakeClient();
    const store = makeSupabaseJiraActionStore(client);
    expect(await store.claimOnce('fcr-jira-action:1')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('claim_jira_action_once', {
      p_action_key: 'fcr-jira-action:1',
    });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await store.claimOnce('fcr-jira-action:1')).toBe(false);
  });

  it('fails closed when database claim RPC fails', async () => {
    const { client, rpc } = fakeClient();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(makeSupabaseJiraActionStore(client).claimOnce('fcr-jira-action:1'))
      .rejects.toThrow('jira_action_claim_failed');
  });

  it('transitions only through service-role RPC', async () => {
    const { client, rpc } = fakeClient();
    const store = makeSupabaseJiraActionStore(client);
    await store.markUnknown('fcr-jira-action:1');
    await store.markProviderAccepted('fcr-jira-action:2');
    expect(rpc).toHaveBeenCalledWith('transition_jira_action_claim', {
      p_action_key: 'fcr-jira-action:1', p_next_state: 'outcome-unknown',
    });
    expect(rpc).toHaveBeenCalledWith('transition_jira_action_claim', {
      p_action_key: 'fcr-jira-action:2', p_next_state: 'provider-accepted',
    });
  });
});
