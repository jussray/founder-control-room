import { describe, expect, it } from 'vitest';
import {
  SUPABASE_ORGANIZATIONS,
  SUPABASE_PROJECT_AUTHORITIES,
  classifySupabaseProjectVisibility,
  getCanonicalSupabaseProjectAuthority,
  getSupabaseProjectAuthority,
} from './providerAuthorities.js';

describe('Supabase provider authority registry', () => {
  it('keeps canonical project identity separate from provider mutation authority', () => {
    expect(getCanonicalSupabaseProjectAuthority('sekret-bip')).toMatchObject({
      projectRef: 'tbsevonvegdnlyjgplmm',
      organizationRef: SUPABASE_ORGANIZATIONS.rayleneProjects,
      role: 'canonical-runtime',
      mutationAuthority: false,
    });

    expect(getCanonicalSupabaseProjectAuthority('founder-control-room')).toMatchObject({
      projectRef: 'oojzfmmywbvficgybaxd',
      organizationRef: SUPABASE_ORGANIZATIONS.rayleneProjects,
      role: 'canonical-runtime',
      mutationAuthority: false,
    });

    expect(getCanonicalSupabaseProjectAuthority('l99')).toMatchObject({
      projectRef: 'tarnmxcjpvaxapnjnesf',
      organizationRef: SUPABASE_ORGANIZATIONS.sekretBipLegacy,
      role: 'canonical-runtime',
      mutationAuthority: false,
    });
  });

  it('keeps the historical Chief project known without promoting it to canonical runtime authority', () => {
    expect(getSupabaseProjectAuthority('chief-ai-machine')).toMatchObject({
      projectRef: 'lghpwoktsytutssjiwgy',
      organizationRef: SUPABASE_ORGANIZATIONS.sekretBipLegacy,
      role: 'known-unclassified',
      mutationAuthority: false,
    });
    expect(getCanonicalSupabaseProjectAuthority('chief-ai-machine')).toBeUndefined();
  });

  it('distinguishes a different organization scope from a missing project', () => {
    const visibleOrganizations = [SUPABASE_ORGANIZATIONS.rayleneProjects];
    const visibleProjects = ['tbsevonvegdnlyjgplmm', 'oojzfmmywbvficgybaxd'];

    expect(classifySupabaseProjectVisibility(
      'tbsevonvegdnlyjgplmm',
      visibleOrganizations,
      visibleProjects,
    )).toBe('visible');

    expect(classifySupabaseProjectVisibility(
      'tarnmxcjpvaxapnjnesf',
      visibleOrganizations,
      visibleProjects,
    )).toBe('outside-connection-organization');

    expect(classifySupabaseProjectVisibility(
      'lghpwoktsytutssjiwgy',
      visibleOrganizations,
      visibleProjects,
    )).toBe('outside-connection-organization');
  });

  it('keeps same-organization absence and unknown provider identity distinct', () => {
    expect(classifySupabaseProjectVisibility(
      'tarnmxcjpvaxapnjnesf',
      [SUPABASE_ORGANIZATIONS.sekretBipLegacy],
      [],
    )).toBe('known-project-not-visible');

    expect(classifySupabaseProjectVisibility(
      'aaaaaaaaaaaaaaaaaaaa',
      [SUPABASE_ORGANIZATIONS.sekretBipLegacy],
      [],
    )).toBe('unknown-project');
  });

  it('does not allow one Supabase project ref to occupy multiple portfolio identities', () => {
    const projectRefs = SUPABASE_PROJECT_AUTHORITIES.map((binding) => binding.projectRef);
    expect(new Set(projectRefs).size).toBe(projectRefs.length);
    expect(SUPABASE_PROJECT_AUTHORITIES.every((binding) => binding.mutationAuthority === false)).toBe(true);
  });
});
