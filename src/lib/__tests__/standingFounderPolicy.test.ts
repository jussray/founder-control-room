import { describe, expect, it } from 'vitest';
import {
  STANDING_FOUNDER_POLICY,
  connectionCanSupportStandingAction,
  necessaryFixPolicyDisposition,
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

  it('defaults necessary reversible in-scope fixes to execution instead of founder homework', () => {
    expect(STANDING_FOUNDER_POLICY.necessaryFixDefault).toMatchObject({
      enabled: true,
      doesNotGrantAuthority: true,
      requiresCurrentAuthority: true,
      proofGatedActionsRemainProofGated: true,
    });
    expect(STANDING_FOUNDER_POLICY.necessaryFixDefault.principle).toMatch(/implement it in the same loop/i);

    expect(necessaryFixPolicyDisposition({
      action: 'edit_branch',
      necessary: true,
      withinApprovedScope: true,
    })).toBe('execute-now');

    expect(necessaryFixPolicyDisposition({
      action: 'run_tests',
      necessary: true,
      withinApprovedScope: true,
    })).toBe('execute-now');

    expect(necessaryFixPolicyDisposition({
      action: 'edit_branch',
      necessary: false,
      withinApprovedScope: true,
    })).toBe('not-necessary');
  });

  it('keeps reversible integration proof-gated rather than turning proof into founder interruption', () => {
    expect(necessaryFixPolicyDisposition({
      action: 'integrate_main',
      necessary: true,
      withinApprovedScope: true,
    })).toBe('proof-gated');
  });

  it('requires founder authority when a necessary fix crosses the standing execution boundary', () => {
    const base = {
      action: 'edit_branch' as const,
      necessary: true,
      withinApprovedScope: true,
    };

    expect(necessaryFixPolicyDisposition({ ...base, withinApprovedScope: false })).toBe('founder-required');
    expect(necessaryFixPolicyDisposition({ ...base, widensScope: true })).toBe('founder-required');
    expect(necessaryFixPolicyDisposition({ ...base, externalPublication: true })).toBe('founder-required');
    expect(necessaryFixPolicyDisposition({ ...base, spendsMoney: true })).toBe('founder-required');
    expect(necessaryFixPolicyDisposition({ ...base, destructive: true })).toBe('founder-required');
    expect(necessaryFixPolicyDisposition({ ...base, irreversible: true })).toBe('founder-required');
    expect(necessaryFixPolicyDisposition({ ...base, authorityExpansion: true })).toBe('founder-required');

    expect(necessaryFixPolicyDisposition({
      action: 'external_communication',
      necessary: true,
      withinApprovedScope: true,
    })).toBe('founder-required');

    expect(necessaryFixPolicyDisposition({
      action: 'deploy',
      necessary: true,
      withinApprovedScope: true,
    })).toBe('founder-required');

    expect(necessaryFixPolicyDisposition({
      action: 'provider_mutation',
      necessary: true,
      withinApprovedScope: true,
    })).toBe('founder-required');
  });

  it('never lets the system grant itself more authority', () => {
    expect(STANDING_FOUNDER_POLICY.selfExpansionAllowed).toBe(false);
    expect(STANDING_FOUNDER_POLICY.necessaryFixDefault.doesNotGrantAuthority).toBe(true);
    expect(standingFounderRule('authority_change').mode).toBe('founder-required');
    expect(standingFounderRule('authority_change').reason).toMatch(/never expand its own authority/i);
    expect(necessaryFixPolicyDisposition({
      action: 'authority_change',
      necessary: true,
      withinApprovedScope: true,
    })).toBe('founder-required');
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
