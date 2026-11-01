/**
 * Non-authorizing customer workspace projection. This is not founder auth
 * or a billing entitlement; only a verified customer can read public-tenant
 * summaries already granted by a trusted server.
 */
import { listMyPublicProjects, type PublicMcpTenantReader } from './publicTenantAccess.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class VerifiedCustomerRequired extends Error {
  constructor() { super('Verified customer authentication required'); }
}

export function verifiedCustomerId(identity: unknown): string {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new VerifiedCustomerRequired();
  }
  const candidate=identity as Record<string,unknown>;
  const id=candidate.id;
  if (typeof id !== 'string' || !UUID.test(id) ||
      typeof candidate.email !== 'string' || !candidate.email.trim() ||
      typeof candidate.email_confirmed_at !== 'string' || !candidate.email_confirmed_at.trim() ||
      candidate.is_anonymous === true) {
    throw new VerifiedCustomerRequired();
  }
  return id;
}

export async function getCustomerWorkspace(
  verifiedIdentity: unknown,
  reader: PublicMcpTenantReader,
) {
  const accountId=verifiedCustomerId(verifiedIdentity);
  // The shared public tenancy membrane verifies membership identity, status,
  // tenant boundaries and strict field projection. Untrusted user metadata
  // must never grant paid, execution or founder permissions.
  const scoped=await listMyPublicProjects({id:accountId,clientId:'fcr-customer-browser'},reader);
  return {
    accountId,
    projects:scoped.projects,
    executionAuthorized:false as const,
    paidCapabilitiesAuthorized:false as const,
    billingEnabled:false as const,
    connectionsAuthorized:false as const,
  };
}
