import { describe, expect, it } from 'vitest';
import {
  reconcileProviderObservation,
  type ProviderChildDeclaration,
  type ProviderChildObservation,
} from '../providerObservation.js';

const NOW = '2026-09-05T20:30:00.000Z';
const MAX_AGE_MS = 60 * 60 * 1000;

const observation: ProviderChildObservation = {
  projectSlug: 'founder-control-room',
  providerType: 'shopify',
  providerAccountId: 'fcr-shopify-account',
  installationId: 'installation-1',
  appId: 'app-1',
  handle: 'example-app',
  developerName: 'Example Developer',
  scopes: ['read_orders', 'write_orders'],
  observedAt: '2026-09-05T20:00:00.000Z',
  completeness: 'COMPLETE',
};

const declaration: ProviderChildDeclaration = {
  projectSlug: 'founder-control-room',
  providerType: 'shopify',
  providerAccountId: 'fcr-shopify-account',
  installationId: 'installation-1',
  appId: 'app-1',
  handle: 'example-app',
  developerName: 'Example Developer',
  approvedScopes: ['read_orders', 'write_orders'],
  approvalRef: 'founder-approval-1',
};

function reconcile(
  nextObservation: ProviderChildObservation | null = observation,
  nextDeclaration: ProviderChildDeclaration | null = declaration,
) {
  return reconcileProviderObservation({
    observation: nextObservation,
    declaration: nextDeclaration,
    now: NOW,
    maxAgeMs: MAX_AGE_MS,
  });
}

describe('reconcileProviderObservation', () => {
  it('fails closed when no provider observation exists', () => {
    const result = reconcile(null, declaration);

    expect(result.state).toBe('UNKNOWN');
    expect(result.reasons).toEqual(['OBSERVATION_MISSING']);
    expect(result.authorityGranted).toBe(false);
  });

  it('fails closed when the provider inventory is partial', () => {
    const result = reconcile({ ...observation, completeness: 'PARTIAL' }, null);

    expect(result.state).toBe('UNKNOWN');
    expect(result.reasons).toEqual(['OBSERVATION_INCOMPLETE']);
  });

  it('classifies a fresh complete installation with no declaration as UNDECLARED', () => {
    const result = reconcile(observation, null);

    expect(result.state).toBe('UNDECLARED');
    expect(result.reasons).toEqual(['DECLARATION_MISSING']);
    expect(result.authorityGranted).toBe(false);
  });

  it('classifies newly added provider scopes as SCOPE_DRIFT', () => {
    const result = reconcile({ ...observation, scopes: [...observation.scopes, 'write_customers'] });

    expect(result.state).toBe('SCOPE_DRIFT');
    expect(result.reasons).toEqual(['SCOPE_ADDED']);
    expect(result.addedScopes).toEqual(['write_customers']);
    expect(result.authorityGranted).toBe(false);
  });

  it('classifies removed provider scopes as SCOPE_DRIFT', () => {
    const result = reconcile({ ...observation, scopes: ['read_orders'] });

    expect(result.state).toBe('SCOPE_DRIFT');
    expect(result.reasons).toEqual(['SCOPE_MISSING']);
    expect(result.missingScopes).toEqual(['write_orders']);
  });

  it('classifies installation identity changes separately from scope drift', () => {
    const result = reconcile({ ...observation, installationId: 'installation-2' });

    expect(result.state).toBe('IDENTITY_DRIFT');
    expect(result.identityMismatches).toEqual(['installationId']);
    expect(result.authorityGranted).toBe(false);
  });

  it('rejects cross-project authority reuse as identity drift', () => {
    const result = reconcile({ ...observation, projectSlug: 'another-project' });

    expect(result.state).toBe('IDENTITY_DRIFT');
    expect(result.identityMismatches).toEqual(['projectSlug']);
  });

  it('treats stale provider evidence as STALE even when declaration and scopes still match', () => {
    const result = reconcile({ ...observation, observedAt: '2026-09-05T18:00:00.000Z' });

    expect(result.state).toBe('STALE');
    expect(result.reasons).toEqual(['OBSERVATION_STALE']);
    expect(result.authorityGranted).toBe(false);
  });

  it('treats future-dated provider evidence as UNKNOWN', () => {
    const result = reconcile({ ...observation, observedAt: '2026-09-05T21:00:00.000Z' });

    expect(result.state).toBe('UNKNOWN');
    expect(result.reasons).toEqual(['OBSERVATION_FROM_FUTURE']);
  });

  it('canonicalizes duplicate and reordered scopes without manufacturing drift', () => {
    const result = reconcile({
      ...observation,
      scopes: ['write_orders', 'read_orders', 'read_orders', ' write_orders '],
    });

    expect(result.state).toBe('CURRENT');
    expect(result.observedScopes).toEqual(['read_orders', 'write_orders']);
    expect(result.approvedScopes).toEqual(['read_orders', 'write_orders']);
    expect(result.authorityGranted).toBe(false);
  });

  it('reports CURRENT only for complete fresh exact identity and exact scope-set evidence', () => {
    const result = reconcile();

    expect(result.state).toBe('CURRENT');
    expect(result.reasons).toEqual(['MATCHED_CURRENT']);
    expect(result.addedScopes).toEqual([]);
    expect(result.missingScopes).toEqual([]);
    expect(result.authorityGranted).toBe(false);
  });

  it('fails closed on malformed declaration evidence instead of treating missing authority as low risk', () => {
    const result = reconcile(observation, { ...declaration, approvalRef: ' ' });

    expect(result.state).toBe('UNKNOWN');
    expect(result.reasons).toEqual(['DECLARATION_INVALID']);
    expect(result.authorityGranted).toBe(false);
  });
});
