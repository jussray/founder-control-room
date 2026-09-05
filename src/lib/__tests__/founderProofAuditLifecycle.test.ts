import { describe, expect, it } from 'vitest';
import {
  FOUNDER_PROOF_AUDIT_COMMERCE_AUTHORITY,
  evaluateFounderProofAuditLifecycle,
} from '../founderProofAuditLifecycle.js';

const FCR_SHOPIFY_IDENTITY = Object.freeze({
  ...FOUNDER_PROOF_AUDIT_COMMERCE_AUTHORITY,
});

function base(overrides: Record<string, any> = {}) {
  const input = {
    mode: 'DRY_RUN',
    auditId: 'proof-audit-case-001',
    scope: {
      targetType: 'WEBSITE',
      targetRef: 'https://example.test',
      objective: 'Verify one bounded production claim without mutating production.',
      authorizedEvidenceRefs: ['github://example/repo@abc123'],
      productionMutationAuthorizationRef: null,
    },
    commerce: {
      status: 'NOT_EXECUTED',
      source: 'none',
      evidenceRef: null,
      storeIdentity: null,
    },
    intake: {
      status: 'VALIDATED',
      evidenceRef: 'fcr://proof-audit/intake/001',
    },
    audit: {
      status: 'COMPLETED',
      evidenceRef: 'fcr://proof-audit/audit/001',
    },
    delivery: {
      status: 'SIMULATED',
      evidenceRef: 'fcr://proof-audit/delivery-sim/001',
      customerEvidenceRef: null,
    },
  };

  const commerceOverride = overrides.commerce || {};

  return {
    ...input,
    ...overrides,
    scope: { ...input.scope, ...(overrides.scope || {}) },
    commerce: {
      ...input.commerce,
      ...(commerceOverride.source === 'shopify' ? { storeIdentity: FCR_SHOPIFY_IDENTITY } : {}),
      ...commerceOverride,
    },
    intake: { ...input.intake, ...(overrides.intake || {}) },
    audit: { ...input.audit, ...(overrides.audit || {}) },
    delivery: { ...input.delivery, ...(overrides.delivery || {}) },
  } as any;
}

