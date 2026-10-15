import { describe, expect, it } from 'vitest';
import {
  assessIntroductoryPaidMonth,
  INTRODUCTORY_PAID_MONTH,
  INTRO_MONTH_REGISTERED_PRODUCTS,
  type IntroductoryMonthCandidate,
} from '../introductoryPaidMonth.js';

function eligible(overrides: Partial<IntroductoryMonthCandidate> = {}): IntroductoryMonthCandidate {
  return {
    productKey: 'founder-control-room',
    repositoryFullName: 'jussray/founder-control-room',
    brandName: 'Founder Control Room',
    stripeAccountId: INTRODUCTORY_PAID_MONTH.jussCoStripeAccountId,
    currency: 'usd',
    recurringInterval: 'month',
    recurringIntervalCount: 1,
    regularPriceCents: 1000,
    founderApprovedRenewalPrice: true,
    renewalPriceAndDateDisclosed: true,
    renewalConsentVerified: true,
    cancellationPathVerified: true,
    stripeWebhookLifecycleVerified: true,
    authorizedAdultPayerVerified: true,
    guardianBillingConsentVerified: false,
    existingSubscription: false,
    introductoryOfferPreviouslyUsed: false,
    ...overrides,
  };
}

describe('portfolio $1 paid introductory month', () => {
  it('is an immediate $1 paid first invoice, not a free trial, and cannot activate checkout from policy alone', () => {
    const outcome = assessIntroductoryPaidMonth(eligible());
    expect(outcome).toEqual({
      contract: 'juss/paid-intro-month@v1',
      firstInvoiceCents: 100,
      readyForSandboxVerification: true,
      allowLiveCheckout: false,
      couponAmountOffCents: 900,
      blockers: [],
    });
    expect(INTRODUCTORY_PAID_MONTH.offerMechanism).toBe('first_invoice_once_coupon');
    expect(INTRODUCTORY_PAID_MONTH.interval).toBe('month');
    expect(INTRODUCTORY_PAID_MONTH.preservesExistingSubscriptions).toBe(true);
    expect(INTRODUCTORY_PAID_MONTH.preservesFreeTiers).toBe(true);
  });

  it.each([
    ['direct hair key', { productKey: 'juss-beautiful-hair' }],
    ['hair repository with spoofed FCR key', { repositoryFullName: 'jussray/jussbeautifulhair-site' }],
    ['legacy hair repository', { repositoryFullName: 'jussray/Juss-beautiful-hair-' }],
    ['private hair repository', { repositoryFullName: 'jussray/jbh-private' }],
    ['hair brand with spoofed FCR key', { brandName: 'Juss Beautiful Hair' }],
    ['hair-store payment account with spoofed FCR key', { stripeAccountId: INTRODUCTORY_PAID_MONTH.hairStoreStripeAccountId }],
  ])('permanently rejects %s', (_name, overrides) => {
    const outcome = assessIntroductoryPaidMonth(eligible(overrides));
    expect(outcome.blockers).toContain('hair_store_permanently_excluded');
    expect(outcome.readyForSandboxVerification).toBe(false);
    expect(outcome.allowLiveCheckout).toBe(false);
    expect(outcome.couponAmountOffCents).toBeNull();
  });

  it('denies unknown projects and mismatched repository identities', () => {
    expect(assessIntroductoryPaidMonth(eligible({ productKey: 'future-product' })).blockers)
      .toContain('product_not_registered');
    expect(assessIntroductoryPaidMonth(eligible({ repositoryFullName: 'jussray/another-product' })).blockers)
      .toContain('product_repository_mismatch');
  });

  it('keeps all currently registered software projects sandbox-only', () => {
    expect(INTRO_MONTH_REGISTERED_PRODUCTS).toEqual(expect.arrayContaining([
      'founder-control-room', 'chief-ai-machine', 'promptos',
      'solcontinuity', 'storyengine', 'sekret-bip',
    ]));
    for (const productKey of INTRO_MONTH_REGISTERED_PRODUCTS) {
      expect(INTRODUCTORY_PAID_MONTH.liveCheckoutEnabled).toBe(false);
      expect(productKey).not.toBe('juss-beautiful-hair');
    }
  });

  it('refuses missing renewal price, disclosure, consent and webhook/cancellation evidence', () => {
    const result = assessIntroductoryPaidMonth(eligible({
      regularPriceCents: null,
      founderApprovedRenewalPrice: false,
      renewalPriceAndDateDisclosed: false,
      renewalConsentVerified: false,
      cancellationPathVerified: false,
      stripeWebhookLifecycleVerified: false,
      authorizedAdultPayerVerified: false,
    }));
    expect(result.blockers).toEqual(expect.arrayContaining([
      'approved_recurring_price_missing_or_too_low',
      'renewal_price_not_approved',
      'renewal_terms_not_disclosed',
      'renewal_consent_missing',
      'cancellation_path_unverified',
      'stripe_webhook_unverified',
      'adult_payer_unverified',
    ]));
  });

  it('cannot silently convert an existing subscriber or issue multiple $1 months', () => {
    expect(assessIntroductoryPaidMonth(eligible({ existingSubscription: true })).blockers)
      .toContain('existing_subscription_not_eligible');
    expect(assessIntroductoryPaidMonth(eligible({ introductoryOfferPreviouslyUsed: true })).blockers)
      .toContain('intro_offer_already_used_or_unknown');
  });

  it('requires guardian billing consent for a family product with a separate adult payer', () => {
    const bip = eligible({
      productKey: 'sekret-bip',
      repositoryFullName: 'jussray/Sekret-Bip',
      brandName: "Se'kret Bip",
      guardianBillingConsentVerified: false,
    });
    expect(assessIntroductoryPaidMonth(bip).blockers)
      .toContain('guardian_billing_consent_unverified');
    expect(assessIntroductoryPaidMonth({ ...bip, guardianBillingConsentVerified: true })
      .readyForSandboxVerification).toBe(true);
  });

  it('rejects a fixed day duration, non-USD currency and an unapproved $1 renewal', () => {
    const result = assessIntroductoryPaidMonth(eligible({
      currency: 'eur', recurringInterval: 'day', recurringIntervalCount: 30,
      regularPriceCents: 100,
    }));
    expect(result.blockers).toEqual(expect.arrayContaining([
      'currency_mismatch', 'not_a_monthly_subscription', 'approved_recurring_price_missing_or_too_low',
    ]));
  });
});
