import { describe, expect, it } from 'vitest';
import {
  FOUNDER_HUBSPOT_ACCOUNT_ID,
  FOUNDER_HUBSPOT_PROJECTS,
  HubSpotReadOnlyProvider,
  preflightHubSpotReadOnlySnapshot,
  registeredHubSpotProject,
  type HubSpotProjectRecordSnapshot,
} from '../HubSpotReadOnlyProvider.js';

function records(): HubSpotProjectRecordSnapshot[] {
  return FOUNDER_HUBSPOT_PROJECTS.map((project, index) => ({
    id: project.dealId,
    dealname: project.dealName,
    pipeline: 'default',
    dealstage: index === 1 ? 'qualifiedtobuy' : 'appointmentscheduled',
  }));
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
  });

  it('accepts the exact audited portal and project set while refusing mutation authority', () => {
    const provider = new HubSpotReadOnlyProvider();
    const result = provider.preflight({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      cliAccountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      records: records(),
    });

    expect(result).toMatchObject({
      status: 'ready',
      mode: 'read-only',
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
    const result = preflightHubSpotReadOnlySnapshot({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      records: records(),
    });

    expect(result.status).toBe('ready');
    expect(result.cliBinding).toBe('unverified');
    expect(result.warnings.join(' ')).toContain('workstation account binding remains unverified');
  });

  it('fails closed when the provider workspace or local CLI binding targets another account', () => {
    const wrongWorkspace = preflightHubSpotReadOnlySnapshot({
      accountId: '111111111',
      cliAccountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      records: records(),
    });
    expect(wrongWorkspace.status).toBe('blocked');
    expect(wrongWorkspace.errors.join(' ')).toContain(
      `HubSpot workspace must be exactly ${FOUNDER_HUBSPOT_ACCOUNT_ID}`,
    );

    const wrongCli = preflightHubSpotReadOnlySnapshot({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      cliAccountId: '222222222',
      records: records(),
    });
    expect(wrongCli.status).toBe('blocked');
    expect(wrongCli.cliBinding).toBe('mismatch');
    expect(wrongCli.errors.join(' ')).toContain(
      `Local HubSpot CLI binding must be exactly ${FOUNDER_HUBSPOT_ACCOUNT_ID}`,
    );
  });

  it('blocks missing, unknown, duplicate, and renamed project records', () => {
    const missing = preflightHubSpotReadOnlySnapshot({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      records: records().slice(0, -1),
    });
    expect(missing.status).toBe('blocked');
    expect(missing.errors.join(' ')).toContain('Se’kret Bip Demo / Redirect');

    const unknown = preflightHubSpotReadOnlySnapshot({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      records: [...records(), { id: '999999999', dealname: 'Future Sales Deal' }],
    });
    expect(unknown.status).toBe('blocked');
    expect(unknown.errors.join(' ')).toContain('999999999 is not in the audited founder-project registry');

    const duplicateRows = records();
    duplicateRows.push({ ...duplicateRows[0]! });
    const duplicate = preflightHubSpotReadOnlySnapshot({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      records: duplicateRows,
    });
    expect(duplicate.status).toBe('blocked');
    expect(duplicate.errors.join(' ')).toContain('repeats deal ID 337732528835');

    const renamedRows = records();
    renamedRows[0] = { ...renamedRows[0]!, dealname: 'Control Room Maybe' };
    const renamed = preflightHubSpotReadOnlySnapshot({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
      records: renamedRows,
    });
    expect(renamed.status).toBe('blocked');
    expect(renamed.errors.join(' ')).toContain('must be named exactly Founder Control Room');
  });

  it('does not expose sales stages as founder-project status', () => {
    const result = preflightHubSpotReadOnlySnapshot({
      accountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
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
