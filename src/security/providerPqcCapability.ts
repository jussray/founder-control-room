export const PROVIDER_PQC_EVIDENCE_CONTRACT = 'juss-v10/provider-pqc-evidence@v1' as const;

export type ProviderPqcCapabilityState = 'CURRENT' | 'PLANNED' | 'UNSUPPORTED' | 'UNKNOWN';
export type ProviderPqcPlane = 'application-signature' | 'transport-key-agreement' | 'transport-signature' | 'provider-roadmap';

export interface ProviderPqcEvidenceSource {
  title: string;
  url: string;
}

export interface ProviderPqcCapabilityEntry {
  id: string;
  provider: string;
  surface: string;
  projectSlugs: readonly string[];
  plane: ProviderPqcPlane;
  state: ProviderPqcCapabilityState;
  currentContract: string;
  pqcEvidence: string;
  providerTarget: string;
  migrationAuthority: string;
  requiredRuntimeEvidenceBeforeChange: string;
  sources: readonly ProviderPqcEvidenceSource[];
  observedOn: string;
}

export const PROVIDER_PQC_CURRENT_LEASE_DAYS = 7;

/**
 * Official-provider documentation snapshot for cryptographic migration planning.
 *
 * These entries describe documented provider capability, not runtime negotiation,
 * project configuration, or permission to rotate keys. CURRENT means the provider
 * documentation was revalidated inside the bounded evidence lease; a project still
 * needs claim-appropriate runtime evidence before FCR may describe that protection
 * as active for the project.
 */
