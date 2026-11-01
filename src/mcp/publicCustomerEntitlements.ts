/**
 * Pure service-side authorization decision for future paid customer features.
 * NOT an activation hook, payment checkout, or a client-editable plan.
 * Callers must verify a provider webhook and persist its receipt via a
 * separately approved service-only workflow before this can ever grant access.
 */
import { membershipsFor, PublicMcpAccessDenied, type PublicMcpTenantReader } from './publicTenantAccess.js';
import { verifiedCustomerId } from './publicCustomerWorkspace.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CustomerEntitlementRecord {
  tenantId: string;
  plan: 'explorer' | 'solo' | 'team';
  status: 'inactive' | 'active' | 'suspended' | 'canceled';
  verifiedReceiptId: string | null;
  validUntil: string | null;
}
export interface VerifiedBillingReceipt {
  id: string;
  tenantId: string;
  signatureVerifiedAt: string;
  provider: string;
  providerEventId: string;
}
export interface CustomerEntitlementReader {
  getEntitlement(tenantId: string): Promise<CustomerEntitlementRecord | null>;
  getVerifiedReceipt(receiptId: string, tenantId: string): Promise<VerifiedBillingReceipt | null>;
}

export async function evaluateCustomerPaidEntitlement(
  verifiedIdentity: unknown,
  tenantId: string,
  membershipReader: PublicMcpTenantReader,
  entitlementReader: CustomerEntitlementReader,
  options: { activated: boolean; now: Date },
) {
  const accountId = verifiedCustomerId(verifiedIdentity);
  if (!UUID.test(tenantId)) throw new PublicMcpAccessDenied();
  const permittedTenants = membershipsFor(
    { id: accountId, clientId: 'fcr-customer-browser' },
    await membershipReader.listMemberships(accountId),
  );
  if (!permittedTenants.includes(tenantId)) throw new PublicMcpAccessDenied();
  const denied = { tenantId, effectivePlan: 'explorer' as const, paidCapabilitiesAuthorized: false as const };
  // A fail-closed environment guard is independent of plan/metadata/receipts.
  if (options.activated !== true) return denied;
  if (!(options.now instanceof Date) || !Number.isFinite(options.now.getTime())) return denied;

  const entitlement = await entitlementReader.getEntitlement(tenantId);
  if (!entitlement) return denied;
  if (entitlement.tenantId !== tenantId) throw new PublicMcpAccessDenied();
  if (!['solo', 'team'].includes(entitlement.plan) || entitlement.status !== 'active'
    || !entitlement.validUntil || !entitlement.verifiedReceiptId
    || !UUID.test(entitlement.verifiedReceiptId)) return denied;

  const expiry = Date.parse(entitlement.validUntil);
  if (!Number.isFinite(expiry) || expiry <= options.now.getTime()) return denied;
  const receipt = await entitlementReader.getVerifiedReceipt(entitlement.verifiedReceiptId, tenantId);
  if (!receipt || receipt.id !== entitlement.verifiedReceiptId || receipt.tenantId !== tenantId
    || !receipt.provider.trim() || !receipt.providerEventId.trim()) return denied;
  const verifiedAt = Date.parse(receipt.signatureVerifiedAt);
  if (!Number.isFinite(verifiedAt) || verifiedAt > options.now.getTime()) return denied;
  return { tenantId, effectivePlan: entitlement.plan, paidCapabilitiesAuthorized: true as const };
}
