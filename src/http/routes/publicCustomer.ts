/** Public customer surface: independent of founder sessions and permissions. */
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { supabaseAuth } from '../../lib/supabaseAuthClient.js';
import { publicTenantReader } from '../../mcp/publicTenantReader.js';
import { PublicMcpAccessDenied, type PublicMcpTenantReader } from '../../mcp/publicTenantAccess.js';
import { getCustomerWorkspace, VerifiedCustomerRequired } from '../../mcp/publicCustomerWorkspace.js';

type VerifyToken = (token: string) => Promise<unknown | null>;

const verifySupabaseUser: VerifyToken = async (token) => {
  const { data, error } = await supabaseAuth.auth.getUser(token);
  return error ? null : data?.user ?? null;
};

export function createPublicCustomerRouter(
  verifyToken: VerifyToken = verifySupabaseUser,
  reader: PublicMcpTenantReader = publicTenantReader,
) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.vary('Authorization');
    next();
  });

  router.get('/status', (_req, res) => res.status(200).json({
    publicBrowsingEnabled: true,
    customerRegistrationEnabled: false,
    customerWorkspaceReadEnabled: process.env.FCR_PUBLIC_CUSTOMER_WORKSPACES_ENABLED === 'true',
    checkoutEnabled: false,
    paidCapabilitiesEnabled: false,
  }));

  router.get('/workspace', limit, async (req, res) => {
    if (process.env.FCR_PUBLIC_CUSTOMER_WORKSPACES_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Customer workspaces are not activated' });
    }
    const authorization = req.get('Authorization') ?? '';
    // No cookie fallback, URL token, or founder session access. Each request
    // must present its own bearer credential issued by the verified identity provider.
    const token = /^Bearer ([^\s]{1,8192})$/.exec(authorization)?.[1];
    if (!token) {
      res.set('WWW-Authenticate', 'Bearer realm="fcr-customer"');
      return res.status(401).json({ error: 'Verified customer authentication required' });
    }
    try {
      const identity = await verifyToken(token);
      const result = await getCustomerWorkspace(identity, reader);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof VerifiedCustomerRequired) {
        res.set('WWW-Authenticate', 'Bearer realm="fcr-customer", error="invalid_token"');
        return res.status(401).json({ error: 'Verified customer authentication required' });
      }
      if (error instanceof PublicMcpAccessDenied) {
        return res.status(404).json({ error: 'Resource not found or unavailable' });
      }
      // Do not return empty lists or 200 when the provider or RLS is unavailable.
      return res.status(503).json({ error: 'Customer workspace temporarily unavailable' });
    }
  });

  return router;
}

export const publicCustomerRouter = createPublicCustomerRouter();
