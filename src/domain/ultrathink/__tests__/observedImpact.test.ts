import { describe, expect, it } from 'vitest';
import {
  evaluateObservedImpact,
  type UltrathinkDeclaredImpact,
  type UltrathinkObservedImpact,
} from '../observedImpact.js';

const declared: UltrathinkDeclaredImpact = {
  domains: ['onboarding', 'analytics'],
  riskTier: 'l1',
};

const observed: UltrathinkObservedImpact = {
  baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  candidateSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  changedPaths: ['src/screens/Signup.tsx'],
  affectedDomains: ['onboarding', 'analytics'],
  riskTier: 'l1',
  observedAt: '2026-08-22T23:20:00.000Z',
};

describe('ULTRATHINK repository-observed impact', () => {
  it('keeps a change inside declared scope when observed domains and risk agree', () => {
    expect(evaluateObservedImpact(declared, observed)).toEqual({
      status: 'within_declared_scope',
      reason: 'repository-observed blast radius remains within declared impact',
      addedDomains: [],
      riskEscalated: false,
    });
  });

  it('escalates when repository-derived domains exceed the declaration', () => {
    const result = evaluateObservedImpact(declared, {
      ...observed,
      changedPaths: [
        'src/screens/Signup.tsx',
        'src/auth/session.ts',
        'src/api/client.ts',
      ],
      affectedDomains: ['onboarding', 'analytics', 'auth', 'session', 'api'],
      riskTier: 'l2',
    });

    expect(result).toEqual({
      status: 'scope_exceeded',
      reason: 'repository-observed blast radius exceeds declared impact',
      addedDomains: ['api', 'auth', 'session'],
      riskEscalated: true,
    });
  });

  it('escalates risk even when the declared domain list still matches', () => {
    const result = evaluateObservedImpact(declared, {
      ...observed,
      riskTier: 'l2',
    });

    expect(result.status).toBe('scope_exceeded');
    expect(result.addedDomains).toEqual([]);
    expect(result.riskEscalated).toBe(true);
  });

  it('fails closed when repository observation identity is incomplete', () => {
    const result = evaluateObservedImpact(declared, {
      ...observed,
      candidateSha: '',
    });

    expect(result.status).toBe('malformed');
  });
});
