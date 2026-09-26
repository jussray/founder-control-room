export type SupabaseBindingRole = 'canonical-runtime' | 'known-unclassified';
export type SupabaseBindingEvidence =
  | 'repo-source+provider-readback'
  | 'repo-source+provider-receipt'
  | 'provider-receipt-only';

export interface SupabaseProjectAuthorityBinding {
  projectSlug: string;
  projectRef: string;
  organizationRef: string;
  role: SupabaseBindingRole;
  evidence: SupabaseBindingEvidence;
  /**
   * Registry identity is never mutation authority. Any provider mutation still
   * requires fresh exact-project provider authority/readback.
   */
  mutationAuthority: false;
}

export type SupabaseVisibilityState =
  | 'visible'
  | 'outside-connection-organization'
  | 'known-project-not-visible'
  | 'unknown-project';

export const SUPABASE_ORGANIZATIONS = {
  rayleneProjects: 'vercel_icfg_v3CousBaJVAqOT9wXYPLhyR2',
  sekretBipOrganization: 'adfsemxgosfkioxaefoq',
} as const;

/**
 * Evidence-bound Supabase identity registry.
 *
 * This registry answers only "which provider resource is this?" It must never
 * be used to infer that the current connector/session has authority over that
 * organization, or that a known resource is healthy, deployed, or safe to
 * mutate.
 */
export const SUPABASE_PROJECT_AUTHORITIES: readonly SupabaseProjectAuthorityBinding[] = [
  {
    projectSlug: 'sekret-bip',
    projectRef: 'tbsevonvegdnlyjgplmm',
    organizationRef: SUPABASE_ORGANIZATIONS.rayleneProjects,
    role: 'canonical-runtime',
    evidence: 'repo-source+provider-readback',
    mutationAuthority: false,
  },
  {
    projectSlug: 'founder-control-room',
    projectRef: 'oojzfmmywbvficgybaxd',
    organizationRef: SUPABASE_ORGANIZATIONS.rayleneProjects,
    role: 'canonical-runtime',
    evidence: 'repo-source+provider-readback',
    mutationAuthority: false,
  },
  {
    projectSlug: 'l99',
    projectRef: 'tarnmxcjpvaxapnjnesf',
    organizationRef: SUPABASE_ORGANIZATIONS.sekretBipOrganization,
    role: 'canonical-runtime',
    evidence: 'repo-source+provider-receipt',
    mutationAuthority: false,
  },
  {
    projectSlug: 'chief-ai-machine',
    projectRef: 'lghpwoktsytutssjiwgy',
    organizationRef: SUPABASE_ORGANIZATIONS.sekretBipOrganization,
    role: 'known-unclassified',
    evidence: 'provider-receipt-only',
    mutationAuthority: false,
  },
] as const;

export function getSupabaseProjectAuthority(
  projectSlug: string,
): SupabaseProjectAuthorityBinding | undefined {
  return SUPABASE_PROJECT_AUTHORITIES.find((binding) => binding.projectSlug === projectSlug);
}

export function getCanonicalSupabaseProjectAuthority(
  projectSlug: string,
): SupabaseProjectAuthorityBinding | undefined {
  const binding = getSupabaseProjectAuthority(projectSlug);
  return binding?.role === 'canonical-runtime' ? binding : undefined;
}

/**
 * Classify a lookup using provider observations without converting absence into
 * a false "project missing" claim. The caller supplies exactly what the active
 * connector/session actually observed.
 */
export function classifySupabaseProjectVisibility(
  projectRef: string,
  observedOrganizationRefs: readonly string[],
  observedProjectRefs: readonly string[],
): SupabaseVisibilityState {
  const binding = SUPABASE_PROJECT_AUTHORITIES.find((candidate) => candidate.projectRef === projectRef);
  if (!binding) return 'unknown-project';
  if (observedProjectRefs.includes(projectRef)) return 'visible';
  if (!observedOrganizationRefs.includes(binding.organizationRef)) {
    return 'outside-connection-organization';
  }
  return 'known-project-not-visible';
}
