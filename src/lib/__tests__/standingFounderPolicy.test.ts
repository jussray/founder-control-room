import { describe, expect, it } from 'vitest';
import {
  STANDING_FOUNDER_POLICY,
  connectionCanSupportStandingAction,
  standingFounderRule,
} from '../standingFounderPolicy.js';

describe('standing founder policy', () => {
  it('keeps reversible L1-L4 work autonomous under standing founder policy', () => {
    for (const action of ['inspect_project', 'analyze', 'sandbox', 'create_branch', 'edit_branch', 'run_tests', 'open_pr'] as const) {
      expect(standingFounderRule(action).mode).toBe('autonomous');
    }
    expect(standingFounderRule('create_branch')).toMatchObject({
      minimumAuthority: 'L4',
      reversible: true,
      requiresExactHead: true,
      requiresProviderReadback: true,
      providerTypes: ['github'],
      capabilityIds: ['create_branch'],
    });
  });

  it('keeps integration and production proof-gated', () => {
    expect(standingFounderRule('integrate_main')).toMatchObject({
      mode: 'proof-gated',
      minimumAuthority: 'L5',
      providerTypes: ['github'],
      capabilityIds: ['integrate_main'],
    });
    expect(standingFounderRule('deploy')).toMatchObject({
      mode: 'proof-gated',
      minimumAuthority: 'L6',
      requiresRollback: true,
      requiresProviderReadback: true,
      capabilityIds: ['deploy'],
    });
    expect(standingFounderRule('provider_mutation').mode).toBe('proof-gated');
  });

  it('never lets the system grant itself more authority', () => {
    expect(STANDING_FOUNDER_POLICY.selfExpansionAllowed).toBe(false);
    expect(standingFounderRule('authority_change').mode).toBe('founder-required');
    expect(standingFounderRule('authority_change').reason).toMatch(/never expand its own authority/i);
  });

  it('requires active authority, secret reference, provider type, and declared capability for L4+ actions', () => {
    const validGithub = {
      action: 'create_branch' as const,
      authorityLevel: 'L4' as const,
      status: 'active',
      type: 'github',
      capabilities: ['inspect_repos', 'create_branch'],
      secretRef: 'github/sekret-bip/builder',
    };
    expect(connectionCanSupportStandingAction(validGithub)).toBe(true);

    expect(connectionCanSupportStandingAction({ ...validGithub, authorityLevel: 'L3' })).toBe(false);
    expect(connectionCanSupportStandingAction({ ...validGithub, secretRef: null })).toBe(false);
    expect(connectionCanSupportStandingAction({ ...validGithub, type: 'cloudflare' })).toBe(false);
    expect(connectionCanSupportStandingAction({ ...validGithub, capabilities: ['inspect_repos'] })).toBe(false);

    expect(connectionCanSupportStandingAction({
      action: 'inspect_project',
      authorityLevel: 'L1',
      status: 'active',
      type: 'github',
      capabilities: ['inspect_repos'],
      secretRef: null,
    })).toBe(true);
  });

  it('does not let an unrelated L6 provider connection masquerade as GitHub integration authority', () => {
    expect(connectionCanSupportStandingAction({
      action: 'integrate_main',
      authorityLevel: 'L6',
      status: 'active',
      type: 'cloudflare',
      capabilities: ['deploy'],
      secretRef: 'cloudflare/project/provider',
    })).toBe(false);
  });
});