describe('Founder Proof Audit lifecycle truth contract', () => {
  it('verifies the dry-run path without promoting simulation into delivery outcome truth', () => {
    const receipt = evaluateFounderProofAuditLifecycle(base());

    expect(receipt.disposition).toBe('DRY_RUN_VERIFIED');
    expect(receipt.highestTruthPlane).toBe('AUDIT_EXECUTION');
    expect(receipt.claims.commerceExecutionObserved).toBe(false);
    expect(receipt.claims.commercePaymentVerified).toBe(false);
    expect(receipt.claims.commerceStoreAuthorityVerified).toBe(false);
    expect(receipt.claims.auditExecutionVerified).toBe(true);
    expect(receipt.claims.deliverySimulationVerified).toBe(true);
    expect(receipt.claims.deliveryOutcomeVerified).toBe(false);
    expect(receipt.claims.customerValueOutcomeVerified).toBe(false);
    expect(receipt.recognizedOutcome).toMatch(/delivery boundary was simulated/i);
    expect(receipt.recognizedOutcome).toMatch(/no Shopify payment or customer delivery occurred/i);
  });

  it('forbids a dry run from claiming real customer delivery', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      delivery: { status: 'DELIVERED', evidenceRef: 'fcr://delivery/001' },
    }))).toThrow(/DRY_RUN may not claim customer delivery/);
  });

  it('preserves Shopify order creation as commerce execution without upgrading it to payment truth', () => {
    const receipt = evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'ORDER_CREATED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/1000',
      },
      intake: { status: 'VALIDATED', evidenceRef: 'fcr://proof-audit/intake/1000' },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }));

    expect(receipt.disposition).toBe('HOLD');
    expect(receipt.highestTruthPlane).toBe('COMMERCE_EXECUTION');
    expect(receipt.claims.commerceExecutionObserved).toBe(true);
    expect(receipt.claims.commercePaymentVerified).toBe(false);
    expect(receipt.claims.commerceStoreAuthorityVerified).toBe(true);
    expect(receipt.claims.auditExecutionVerified).toBe(false);
    expect(receipt.recognizedOutcome).toMatch(/order creation.*FCR commerce authority/i);
    expect(receipt.recognizedOutcome).toMatch(/payment is not verified/i);
  });

  it('keeps verified Shopify payment separate from audit delivery truth', () => {
    const receipt = evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/1001/payment',
      },
      intake: { status: 'MISSING', evidenceRef: null },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }));

    expect(receipt.highestTruthPlane).toBe('COMMERCE_EXECUTION');
    expect(receipt.claims.commerceExecutionObserved).toBe(true);
    expect(receipt.claims.commercePaymentVerified).toBe(true);
    expect(receipt.claims.commerceStoreAuthorityVerified).toBe(true);
    expect(receipt.claims.auditExecutionVerified).toBe(false);
    expect(receipt.claims.deliverySimulationVerified).toBe(false);
    expect(receipt.claims.deliveryOutcomeVerified).toBe(false);
    expect(receipt.recognizedOutcome).toMatch(/delivery are not proven/i);
  });

  it('fails closed if Shopify commerce omits the canonical FCR store identity', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/wrong-store/payment',
        storeIdentity: null,
      },
      intake: { status: 'MISSING', evidenceRef: null },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/requires an explicit storeIdentity/);
  });

  it('rejects JBH custom-domain evidence for an FCR audit', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/jbh/payment',
        storeIdentity: {
          ...FCR_SHOPIFY_IDENTITY,
          customDomain: 'jussbeautifulhair.com',
        },
      },
      intake: { status: 'MISSING', evidenceRef: null },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/custom-domain authority mismatch/);
  });

  it('rejects JBH permanent Shopify identity for an FCR audit', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/jbh/payment',
        storeIdentity: {
          ...FCR_SHOPIFY_IDENTITY,
          shopDomain: '8qp1z2-az.myshopify.com',
        },
      },
      intake: { status: 'MISSING', evidenceRef: null },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/permanent-shop authority mismatch/);
  });

  it('rejects a cross-project Shopify identity even when both domains look plausible', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/cross-project/payment',
        storeIdentity: {
          ...FCR_SHOPIFY_IDENTITY,
          project: 'juss-beautiful-hair',
        },
      },
      intake: { status: 'MISSING', evidenceRef: null },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/project authority mismatch/);
  });

  it('fails closed if a live audit starts before Shopify payment is verified', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'ORDER_CREATED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/1001',
      },
      audit: { status: 'IN_PROGRESS', evidenceRef: 'fcr://audit/1001/start' },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/requires independently verified Shopify payment/);
  });

  it('forbids delivery claims before audit completion', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/1002/payment',
      },
      audit: { status: 'IN_PROGRESS', evidenceRef: 'fcr://audit/1002/start' },
      delivery: { status: 'DELIVERED', evidenceRef: 'fcr://delivery/1002', customerEvidenceRef: null },
    }))).toThrow(/delivery requires a completed audit/);
  });

  it('requires independent customer evidence for acknowledgement', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/1003/payment',
      },
      delivery: {
        status: 'ACKNOWLEDGED',
        evidenceRef: 'fcr://delivery/1003',
        customerEvidenceRef: null,
      },
    }))).toThrow(/requires independent customer evidence/);
  });

  it('does not upgrade acknowledgement into customer-value proof', () => {
    const receipt = evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/1004/payment',
      },
      delivery: {
        status: 'ACKNOWLEDGED',
        evidenceRef: 'fcr://delivery/1004',
        customerEvidenceRef: 'customer://ack/1004',
      },
    }));

    expect(receipt.disposition).toBe('DELIVERY_ACKNOWLEDGED');
    expect(receipt.claims.deliveryOutcomeVerified).toBe(true);
    expect(receipt.claims.customerReceiptAcknowledged).toBe(true);
    expect(receipt.claims.customerValueOutcomeVerified).toBe(false);
    expect(receipt.recognizedOutcome).toMatch(/customer value or business outcome is not proven/i);
  });

  it('records separate production authorization without granting mutation authority', () => {
    const receipt = evaluateFounderProofAuditLifecycle(base({
      scope: { productionMutationAuthorizationRef: 'approval://customer/repair-42' },
    }));

    expect(receipt.authority.productionMutationAuthorizationRecorded).toBe(true);
    expect(receipt.authority.canMutateProduction).toBe(false);
    expect(receipt.authority.canBypassAccessControls).toBe(false);
    expect(receipt.authority.canExpandScope).toBe(false);
  });

  it('requires Shopify to certify order and payment execution', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'none',
        evidenceRef: 'fcr://claimed-payment/1005',
      },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/must be certified by Shopify/);
  });

  it('rejects unknown lifecycle enum values instead of silently degrading them', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({ mode: 'MAYBE' }))).toThrow(/mode is invalid/);
    expect(() => evaluateFounderProofAuditLifecycle(base({
      commerce: { status: 'MONEYISH', source: 'shopify', evidenceRef: 'shopify://orders/1006' },
    }))).toThrow(/commerce.status is invalid/);
  });

  it('rejects stale evidence attached to states that claim nothing happened', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      commerce: { status: 'NOT_EXECUTED', source: 'none', evidenceRef: 'shopify://stale/order' },
    }))).toThrow(/NOT_EXECUTED commerce must not carry evidenceRef/);

    expect(() => evaluateFounderProofAuditLifecycle(base({
      commerce: { status: 'NOT_EXECUTED', source: 'none', storeIdentity: FCR_SHOPIFY_IDENTITY },
    }))).toThrow(/NOT_EXECUTED commerce must not carry storeIdentity/);

    expect(() => evaluateFounderProofAuditLifecycle(base({
      intake: { status: 'MISSING', evidenceRef: 'fcr://stale/intake' },
      audit: { status: 'NOT_STARTED', evidenceRef: null },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/MISSING intake must not carry evidenceRef/);

    expect(() => evaluateFounderProofAuditLifecycle(base({
      audit: { status: 'NOT_STARTED', evidenceRef: 'fcr://stale/audit' },
      delivery: { status: 'NOT_DELIVERED', evidenceRef: null, customerEvidenceRef: null },
    }))).toThrow(/NOT_STARTED audit must not carry evidenceRef/);

    expect(() => evaluateFounderProofAuditLifecycle(base({
      delivery: { status: 'NOT_DELIVERED', evidenceRef: 'fcr://stale/delivery', customerEvidenceRef: null },
    }))).toThrow(/NOT_DELIVERED delivery must not carry evidenceRef/);
  });

  it('allows customer evidence only on an acknowledged delivery', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      mode: 'LIVE',
      commerce: {
        status: 'PAYMENT_VERIFIED',
        source: 'shopify',
        evidenceRef: 'shopify://orders/1007/payment',
      },
      delivery: {
        status: 'DELIVERED',
        evidenceRef: 'fcr://delivery/1007',
        customerEvidenceRef: 'customer://stale/1007',
      },
    }))).toThrow(/customerEvidenceRef is only valid for ACKNOWLEDGED delivery/);
  });

  it('rejects oversized identities and evidence references instead of silently truncating them', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      auditId: `a${'b'.repeat(160)}`,
    }))).toThrow(/auditId exceeds 160 characters/);

    expect(() => evaluateFounderProofAuditLifecycle(base({
      scope: { authorizedEvidenceRefs: [`github://${'x'.repeat(1200)}`] },
    }))).toThrow(/authorizedEvidenceRefs\[0\] exceeds 1200 characters/);
  });

  it('rejects blank or duplicate authorized evidence references', () => {
    expect(() => evaluateFounderProofAuditLifecycle(base({
      scope: { authorizedEvidenceRefs: ['github://one', '   '] },
    }))).toThrow(/only non-empty string references/);

    expect(() => evaluateFounderProofAuditLifecycle(base({
      scope: { authorizedEvidenceRefs: ['github://one', 'github://one'] },
    }))).toThrow(/must not contain duplicate references/);
  });
});