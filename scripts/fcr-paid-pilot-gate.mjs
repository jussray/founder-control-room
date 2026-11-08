/**
 * Non-chargeable FCR pilot gate. Pure decision logic; does not call payment
 * providers, write receipts, or grant production authority.
 *
 * Fails closed: caller-supplied delivery fields are never sufficient to return
 * allowed: true. Allowing requires a server-owned, independent delivery verifier,
 * which is not wired in this module.
 */
export function assessPilotExecution(input) {
  if (!input || typeof input !== 'object') throw new TypeError('pilot input required');
  const { mode, authorized, executionId, delivery } = input;
  if (mode !== 'sandbox') return { allowed: false, reason: 'SANDBOX_ONLY' };
  if (authorized !== true) return { allowed: false, reason: 'AUTHORIZATION_REQUIRED' };
  if (typeof executionId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(executionId)) {
    return { allowed: false, reason: 'INVALID_EXECUTION_ID' };
  }
  if (input.chargeRequested === true || input.paymentIntentId || input.customerPaymentMethod) {
    return { allowed: false, reason: 'CHARGE_NOT_ALLOWED' };
  }
  if (!delivery || delivery.executionId !== executionId || delivery.status !== 'completed' ||
      typeof delivery.artifactDigest !== 'string' || !/^[a-f0-9]{64}$/.test(delivery.artifactDigest)) {
    return { allowed: false, reason: 'DELIVERY_NOT_PROVEN' };
  }
  return {
    allowed: false,
    reason: 'DELIVERY_UNVERIFIED',
    candidate: Object.freeze({
      kind: 'fcr_non_chargeable_pilot_candidate',
      executionId,
      artifactDigest: delivery.artifactDigest,
      paymentStatus: 'not_charged',
      productionAuthorized: false,
      evidenceOrigin: 'caller_supplied_unverified',
      deliveryVerified: false,
      independentlyVerified: false
    })
  };
}
