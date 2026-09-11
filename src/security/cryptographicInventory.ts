import { PORTFOLIO_PROJECTS, type PortfolioProject } from '../config/portfolio.js';

export const CRYPTOGRAPHIC_INVENTORY_CONTRACT = 'juss-v10/cryptographic-inventory@v1' as const;

export type CryptographicObservationState = 'OBSERVED' | 'PROVIDER_MANAGED';
export type QuantumMigrationClass =
  | 'PUBLIC_KEY_MIGRATION_REQUIRED'
  | 'SYMMETRIC_MONITOR'
  | 'HASH_MONITOR'
  | 'PROVIDER_MANAGED_UNKNOWN';

export interface CryptographicInventoryEntry {
  id: string;
  projectSlug: string;
  purpose: string;
  primitive: string;
  algorithm: string;
  observationState: CryptographicObservationState;
  provider: string;
  migrationAuthority: string;
  quantumMigrationClass: QuantumMigrationClass;
  confidentialityHorizon: 'short-lived-auth' | 'stored-secret' | 'not-confidentiality-control' | 'provider-managed-unknown';
  sourceEvidence: string;
}

export interface CryptographicReviewRequired {
  projectSlug: string;
  reason: string;
  nextEvidence: string;
}

/**
 * Source-observed crypto boundaries only. This is an inventory of what the
 * portfolio can currently prove from repository evidence, not a claim that the
 * listed projects are quantum-safe or that no additional crypto dependencies
 * exist behind providers.
 */
export const CRYPTOGRAPHIC_INVENTORY: readonly CryptographicInventoryEntry[] = [
  {
    id: 'fcr-github-app-rs256',
    projectSlug: 'founder-control-room',
    purpose: 'Authenticate the FCR GitHub App before repository-scoped installation tokens are requested.',
    primitive: 'RSA digital signature over JWT',
    algorithm: 'RS256 / RSA-SHA256',
    observationState: 'OBSERVED',
    provider: 'GitHub protocol with FCR-held GitHub App private key',
    migrationAuthority: 'GitHub controls accepted App-auth algorithms; FCR controls its signer implementation and key material.',
    quantumMigrationClass: 'PUBLIC_KEY_MIGRATION_REQUIRED',
    confidentialityHorizon: 'not-confidentiality-control',
    sourceEvidence: 'jussray/founder-control-room:src/providers/githubAppAuth.ts',
  },
  {
    id: 'fcr-founder-session-aes256gcm',
    projectSlug: 'founder-control-room',
    purpose: 'Encrypt Supabase access and refresh credentials stored behind the opaque founder browser session.',
    primitive: 'authenticated symmetric encryption',
    algorithm: 'AES-256-GCM',
    observationState: 'OBSERVED',
    provider: 'FCR implementation; key value is held in the Cloudflare Worker secret plane',
    migrationAuthority: 'FCR controls the cipher contract and key rotation; Cloudflare controls the secret-storage substrate.',
    quantumMigrationClass: 'SYMMETRIC_MONITOR',
    confidentialityHorizon: 'stored-secret',
    sourceEvidence: 'jussray/founder-control-room:src/auth/founderSession.ts',
  },
  {
    id: 'sekret-supabase-auth-jwks',
    projectSlug: 'sekret-bip',
    purpose: 'Verify signed-in user access tokens at the Cloudflare Worker boundary.',
    primitive: 'provider-issued JWT verified from remote JWKS',
    algorithm: 'provider-selected asymmetric JWT key from Supabase JWKS; optional legacy HS256 when explicitly configured',
    observationState: 'PROVIDER_MANAGED',
    provider: 'Supabase Auth',
    migrationAuthority: 'Supabase controls asymmetric signing-key support; Se’kret Bip controls verifier acceptance and legacy-secret fallback.',
    quantumMigrationClass: 'PUBLIC_KEY_MIGRATION_REQUIRED',
    confidentialityHorizon: 'short-lived-auth',
    sourceEvidence: 'jussray/Sekret-Bip:worker/auth.ts',
  },
  {
    id: 'sekret-firebase-appcheck-rs256',
    projectSlug: 'sekret-bip',
    purpose: 'Verify Firebase App Check attestation independently from user authorization.',
    primitive: 'RSA digital signature over JWT',
    algorithm: 'RS256 / RSASSA-PKCS1-v1_5 with SHA-256',
    observationState: 'PROVIDER_MANAGED',
    provider: 'Firebase / Google',
    migrationAuthority: 'Firebase controls App Check signing-key algorithms; Se’kret Bip controls verifier allowlists and enforcement mode.',
    quantumMigrationClass: 'PUBLIC_KEY_MIGRATION_REQUIRED',
    confidentialityHorizon: 'not-confidentiality-control',
    sourceEvidence: 'jussray/Sekret-Bip:worker/firebase-app-check.ts',
  },
  {
    id: 'jbh-private-cloudflare-access-rs256',
    projectSlug: 'juss-beautiful-hair-private',
    purpose: 'Verify Cloudflare Access owner assertions before private payment/admin operations.',
    primitive: 'RSA digital signature over JWT',
    algorithm: 'RS256 / RSASSA-PKCS1-v1_5 with SHA-256',
    observationState: 'PROVIDER_MANAGED',
    provider: 'Cloudflare Access',
    migrationAuthority: 'Cloudflare controls Access signing-key algorithms; JBH private controls signature, issuer, audience, expiry, and owner-allowlist verification.',
    quantumMigrationClass: 'PUBLIC_KEY_MIGRATION_REQUIRED',
    confidentialityHorizon: 'short-lived-auth',
    sourceEvidence: 'jussray/jbh-private:admin/payment-worker/src/access.ts',
  },
  {
    id: 'storyengine-supabase-service-role',
    projectSlug: 'l99',
    purpose: 'Authenticate bounded server-side persistence writes to Supabase.',
    primitive: 'provider-managed opaque service credential over TLS',
    algorithm: 'provider-managed; not pinned by StoryEngine source',
    observationState: 'PROVIDER_MANAGED',
    provider: 'Supabase',
    migrationAuthority: 'Supabase controls credential and transport cryptography; StoryEngine controls secret scope and server-only usage.',
    quantumMigrationClass: 'PROVIDER_MANAGED_UNKNOWN',
    confidentialityHorizon: 'provider-managed-unknown',
    sourceEvidence: 'jussray/StoryEngine:runtime/companion_logger.py',
  },
  {
    id: 'untold-shopify-webhook-hmac',
    projectSlug: 'untold-stories',
    purpose: 'Authenticate Shopify order webhooks before vendor-routing work is accepted.',
    primitive: 'message authentication code',
    algorithm: 'HMAC-SHA-256',
    observationState: 'OBSERVED',
    provider: 'Shopify shared-secret webhook contract',
    migrationAuthority: 'Shopify controls the webhook contract; Untold Stories controls secret handling and verification logic.',
    quantumMigrationClass: 'SYMMETRIC_MONITOR',
    confidentialityHorizon: 'not-confidentiality-control',
    sourceEvidence: 'jussray/untold-stories-storefront:src/lib/vendorRouting.server.ts',
  },
] as const;

