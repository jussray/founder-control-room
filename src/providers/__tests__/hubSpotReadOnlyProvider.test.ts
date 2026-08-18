import { describe, expect, it } from 'vitest';
import {
  FOUNDER_HUBSPOT_ACCOUNT_ID,
  FOUNDER_HUBSPOT_PROJECTS,
  HubSpotReadOnlyProvider,
  preflightHubSpotReadOnlySnapshot,
  registeredHubSpotProject,
  type HubSpotProjectRecordSnapshot,
  type HubSpotReadOnlySnapshot,
} from '../HubSpotReadOnlyProvider.js';

const NOW = new Date('2026-08-18T01:40:00.000Z');
const FRESH_OBSERVED_AT = '2026-08-18T01:39:30.000Z';

function records(): HubSpotProjectRecordSnapshot[] {
  return FOUNDER_HUBSPOT_PROJECTS.map((project, index) => ({
    id: project.dealId,
    dealname: project.dealName,
    pipeline: 'default',
    dealstage: index === 1 ? 'qualifiedtobuy' : 'appointmentscheduled',
  }));
}

function snapshot(overrides: Partial<HubSpotReadOnlySnapshot> = {}): HubSpotReadOnlySnapshot {
  return {
    accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
    observedAt: FRESH_OBSERVED_AT,
    records: records(),
    ...overrides,
  };
}

function preflight(overrides: Partial<HubSpotReadOnlySnapshot> = {}) {
  return preflightHubSpotReadOnlySnapshot(snapshot(overrides), { now: NOW });
}