export const PROVIDER_PQC_CAPABILITIES: readonly ProviderPqcCapabilityEntry[] = [
  {
    id: 'github-app-jwt-signature',
    provider: 'GitHub',
    surface: 'GitHub App JWT signature',
    projectSlugs: ['founder-control-room'],
    plane: 'application-signature',
    state: 'UNSUPPORTED',
    currentContract: 'GitHub App authentication JWTs must be signed with RS256.',
    pqcEvidence: 'The current GitHub App JWT contract documents RS256 only; no post-quantum App JWT signing algorithm is documented in this surface.',
    providerTarget: 'No GitHub App JWT post-quantum migration date is documented in the authoritative source used by this pass.',
    migrationAuthority: 'GitHub must first accept a post-quantum App-auth signature algorithm; FCR can only migrate its signer after that provider contract changes.',
    requiredRuntimeEvidenceBeforeChange: 'Fresh GitHub App auth documentation allowing the new algorithm, compatible SDK/runtime support, exact-head signer tests, and a successful provider authentication receipt.',
    sources: [
      {
        title: 'GitHub Docs — Generating a JSON Web Token (JWT) for a GitHub App',
        url: 'https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'github-public-tls',
    provider: 'GitHub',
    surface: 'GitHub public TLS transport',
    projectSlugs: ['founder-control-room'],
    plane: 'transport-key-agreement',
    state: 'UNKNOWN',
    currentContract: 'FCR reaches GitHub over HTTPS, but this evidence pass did not find an authoritative GitHub PQC transport contract tied to that path.',
    pqcEvidence: 'No provider-specific post-quantum TLS claim is made from absence of documentation.',
    providerTarget: 'UNKNOWN for this specific transport surface.',
    migrationAuthority: 'GitHub owns its public TLS stack; FCR owns client compatibility and can observe negotiated transport when suitable evidence is available.',
    requiredRuntimeEvidenceBeforeChange: 'Official GitHub PQC/TLS documentation plus a claim-appropriate handshake or provider receipt from the actual FCR-to-GitHub path.',
    sources: [
      {
        title: 'GitHub Docs — GitHub App JWT authentication contract',
        url: 'https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'supabase-auth-jwt-signature',
    provider: 'Supabase',
    surface: 'Supabase Auth JWT signing keys',
    projectSlugs: ['sekret-bip'],
    plane: 'application-signature',
    state: 'UNSUPPORTED',
    currentContract: 'Supabase currently documents ES256 and RS256 asymmetric signing keys plus HS256 shared-secret signing; EdDSA is listed as coming soon.',
    pqcEvidence: 'No NIST post-quantum signature algorithm is offered by the documented Auth signing-key choices.',
    providerTarget: 'No Supabase Auth post-quantum signing date is documented in the authoritative source used by this pass.',
    migrationAuthority: 'Supabase controls supported hosted Auth signing algorithms; Se’kret Bip controls verifier acceptance, JWKS handling, and retirement of legacy fallback.',
    requiredRuntimeEvidenceBeforeChange: 'Supabase documentation and CLI/dashboard support for a post-quantum signing algorithm, project JWKS advertising that algorithm, verifier support, bounded rotation rehearsal, and exact runtime token verification proof.',
    sources: [
      {
        title: 'Supabase Docs — JWT Signing Keys',
        url: 'https://supabase.com/docs/guides/auth/signing-keys',
      },
      {
        title: 'Supabase CLI — gen signing-key supported algorithms',
        url: 'https://supabase.com/docs/reference/cli/supabase-auth',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'supabase-public-tls',
    provider: 'Supabase',
    surface: 'Supabase hosted API TLS transport',
    projectSlugs: ['sekret-bip', 'l99'],
    plane: 'transport-key-agreement',
    state: 'UNKNOWN',
    currentContract: 'Hosted Supabase APIs use TLS, but this evidence pass did not find an authoritative Supabase post-quantum TLS commitment for project API endpoints.',
    pqcEvidence: 'No PQC transport state is inferred from hosting vendors, CDN topology, browser behavior, or unrelated provider roadmaps.',
    providerTarget: 'UNKNOWN for hosted Supabase project transport.',
    migrationAuthority: 'Supabase owns hosted transport cryptography; each project owns client compatibility and runtime verification of any future negotiated PQC path.',
    requiredRuntimeEvidenceBeforeChange: 'Official Supabase PQC transport documentation and claim-appropriate handshake/provider evidence from the actual project endpoint.',
    sources: [
      {
        title: 'Supabase Docs — JWT Signing Keys',
        url: 'https://supabase.com/docs/guides/auth/signing-keys',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'firebase-app-check-jwt-signature',
    provider: 'Firebase / Google',
    surface: 'Firebase App Check token signature',
    projectSlugs: ['sekret-bip'],
    plane: 'application-signature',
    state: 'UNSUPPORTED',
    currentContract: 'Firebase custom-backend verification requires App Check token headers to use RS256 and validates keys from the App Check JWKS endpoint.',
    pqcEvidence: 'The App Check token signature itself remains classical even though broader Google infrastructure is adopting PQC.',
    providerTarget: 'Google targets quantum-safe identity and access broadly by 2028, but no Firebase App Check-specific post-quantum token-signature date is documented.',
    migrationAuthority: 'Firebase controls App Check token signing; Se’kret Bip controls its verifier allowlist and may only accept a new algorithm after Firebase documents and serves it.',
    requiredRuntimeEvidenceBeforeChange: 'Firebase documentation allowing a new token algorithm, JWKS carrying compatible keys, verifier support, exact-head negative/positive token tests, and live token verification evidence.',
    sources: [
      {
        title: 'Firebase Docs — Verify App Check tokens from a custom backend',
        url: 'https://firebase.google.com/docs/app-check/custom-resource-backend',
      },
      {
        title: 'Google Cloud — Post-quantum cryptography roadmap',
        url: 'https://cloud.google.com/blog/products/identity-security/pqc-in-plaintext-google-clouds-post-quantum-cryptography-roadmap',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'google-api-tls-key-agreement',
    provider: 'Google Cloud',
    surface: 'google.com and *.googleapis.com API TLS key agreement',
    projectSlugs: ['sekret-bip'],
    plane: 'transport-key-agreement',
    state: 'CURRENT',
    currentContract: 'Google Cloud documents hybrid NIST-standard ML-KEM key exchange on google.com and *.googleapis.com API endpoints.',
    pqcEvidence: 'The provider reports quantum-safe key exchange available on these API endpoints; this protects transport confidentiality when the client path negotiates the supported hybrid mechanism.',
    providerTarget: 'Google Cloud targets broad post-quantum migration by 2029, with identity/access milestones targeted by 2028.',
    migrationAuthority: 'Google controls endpoint TLS capability; the calling runtime controls client support and must prove that the real path negotiates the expected protection before FCR claims runtime PQC.',
    requiredRuntimeEvidenceBeforeChange: 'A claim-appropriate provider or handshake receipt showing the actual Firebase/Google API path negotiated X25519MLKEM768 or equivalent documented hybrid protection.',
    sources: [
      {
        title: 'Google Cloud — Post-quantum cryptography roadmap',
        url: 'https://cloud.google.com/blog/products/identity-security/pqc-in-plaintext-google-clouds-post-quantum-cryptography-roadmap',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'google-identity-signature-roadmap',
    provider: 'Google Cloud',
    surface: 'Google identity and access quantum-safe authentication roadmap',
    projectSlugs: ['sekret-bip'],
    plane: 'provider-roadmap',
    state: 'PLANNED',
    currentContract: 'Google documents a roadmap to make identity and access mechanisms resistant to quantum forgery.',
    pqcEvidence: 'The roadmap targets Cloud IAM and infrastructure-wide quantum-safe authentication during 2027–2028, but this is not proof that Firebase App Check JWT signatures have migrated.',
    providerTarget: 'Identity and access milestone target: end of 2028; broader Google Cloud PQC migration target: 2029.',
    migrationAuthority: 'Google owns the provider migration; applications must wait for service-specific contracts and then update validators without broadening trust.',
    requiredRuntimeEvidenceBeforeChange: 'Firebase/App Check-specific provider documentation, supported token algorithms/JWKS, exact-head verifier compatibility, and live provider proof.',
    sources: [
      {
        title: 'Google Cloud — Post-quantum cryptography roadmap',
        url: 'https://cloud.google.com/blog/products/identity-security/pqc-in-plaintext-google-clouds-post-quantum-cryptography-roadmap',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'cloudflare-access-jwt-signature',
    provider: 'Cloudflare',
    surface: 'Cloudflare Access application-token signature',
    projectSlugs: ['juss-beautiful-hair-private'],
    plane: 'application-signature',
    state: 'UNSUPPORTED',
    currentContract: 'Cloudflare Access application tokens are documented as RS256-signed JWTs.',
    pqcEvidence: 'Cloudflare has PQC transport and origin-signature capabilities, but the Access application-token contract used by JBH private is still RS256.',
    providerTarget: 'Cloudflare targets full post-quantum security across its product suite by 2029; no Access JWT-specific ML-DSA date is documented here.',
    migrationAuthority: 'Cloudflare controls Access token signing; JBH private controls its verifier and must not accept a new algorithm before the provider contract changes.',
    requiredRuntimeEvidenceBeforeChange: 'Cloudflare Access documentation and JWKS proving a new supported token-signature algorithm, verifier compatibility tests, and a live Access token receipt.',
    sources: [
      {
        title: 'Cloudflare One — Application token',
        url: 'https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/',
      },
      {
        title: 'Cloudflare SSL/TLS — PQC in Cloudflare products',
        url: 'https://developers.cloudflare.com/ssl/post-quantum-cryptography/pqc-cloudflare-products/',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'cloudflare-edge-tls-key-agreement',
    provider: 'Cloudflare',
    surface: 'Visitor-to-Cloudflare TLS 1.3 key agreement',
    projectSlugs: ['founder-control-room', 'juss-beautiful-hair-private'],
    plane: 'transport-key-agreement',
    state: 'CURRENT',
    currentContract: 'Cloudflare documents X25519MLKEM768 hybrid key agreement for inbound TLS 1.3 across proxied websites, Workers, Pages, APIs, and Access self-hosted applications.',
    pqcEvidence: 'The provider capability is deployed, while end-to-end protection still depends on a compatible client actually negotiating the hybrid group.',
    providerTarget: 'Cloudflare targets full post-quantum security across its product suite by 2029.',
    migrationAuthority: 'Cloudflare controls edge support; clients control negotiation. FCR must keep provider capability separate from runtime proof for a particular browser or API request.',
    requiredRuntimeEvidenceBeforeChange: 'Handshake or provider evidence from the actual production hostname and client path showing X25519MLKEM768 negotiation; no application-key change is required merely because the edge supports it.',
    sources: [
      {
        title: 'Cloudflare SSL/TLS — Post-quantum cryptography',
        url: 'https://developers.cloudflare.com/ssl/post-quantum-cryptography/',
      },
      {
        title: 'Cloudflare SSL/TLS — PQC in Cloudflare products',
        url: 'https://developers.cloudflare.com/ssl/post-quantum-cryptography/pqc-cloudflare-products/',
      },
    ],
    observedOn: '2026-09-10',
  },
  {
    id: 'cloudflare-visitor-tls-signatures',
    provider: 'Cloudflare',
    surface: 'Visitor-to-Cloudflare TLS authentication signatures',
    projectSlugs: ['founder-control-room', 'juss-beautiful-hair-private'],
    plane: 'transport-signature',
    state: 'PLANNED',
    currentContract: 'Cloudflare documents inbound TLS post-quantum signatures as planned via Merkle Tree Certificates.',
    pqcEvidence: 'Do not infer quantum-safe authentication merely from the currently deployed ML-KEM key agreement.',
    providerTarget: 'Cloudflare product-suite target: 2029.',
    migrationAuthority: 'Cloudflare and the Web PKI ecosystem own the public-certificate migration; applications own compatibility and evidence of the certificate chain actually served.',
    requiredRuntimeEvidenceBeforeChange: 'Provider status showing the signature capability is deployed plus current certificate/handshake evidence from the production hostname before FCR marks transport authentication quantum-safe.',
    sources: [
      {
        title: 'Cloudflare SSL/TLS — PQC in Cloudflare products',
        url: 'https://developers.cloudflare.com/ssl/post-quantum-cryptography/pqc-cloudflare-products/',
      },
    ],
    observedOn: '2026-09-10',
  },
] as const;

function observationExpiry(observedOn: string, leaseDays: number): number | null {
  const observedAt = Date.parse(`${observedOn}T00:00:00.000Z`);
  if (!Number.isFinite(observedAt)) return null;
  return observedAt + leaseDays * 24 * 60 * 60 * 1_000;
}

export function providerPqcCapabilitiesAsOf(
  entries: readonly ProviderPqcCapabilityEntry[] = PROVIDER_PQC_CAPABILITIES,
  asOf: Date = new Date(),
  currentLeaseDays = PROVIDER_PQC_CURRENT_LEASE_DAYS,
): readonly ProviderPqcCapabilityEntry[] {
  const asOfMs = asOf.getTime();
  return entries.map((entry) => {
    if (entry.state !== 'CURRENT') return entry;
    const expiresAt = observationExpiry(entry.observedOn, currentLeaseDays);
    if (expiresAt !== null && asOfMs <= expiresAt) return entry;
    return {
      ...entry,
      state: 'UNKNOWN',
      currentContract: `Provider evidence lease expired after ${entry.observedOn}; authoritative revalidation is required before treating this capability as current.`,
      pqcEvidence: 'Prior provider documentation remains provenance only until it is revalidated against the authoritative source.',
    };
  });
}

export function auditProviderPqcCapabilities(entries: readonly ProviderPqcCapabilityEntry[] = PROVIDER_PQC_CAPABILITIES): {
  entryCount: number;
  currentCount: number;
  plannedCount: number;
  unsupportedCount: number;
  unknownCount: number;
} {
  return {
    entryCount: entries.length,
    currentCount: entries.filter((entry) => entry.state === 'CURRENT').length,
    plannedCount: entries.filter((entry) => entry.state === 'PLANNED').length,
    unsupportedCount: entries.filter((entry) => entry.state === 'UNSUPPORTED').length,
    unknownCount: entries.filter((entry) => entry.state === 'UNKNOWN').length,
  };
}
