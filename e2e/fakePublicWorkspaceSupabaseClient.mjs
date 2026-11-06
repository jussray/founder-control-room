import { supabase as baseSupabase } from './fakeSupabaseClient.mjs';
import { table, withDefaults } from './fakeStore.mjs';

function normalizedEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Synthetic E2E only: model a trusted, pre-existing invitation rather than
// allowing every verified email to create customer authority.
const invitedCustomerEmail = normalizedEmail(process.env.E2E_CUSTOMER_INVITE_EMAIL);
if (invitedCustomerEmail) {
  const founders = table('founder_users');
  if (!founders.some((row) => normalizedEmail(row.email) === invitedCustomerEmail)) {
    const workspace = withDefaults({
      slug: 'invited-e2e-customer-workspace',
      name: 'Invited Test Workspace',
    }, 'workspaces');
    table('workspaces').push(workspace);
    founders.push(withDefaults({
      email: invitedCustomerEmail,
      user_id: null,
      workspace_id: workspace.id,
      account_role: 'workspace_owner',
    }, 'founder_users'));
  }
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

  return {
    data: null,
    error: { code: '42501', message: 'workspace invitation required' },
  };
}

export const supabase = {
  ...baseSupabase,
  rpc: workspaceAwareRpc,
};

export function makeSupabaseClient() {
  return supabase;
}
