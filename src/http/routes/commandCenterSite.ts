/**
 * Read-only bridge for a separately hosted ChatGPT Site.
 * Cross-origin browser cookies cannot confer founder authority.
 */
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  COMMAND_CENTER_SITE_RESOURCE,
  resolveCommandCenterActor,
} from '../../auth/commandCenterSiteAccess.js';
import {
  listMyPublicProjects,
  type PublicMcpTenantReader,
  type PublicProjectSummary,
} from '../../mcp/publicTenantAccess.js';

const OWNER_CONSOLE_URL = 'https://foundercontrolroom.org/control-room/';
const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
export const commandCenterSiteRouter = Router();

// Only the public tenant tables may be consulted for a customer.
const tenantReader: PublicMcpTenantReader = {
  async listMemberships(userId) {
    const { data, error } = await supabase.from('fcr_public_memberships')
      .select('tenant_id,user_id,status')
      .eq('user_id', userId).eq('status', 'active').limit(21);
    if (error) throw new Error('command_center_membership_unavailable');
    return (data ?? []).map(row => ({
      tenantId: row.tenant_id, userId: row.user_id, status: row.status,
    }));
  },
  async listProjects(tenantId) {
    const { data, error } = await supabase.from('fcr_public_projects')
      .select('id,tenant_id,name,status,observed_at')
      .eq('tenant_id', tenantId).order('id').limit(51);
    if (error) throw new Error('command_center_projects_unavailable');
    return (data ?? []).map((row): PublicProjectSummary => ({
      id: row.id, tenantId: row.tenant_id, name: row.name,
      status: row.status, observedAt: row.observed_at,
    }));
  },
  async getProject(_tenantId, _projectId) {
    return null;
  },
};

commandCenterSiteRouter.get('/site/command-center/bootstrap', limiter, async (req, res) => {
  res.set({
    'Cache-Control': 'private, no-store',
    'Vary': 'Origin, Authorization',
    'X-Content-Type-Options': 'nosniff',
  });
  if (process.env.FCR_COMMAND_CENTER_SITE_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Site bridge is not activated' });
  }
  const bearer = /^Bearer ([^\s]+)$/.exec(req.header('authorization') ?? '')?.[1];
  if (!bearer) {
    res.set('WWW-Authenticate', 'Bearer resource="' + COMMAND_CENTER_SITE_RESOURCE + '"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  const issuerBase = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const actor = await resolveCommandCenterActor(bearer, {
    issuer: issuerBase ? issuerBase + '/auth/v1' : '',
    ownerUserId: process.env.FCR_COMMAND_CENTER_OWNER_USER_ID ?? '',
    allowedClientIds: (process.env.FCR_COMMAND_CENTER_OAUTH_CLIENT_IDS ?? '')
      .split(',').map(x => x.trim()).filter(Boolean),
  }, async token => {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    return error || !data?.user ? null : {
      id: data.user.id, email: data.user.email, is_anonymous: data.user.is_anonymous,
    };
  }, async immutableUserId => {
    const { data, error } = await supabase.from('founder_users')
      .select('user_id').eq('user_id', immutableUserId).maybeSingle();
    return !error && data?.user_id === immutableUserId;
  });
  if (!actor) return res.status(401).json({ error: 'Authentication required' });
  if (actor.role === 'owner') {
    // Sensitive founder dashboard data stays on its first-party authenticated
    // origin; this response never exports founder workspace state.
    return res.json({
      account: 'owner', ownerConsoleUrl: OWNER_CONSOLE_URL,
      externalFounderData: false, executionAuthorized: false,
    });
  }
  try {
    const result = await listMyPublicProjects(
      { id: actor.userId, clientId: actor.clientId }, tenantReader,
    );
    return res.json({
      account: 'customer',
      workspace: { projects: result.projects },
      inheritedFounderContext: false,
      executionAuthorized: false,
    });
  } catch {
    // Do not report a successful empty workspace when storage has failed.
    return res.status(503).json({ error: 'Customer workspace unavailable' });
  }
});
