/**
 * Portfolio-wide $1 introductory PAID month policy.
 *
 * This module is a fail-closed eligibility guard, NOT a checkout endpoint or
 * Stripe authorization. Never call it using client-asserted identity or
 * payment facts. The owning product backend must verify all input from its
 * own product registry, authenticated payer, and Stripe.
 *
 * Juss Beautiful Hair is categorically excluded, including its own Stripe
 * account, domains, repos, physical catalog, subscriptions, and checkout.
 */
export const INTRODUCTORY_PAID_MONTH = Object.freeze({
  contract: 'juss/paid-intro-month@v1',
  currency: 'usd',
  firstInvoiceCents: 100,
  interval: 'month',
  intervalCount: 1,
  jussCoStripeAccountId: 'acct_1U4xNyRs4gw4sfJH',
  hairStoreStripeAccountId: 'acct_1TfbELRp7J40bCrl',
  liveCheckoutEnabled: false,
  offerMechanism: 'first_invoice_once_coupon',
  preservesExistingSubscriptions: true,
  preservesFreeTiers: true,
} as const);

const ELIGIBLE_PRODUCT_REPOSITORIES: Readonly<Record<string, string>> = Object.freeze({
  'founder-control-room': 'jussray/founder-control-room',
  'chief-ai-machine': 'jussray/chief-ai-machine',
  'promptos': 'jussray/promptos',
  'solcontinuity': 'jussray/solcontinuity',
  'storyengine': 'jussray/StoryEngine',
  'sekret-bip': 'jussray/Sekret-Bip',
});

/** Registration is not a commercial launch approval or a recurring Price. */
export const INTRO_MONTH_REGISTERED_PRODUCTS = Object.freeze(
  Object.keys(ELIGIBLE_PRODUCT_REPOSITORIES),
);

const HAIR_REPOSITORIES = new Set([
  'jussray/jussbeautifulhair-site',
  'jussray/jussbeautifulhair1',
  'jussray/juss-beautiful-hair-',
  'jussray/jbh-private',
]);

const HAIR_PRODUCT_IDENTIFIERS = new Set([
  'juss-beautiful-hair', 'jussbeautifulhair', 'jbh',
  'juss-ray-beauty-co', 'juss ray beauty co',
]);

const normalize = (value: string): string => value.trim().toLowerCase();

function isHairStoreIdentity(input: IntroductoryMonthCandidate): boolean {
  const repo = normalize(input.repositoryFullName);
  const product = normalize(input.productKey);
  const brand = normalize(input.brandName).replace(/[^a-z0-9]/g, '');
  return input.stripeAccountId === INTRODUCTORY_PAID_MONTH.hairStoreStripeAccountId
    || HAIR_REPOSITORIES.has(repo)
    || repo.includes('jussbeautifulhair')
    || repo.includes('juss-beautiful-hair')
    || repo.startsWith('jussray/jbh-')
    || HAIR_PRODUCT_IDENTIFIERS.has(product)
    || brand === 'jussbeautifulhair'
    || brand === 'jussraybeautyco'
    || brand === 'jbh';
}

export interface IntroductoryMonthCandidate {
  /** Server-resolved canonical product identity; never accept client strings. */
  productKey: string;
  repositoryFullName: string;
  brandName: string;
  stripeAccountId: string;
  currency: string;
  recurringInterval: string;
  recurringIntervalCount: number;
  /** The existing founder-approved recurring Price, NOT the introductory $1. */
  regularPriceCents: number | null;
  founderApprovedRenewalPrice: boolean;
  renewalPriceAndDateDisclosed: boolean;
  renewalConsentVerified: boolean;
  cancellationPathVerified: boolean;
  stripeWebhookLifecycleVerified: boolean;
  authorizedAdultPayerVerified: boolean;
  /** Must be verified by guardian/parent-owned billing for Se'kret Bip. */
  guardianBillingConsentVerified: boolean;
  existingSubscription: boolean;
  introductoryOfferPreviouslyUsed: boolean;
}

