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
    });
  });

  it('keeps integration and production proof-gated', () => {
    expect(standingFounderRule('integrate_main').mode).toBe('proof-gated');
    expect(standingFounderRule('integrate_main').minimumAuthority).toBe('L5');
    expect(standingFounderRule('deploy')).toMatchObject({
      mode: 'proof-gated',
      minimumAuthority: 'L6',
      requiresRollback: true,
      requiresProviderReadback: true,
    });
    expect(standingFounderRule('provider_mutation').mode).toBe('proof-gated');
  });

  it('never lets the system grant itself more authority', () => {
    expect(STANDING_FOUNDER_POLICY.selfExpansionAllowed).toBe(false);
    expect(standingFounderRule('authority_change').mode).toBe('founder-required');
    expect(standingFounderRule('authority_change').reason).toMatch(/never expand its own authority/i);
  });

  it('requires an active sufficiently-authorized connection and secret ref for L4+ standing actions', () => {
    expect(connectionCanSupportStandingAction({
      action: 'create_branch',
      authorityLevel: 'L4',
      status: 'active',
      secretRef: 'github/sekret-bip/builder',
    })).toBe(true);

    expect(connectionCanSupportStandingAction({
      action: 'create_branch',
      authorityLevel: 'L3',
      status: 'active',
      secretRef: 'github/sekret-bip/builder',
    })).toBe(false);

    expect(connectionCanSupportStandingAction({
      action: 'create_branch',
      authorityLevel: 'L4',
      status: 'active',
      secretRef: null,
    })).toBe(false);

    expect(connectionCanSupportStandingAction({
      action: 'inspect_project',
      authorityLevel: 'L1',
      status: 'active',
      secretRef: null,
    })).toBe(true);
  });
});
