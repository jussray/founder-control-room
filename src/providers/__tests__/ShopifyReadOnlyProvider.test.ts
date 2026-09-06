import { describe, expect, it } from 'vitest';
import type { ProviderChildDeclaration } from '../../lib/providerObservation.js';
import {
  DEFAULT_SHOPIFY_SNAPSHOT_MAX_AGE_MS,
  FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN,
  FOUNDER_CONTROL_ROOM_PROJECT_SLUG,
  FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN,
  preflightFounderShopifyInventory,
  reconcileFounderShopifyInventory,
  type ShopifyInstalledAppInventorySnapshot,
} from '../ShopifyReadOnlyProvider.js';

const NOW = new Date('2026-09-05T20:30:00.000Z');

const snapshot: ShopifyInstalledAppInventorySnapshot = {
  myshopifyDomain: FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN,
  primaryDomain: `https://${FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN}`,
  observedAt: '2026-09-05T20:29:00.000Z',
  hasNextPage: false,
  apps: [
    {
      installationId: 'installation-1',
      appId: 'app-1',
      title: 'Example App',
      handle: 'example-app',
      developerName: 'Example Developer',
      scopes: ['read_orders', 'write_orders'],
    },
    {
      installationId: 'installation-2',
      appId: 'app-2',
      title: 'Read Only App',
      handle: 'read-only-app',
      developerName: 'Example Developer',
      scopes: ['read_products'],
    },
  ],
};

const declaration: ProviderChildDeclaration = {
  projectSlug: FOUNDER_CONTROL_ROOM_PROJECT_SLUG,
  providerType: 'shopify',
  providerAccountId: FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN,
  installationId: 'installation-1',
  appId: 'app-1',
  handle: 'example-app',
  developerName: 'Example Developer',
  approvedScopes: ['read_orders', 'write_orders'],
  approvalRef: 'founder-approval-1',
};

const options = { now: NOW, maxSnapshotAgeMs: DEFAULT_SHOPIFY_SNAPSHOT_MAX_AGE_MS };

describe('preflightFounderShopifyInventory', () => {
  it('accepts only a fresh complete read-only snapshot bound to the exact FCR Shopify authority', () => {
    const result = preflightFounderShopifyInventory(snapshot, options);

    expect(result.status).toBe('ready');
    expect(result.mode).toBe('read-only');
    expect(result.observedShopifyDomain).toBe(FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN);
    expect(result.observedPrimaryDomain).toBe(FOUNDER_CONTROL_ROOM_PRIMARY_DOMAIN);
    expect(result.inventoryComplete).toBe(true);
    expect(result.observedAppCount).toBe(2);
    expect(result.mutationAllowed).toBe(false);
    expect(result.persistenceAllowed).toBe(false);
    expect(result.observations.every((item) => item.completeness === 'COMPLETE')).toBe(true);
  });

  it('blocks partial pagination and prevents child observations from becoming current', () => {
    const partial = { ...snapshot, hasNextPage: true };
    const preflight = preflightFounderShopifyInventory(partial, options);
    const reconciliation = reconcileFounderShopifyInventory(partial, [declaration], true, options);

    expect(preflight.status).toBe('blocked');
    expect(preflight.inventoryComplete).toBe(false);
    expect(preflight.observations.every((item) => item.completeness === 'UNKNOWN')).toBe(true);
    expect(reconciliation.apps[0]?.reconciliation.state).toBe('UNKNOWN');
  });

  it('blocks the wrong Shopify account instead of laundering it through the FCR declaration', () => {
    const wrongStore = { ...snapshot, myshopifyDomain: 'another-store.myshopify.com' };
    const result = reconcileFounderShopifyInventory(wrongStore, [declaration], true, options);

    expect(result.preflight.status).toBe('blocked');
    expect(result.preflight.observedShopifyDomain).toBe('another-store.myshopify.com');
    expect(result.apps[0]?.reconciliation.state).toBe('UNKNOWN');
    expect(result.apps[0]?.reconciliation.authorityGranted).toBe(false);
  });

  it('blocks a mismatched branded primary domain even when the permanent Shopify domain matches', () => {
    const wrongPrimary = { ...snapshot, primaryDomain: 'https://example.com' };
    const result = reconcileFounderShopifyInventory(wrongPrimary, [declaration], true, options);

    expect(result.preflight.status).toBe('blocked');
    expect(result.preflight.observedShopifyDomain).toBe(FOUNDER_CONTROL_ROOM_SHOPIFY_DOMAIN);
    expect(result.apps[0]?.reconciliation.state).toBe('UNKNOWN');
  });

  it('blocks duplicate installation identities because one installation cannot represent two current records', () => {
    const duplicateInstallation = {
      ...snapshot,
      apps: [snapshot.apps![0]!, { ...snapshot.apps![1]!, installationId: 'installation-1' }],
    };
    const result = preflightFounderShopifyInventory(duplicateInstallation, options);

    expect(result.status).toBe('blocked');
    expect(result.errors.some((error) => error.includes('repeats installationId installation-1'))).toBe(true);
    expect(result.observations.every((item) => item.completeness === 'UNKNOWN')).toBe(true);
  });

  it('preserves stale evidence as STALE rather than upgrading it to current truth', () => {
    const stale = { ...snapshot, observedAt: '2026-09-05T20:20:00.000Z' };
    const result = reconcileFounderShopifyInventory(stale, [declaration], true, options);

    expect(result.preflight.status).toBe('blocked');
    expect(result.preflight.observations[0]?.completeness).toBe('COMPLETE');
    expect(result.apps[0]?.reconciliation.state).toBe('STALE');
    expect(result.apps[0]?.reconciliation.authorityGranted).toBe(false);
  });
});