export interface IntroductoryMonthAssessment {
  contract: typeof INTRODUCTORY_PAID_MONTH.contract;
  firstInvoiceCents: typeof INTRODUCTORY_PAID_MONTH.firstInvoiceCents;
  /** Candidate has all policy prerequisites; it is NOT live checkout authority. */
  readyForSandboxVerification: boolean;
  /** Always false until a separately gated production activation changes policy. */
  allowLiveCheckout: boolean;
  couponAmountOffCents: number | null;
  blockers: string[];
}

/**
 * Enforce this on the SERVER before creating a subscription Checkout Session.
 * Missing facts deny eligibility. Never switch a customer's existing plan or
 * discount physical merchandise. Billing webhooks remain mandatory.
 */
export function assessIntroductoryPaidMonth(
  input: IntroductoryMonthCandidate,
): IntroductoryMonthAssessment {
  const blockers: string[] = [];
  const productKey = normalize(input.productKey);
  const actualRepo = normalize(input.repositoryFullName);
  // Own-key lookup only: inherited keys such as 'constructor' or '__proto__'
  // must deny as unregistered instead of throwing from the policy guard.
  const registeredRepo = Object.hasOwn(ELIGIBLE_PRODUCT_REPOSITORIES, productKey)
    ? ELIGIBLE_PRODUCT_REPOSITORIES[productKey]
    : undefined;

  // Deny hair store first, even if the caller spoofs another product key.
  if (isHairStoreIdentity(input)) blockers.push('hair_store_permanently_excluded');
  if (!registeredRepo) blockers.push('product_not_registered');
  else if (actualRepo !== normalize(registeredRepo)) blockers.push('product_repository_mismatch');
  if (!input.brandName.trim()) blockers.push('brand_identity_missing');
  if (input.stripeAccountId !== INTRODUCTORY_PAID_MONTH.jussCoStripeAccountId) {
    blockers.push('wrong_stripe_account');
  }
  if (input.currency !== INTRODUCTORY_PAID_MONTH.currency) blockers.push('currency_mismatch');
  if (input.recurringInterval !== 'month' || input.recurringIntervalCount !== 1) {
    blockers.push('not_a_monthly_subscription');
  }
  if (!Number.isSafeInteger(input.regularPriceCents) ||
    (input.regularPriceCents ?? 0) <= INTRODUCTORY_PAID_MONTH.firstInvoiceCents) {
    blockers.push('approved_recurring_price_missing_or_too_low');
  }
  if (input.founderApprovedRenewalPrice !== true) blockers.push('renewal_price_not_approved');
  if (input.renewalPriceAndDateDisclosed !== true) blockers.push('renewal_terms_not_disclosed');
  if (input.renewalConsentVerified !== true) blockers.push('renewal_consent_missing');
  if (input.cancellationPathVerified !== true) blockers.push('cancellation_path_unverified');
  if (input.stripeWebhookLifecycleVerified !== true) blockers.push('stripe_webhook_unverified');
  if (input.authorizedAdultPayerVerified !== true) blockers.push('adult_payer_unverified');
  if (productKey === 'sekret-bip' && input.guardianBillingConsentVerified !== true) {
    blockers.push('guardian_billing_consent_unverified');
  }
  if (input.existingSubscription !== false) blockers.push('existing_subscription_not_eligible');
  if (input.introductoryOfferPreviouslyUsed !== false) blockers.push('intro_offer_already_used_or_unknown');

  const readyForSandboxVerification = blockers.length === 0;
  const couponAmountOffCents = readyForSandboxVerification
    ? input.regularPriceCents! - INTRODUCTORY_PAID_MONTH.firstInvoiceCents
    : null;

  return {
    contract: INTRODUCTORY_PAID_MONTH.contract,
    firstInvoiceCents: INTRODUCTORY_PAID_MONTH.firstInvoiceCents,
    readyForSandboxVerification,
    allowLiveCheckout: readyForSandboxVerification && INTRODUCTORY_PAID_MONTH.liveCheckoutEnabled,
    couponAmountOffCents,
    blockers,
  };
}
