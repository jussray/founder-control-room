import type { SupabaseClient } from '@supabase/supabase-js';
import type { JiraActionStore } from './jiraActionExecutor.js';
import type { JiraActionClaimState } from './jiraActionReplayGate.js';

/** Backend-only adapter. The supplied client must be scoped to FCR's own project. */
export function makeSupabaseJiraActionStore(client: SupabaseClient): JiraActionStore {
  return {
    async read(key): Promise<JiraActionClaimState> {
      const { data, error } = await client
        .from('jira_action_claims').select('state').eq('action_key', key).maybeSingle();
      if (error) throw new Error('jira_action_claim_read_failed');
      if (!data) return 'absent';
      const state = data.state;
      if (!['claimed', 'provider-accepted', 'verified', 'outcome-unknown', 'denied'].includes(state)) {
        throw new Error('jira_action_claim_invalid_state');
      }
      return state as JiraActionClaimState;
    },
    async claimOnce(key) {
      const { data, error } = await client.rpc('claim_jira_action_once', { p_action_key: key });
      if (error || typeof data !== 'boolean') throw new Error('jira_action_claim_failed');
      return data;
    },
    async markUnknown(key) {
      const { data, error } = await client.rpc('transition_jira_action_claim', {
        p_action_key: key, p_next_state: 'outcome-unknown',
      });
      if (error || data !== true) throw new Error('jira_action_unknown_transition_failed');
    },
    async markProviderAccepted(key) {
      const { data, error } = await client.rpc('transition_jira_action_claim', {
        p_action_key: key, p_next_state: 'provider-accepted',
      });
      if (error || data !== true) throw new Error('jira_action_accepted_transition_failed');
    },
  };
}
