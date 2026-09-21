import { supabase as baseSupabase } from './fakeSupabaseClient.mjs';
import { table, withDefaults } from './fakeStore.mjs';

function normalizedEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function workspaceAwareRpc(name, args) {
  if (name !== 'provision_workspace_founder') {
    return baseSupabase.rpc(name, args);
  }

  const userId = String(args?.p_user_id ?? '').trim();
  const email = normalizedEmail(args?.p_email);
  if (!userId || !email || !email.includes('@')) {
    return { data: null, error: { code: '22023', message: 'verified identity required' } };
  }

  const founders = table('founder_users');
  const workspaces = table('workspaces');
  let founder = founders.find((row) => String(row.user_id ?? '') === userId);

  if (founder) {
    if (
      normalizedEmail(founder.email) !== email
      || founder.account_role !== 'workspace_owner'
      || !founder.workspace_id
    ) {
      return { data: null, error: { code: '42501', message: 'customer provisioning forbidden' } };
    }
    return {
      data: {
        email,
        user_id: founder.user_id,
        workspace_id: founder.workspace_id,
        account_role: founder.account_role,
      },
      error: null,
    };
  }

  founder = founders.find((row) => normalizedEmail(row.email) === email);
  if (founder) {
    if (
      !founder.user_id
      && founder.account_role === 'workspace_owner'
      && founder.workspace_id
    ) {
      founder.user_id = userId;
      return {
        data: {
          email,
          user_id: founder.user_id,
          workspace_id: founder.workspace_id,
          account_role: founder.account_role,
        },
        error: null,
      };
    }
    return { data: null, error: { code: '42501', message: 'email identity already claimed' } };
  }

  const workspace = withDefaults({
    slug: `founder-${userId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)}`,
    name: 'Founder Workspace',
  }, 'workspaces');
  founder = withDefaults({
    email,
    user_id: userId,
    workspace_id: workspace.id,
    account_role: 'workspace_owner',
  }, 'founder_users');

  workspaces.push(workspace);
  founders.push(founder);

  return {
    data: {
      email,
      user_id: founder.user_id,
      workspace_id: founder.workspace_id,
      account_role: founder.account_role,
    },
    error: null,
  };
}

export const supabase = {
  ...baseSupabase,
  rpc: workspaceAwareRpc,
};

export function makeSupabaseClient() {
  return supabase;
}
