import { supabase as baseSupabase } from './fakeSupabaseClient.mjs';
import { table, withDefaults } from './fakeStore.mjs';

function normalizedEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function workspaceAwareRpc(name, args) {
  if (name === 'create_workspace_project_with_onboarding_event') {
    const projects = table('projects');
    const events = table('project_events');
    const metadata = args?.p_event_metadata;
    if (!args?.p_workspace_id || !String(args?.p_slug ?? '').trim() || !String(args?.p_name ?? '').trim()) {
      return { data: null, error: { code: '22023', message: 'invalid workspace onboarding subject' } };
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return { data: null, error: { code: '22023', message: 'invalid onboarding event metadata' } };
    }
    if ('founder' in metadata || 'email' in metadata || 'founderEmail' in metadata) {
      return { data: null, error: { code: '22023', message: 'founder identity is forbidden in onboarding event metadata' } };
    }
    if (projects.some((row) => row.slug === args.p_slug)) {
      return { data: null, error: { code: '23505', message: 'duplicate project slug' } };
    }

    const project = withDefaults({
      workspace_id: args.p_workspace_id,
      slug: args.p_slug,
      name: args.p_name,
      repo_provider: args.p_repo_provider,
      repo_identifier: args.p_repo_identifier,
      stack: args.p_stack,
      status: 'active',
      risk_level: 'medium',
    }, 'projects');
    const event = withDefaults({
      project_id: project.id,
      source_event_id: `e2e-onboarding-${project.id}`,
      event_type: 'founder_onboarding_bootstrapped',
      severity: 'info',
      screen: 'chief-workspace-onboarding',
      metadata,
    }, 'project_events');

    // Commit both rows only after every validation above has succeeded. This
    // mirrors the all-or-nothing PostgreSQL function used in production.
    projects.push(project);
    events.push(event);
    return { data: project, error: null };
  }


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