describe('reconcileFounderShopifyInventory', () => {
  it('marks every fresh installed app UNDECLARED when the parent Shopify connection is not declared in FCR', () => {
    const result = reconcileFounderShopifyInventory(snapshot, [declaration], false, options);

    expect(result.preflight.status).toBe('ready');
    expect(result.parentConnectionDeclared).toBe(false);
    expect(result.apps.map((app) => app.reconciliation.state)).toEqual(['UNDECLARED', 'UNDECLARED']);
    expect(result.apps.every((app) => app.reconciliation.authorityGranted === false)).toBe(true);
  });

  it('reports CURRENT only for the exact declared installation and exact approved scope set', () => {
    const result = reconcileFounderShopifyInventory(snapshot, [declaration], true, options);

    expect(result.apps[0]?.reconciliation.state).toBe('CURRENT');
    expect(result.apps[0]?.reconciliation.authorityGranted).toBe(false);
    expect(result.apps[1]?.reconciliation.state).toBe('UNDECLARED');
  });

  it('reports SCOPE_DRIFT when a declared installation gains a provider scope', () => {
    const changed = {
      ...snapshot,
      apps: [
        { ...snapshot.apps![0]!, scopes: ['read_orders', 'write_orders', 'write_customers'] },
        snapshot.apps![1]!,
      ],
    };
    const result = reconcileFounderShopifyInventory(changed, [declaration], true, options);

    expect(result.apps[0]?.reconciliation.state).toBe('SCOPE_DRIFT');
    expect(result.apps[0]?.reconciliation.addedScopes).toEqual(['write_customers']);
    expect(result.apps[0]?.reconciliation.authorityGranted).toBe(false);
  });

  it('reports IDENTITY_DRIFT when the same app id is reinstalled under a new installation id', () => {
    const reinstalled = {
      ...snapshot,
      apps: [
        { ...snapshot.apps![0]!, installationId: 'installation-new' },
        snapshot.apps![1]!,
      ],
    };
    const result = reconcileFounderShopifyInventory(reinstalled, [declaration], true, options);

    expect(result.apps[0]?.reconciliation.state).toBe('IDENTITY_DRIFT');
    expect(result.apps[0]?.reconciliation.identityMismatches).toContain('installationId');
    expect(result.apps[0]?.reconciliation.authorityGranted).toBe(false);
  });

  it('does not infer declaration from app title or developer name', () => {
    const renamed = {
      ...snapshot,
      apps: [
        {
          ...snapshot.apps![1]!,
          title: 'Example App',
          developerName: 'Example Developer',
        },
        snapshot.apps![0]!,
      ],
    };
    const result = reconcileFounderShopifyInventory(renamed, [declaration], true, options);

    const undeclared = result.apps.find((app) => app.installationId === 'installation-2');
    expect(undeclared?.reconciliation.state).toBe('UNDECLARED');
    expect(undeclared?.reconciliation.authorityGranted).toBe(false);
  });
});