/**
 * Active projects whose security-relevant crypto boundary was not yet proven
 * deeply enough in this narrow source pass. These must remain visibly unknown,
 * never inferred safe from silence.
 */
export const CRYPTOGRAPHIC_REVIEW_REQUIRED: readonly CryptographicReviewRequired[] = [
  {
    projectSlug: 'juss-beautiful-hair',
    reason: 'Storefront/checkout cryptography is primarily provider-owned and no app-layer security primitive was proven in this pass.',
    nextEvidence: 'Inspect Hydrogen/Oxygen or Shopify auth/webhook paths plus current provider crypto ownership before classifying migration exposure.',
  },
  {
    projectSlug: 'chief-ai-machine',
    reason: 'Provider-routing authority exists, while the observed source pass surfaced hashing and reference material rather than a canonical runtime public-key boundary.',
    nextEvidence: 'Inspect live provider authentication, deployment credentials, and any signed runtime receipts before classifying migration exposure.',
  },
  {
    projectSlug: 'promptos',
    reason: 'PromptOS is primarily a rules/registry surface and this pass did not prove a canonical runtime authentication or signing primitive.',
    nextEvidence: 'Confirm whether any production runtime auth/signing path exists; otherwise retain provider-managed transport as an external dependency rather than inventing an app crypto layer.',
  },
] as const;

export function cryptographicInventoryForProject(projectSlug: string): readonly CryptographicInventoryEntry[] {
  return CRYPTOGRAPHIC_INVENTORY.filter((entry) => entry.projectSlug === projectSlug);
}

export function auditCryptographicInventoryCoverage(
  projects: readonly PortfolioProject[] = PORTFOLIO_PROJECTS.filter((project) => project.status === 'active'),
): {
  activeProjectCount: number;
  representedProjectCount: number;
  inventoryEntryCount: number;
  reviewRequiredProjectCount: number;
  publicKeyMigrationEntryCount: number;
  missingProjectSlugs: string[];
  overlappingProjectSlugs: string[];
} {
  const active = new Set(projects.map((project) => project.slug));
  const observed = new Set(CRYPTOGRAPHIC_INVENTORY.map((entry) => entry.projectSlug));
  const review = new Set(CRYPTOGRAPHIC_REVIEW_REQUIRED.map((entry) => entry.projectSlug));
  const represented = new Set([...observed, ...review].filter((slug) => active.has(slug)));

  return {
    activeProjectCount: active.size,
    representedProjectCount: represented.size,
    inventoryEntryCount: CRYPTOGRAPHIC_INVENTORY.length,
    reviewRequiredProjectCount: [...review].filter((slug) => active.has(slug)).length,
    publicKeyMigrationEntryCount: CRYPTOGRAPHIC_INVENTORY.filter(
      (entry) => entry.quantumMigrationClass === 'PUBLIC_KEY_MIGRATION_REQUIRED',
    ).length,
    missingProjectSlugs: [...active].filter((slug) => !represented.has(slug)).sort(),
    overlappingProjectSlugs: [...active].filter((slug) => observed.has(slug) && review.has(slug)).sort(),
  };
}