describe('HubSpot read-only founder-project registry', () => {
  it('binds the audited account to exactly ten explicit founder-project records', () => {
    expect(FOUNDER_HUBSPOT_ACCOUNT_ID).toBe('246754542');
    expect(FOUNDER_HUBSPOT_PROJECTS).toHaveLength(10);
    expect(new Set(FOUNDER_HUBSPOT_PROJECTS.map((project) => project.dealId)).size).toBe(10);
    expect(new Set(FOUNDER_HUBSPOT_PROJECTS.map((project) => project.dealName)).size).toBe(10);

    expect(registeredHubSpotProject('337732528835')).toMatchObject({
      key: 'founder-control-room',
      dealName: 'Founder Control Room',
      authority: 'canonical-repository',
      sourceRepository: 'jussray/founder-control-room',
    });
    expect(registeredHubSpotProject('337831637703')).toMatchObject({
      dealName: 'L99 Story Engine',
      sourceRepository: 'jussray/StoryEngine',
    });
    expect(registeredHubSpotProject('337704597208')).toMatchObject({
      dealName: 'Juss Beautiful Hair',
      authority: 'portfolio',
      sourceRepository: null,
    });
    expect(registeredHubSpotProject('337862059752')).toMatchObject({
      authority: 'non-authoritative-repository',
      sourceRepository: 'jussray/sekret-bip-demo',
    });
    expect(registeredHubSpotProject('999')).toBeNull();
    expect(registeredHubSpotProject(null)).toBeNull();
  });

  it('accepts a fresh exact portal snapshot while refusing mutation authority', () => {
    const provider = new HubSpotReadOnlyProvider();
    const result = provider.preflight(
      snapshot({ cliAccountId: FOUNDER_HUBSPOT_ACCOUNT_ID }),
      { now: NOW },
    );

    expect(result).toMatchObject({
      status: 'ready',
      mode: 'read-only',
      observedAt: FRESH_OBSERVED_AT,
      snapshotAgeMs: 30_000,
      cliBinding: 'verified',
      registeredProjectCount: 10,
      observedProjectCount: 10,
      mutationAllowed: false,
      errors: [],
    });
    expect(result.allowedOperations).toEqual([
      'list_registered_projects',
      'validate_project_snapshot',
    ]);
    expect(result.warnings.join(' ')).toContain('dealstage');
    expect(provider.mutationAllowed).toBe(false);
  });

  it('keeps connector-backed inspection usable while reporting local CLI binding as unverified', () => {
    const result = preflight();

    expect(result.status).toBe('ready');
    expect(result.cliBinding).toBe('unverified');
    expect(result.warnings.join(' ')).toContain('workstation account binding remains unverified');
  });

  it('fails closed when the provider workspace or local CLI binding targets another account', () => {
    const wrongWorkspace = preflight({
      accountId: '111111111',
      cliAccountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
    });
    expect(wrongWorkspace.status).toBe('blocked');
    expect(wrongWorkspace.errors.join(' ')).toContain(
      `HubSpot workspace must be exactly ${FOUNDER_HUBSPOT_ACCOUNT_ID}`,
    );

    const wrongCli = preflight({ cliAccountId: '222222222' });
    expect(wrongCli.status).toBe('blocked');
    expect(wrongCli.cliBinding).toBe('mismatch');
    expect(wrongCli.errors.join(' ')).toContain(
      `Local HubSpot CLI binding must be exactly ${FOUNDER_HUBSPOT_ACCOUNT_ID}`,
    );
  });

  it('blocks missing, unknown, duplicate, and renamed project records', () => {
    const missing = preflight({ records: records().slice(0, -1) });
    expect(missing.status).toBe('blocked');
    expect(missing.errors.join(' ')).toContain('Se’kret Bip Demo / Redirect');

    const unknown = preflight({
      records: [...records(), { id: '999999999', dealname: 'Future Sales Deal' }],
    });
    expect(unknown.status).toBe('blocked');
    expect(unknown.errors.join(' ')).toContain('999999999 is not in the audited founder-project registry');

    const duplicateRows = records();
    duplicateRows.push({ ...duplicateRows[0]! });
    const duplicate = preflight({ records: duplicateRows });
    expect(duplicate.status).toBe('blocked');
    expect(duplicate.errors.join(' ')).toContain('repeats deal ID 337732528835');

    const renamedRows = records();
    renamedRows[0] = { ...renamedRows[0]!, dealname: 'control room maybe' };
    const renamed = preflight({ records: renamedRows });
    expect(renamed.status).toBe('blocked');
    expect(renamed.errors.join(' ')).toContain('must be named exactly Founder Control Room');
  });

  it('blocks malformed, missing, stale, and future-dated provider snapshots without throwing', () => {
    const malformedRows = records();
    malformedRows[0] = { id: null, dealname: null };
    const malformed = preflight({ records: malformedRows });
    expect(malformed.status).toBe('blocked');
    expect(malformed.errors.join(' ')).toContain('record without a usable ID');

    const missingRows = preflight({ records: null });
    expect(missingRows.status).toBe('blocked');
    expect(missingRows.errors.join(' ')).toContain('must include an array');

    const missingTimestamp = preflight({ observedAt: null });
    expect(missingTimestamp.status).toBe('blocked');
    expect(missingTimestamp.errors.join(' ')).toContain('valid observedAt timestamp');

    const stale = preflight({ observedAt: '2026-08-18T01:30:00.000Z' });
    expect(stale.status).toBe('blocked');
    expect(stale.errors.join(' ')).toContain('snapshot is stale');

    const future = preflight({ observedAt: '2026-08-18T01:41:00.000Z' });
    expect(future.status).toBe('blocked');
    expect(future.errors.join(' ')).toContain('too far in the future');
  });

  it('does not expose sales stages as founder-project status', () => {
    const result = preflight({
      records: records().map((record) => ({
        ...record,
        pipeline: 'wildly-different-sales-pipeline',
        dealstage: 'closedwon',
      })),
    });

    expect(result.status).toBe('ready');
    expect(result.warnings.join(' ')).toContain(
      'pipeline and dealstage are sales taxonomy and are intentionally not treated as founder-project status',
    );
  });
});
