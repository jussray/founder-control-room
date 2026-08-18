import { pluginDescriptorFor } from '../lib/pluginCenter.js';

export const FOUNDER_HUBSPOT_ACCOUNT_ID = '246754542';
export const DEFAULT_HUBSPOT_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 30 * 1000;

export type HubSpotProjectAuthority =
  | 'canonical-repository'
  | 'repository-workstream'
  | 'portfolio'
  | 'non-authoritative-repository';

export interface FounderHubSpotProjectRegistration {
  key: string;
  dealId: string;
  dealName: string;
  authority: HubSpotProjectAuthority;
  sourceRepository: string | null;
}

/**
 * Audited founder-project registry for HubSpot account 246754542.
 *
 * This list is intentionally explicit. HubSpot Deal records outside this list
 * are not founder-project records merely because they exist in the same portal.
 */
export const FOUNDER_HUBSPOT_PROJECTS = Object.freeze([
  {
    key: 'founder-control-room',
    dealId: '337732528835',
    dealName: 'Founder Control Room',
    authority: 'canonical-repository',
    sourceRepository: 'jussray/founder-control-room',
  },
  {
    key: 'founder-signal-engine',
    dealId: '337185466050',
    dealName: 'Founder Signal Engine',
    authority: 'repository-workstream',
    sourceRepository: 'jussray/founder-control-room',
  },
  {
    key: 'chief-ai-executive-staff',
    dealId: '337831555820',
    dealName: 'Chief AI Executive Staff',
    authority: 'repository-workstream',
    sourceRepository: 'jussray/chief-ai-machine',
  },
  {
    key: 'chief-ai-machine',
    dealId: '337824665334',
    dealName: 'Chief AI Machine',
    authority: 'canonical-repository',
    sourceRepository: 'jussray/chief-ai-machine',
  },
  {
    key: 'sekret-bip',
    dealId: '337838769858',
    dealName: 'Se’kret Bip',
    authority: 'canonical-repository',
    sourceRepository: 'jussray/Sekret-Bip',
  },
  {
    key: 'l99-story-engine',
    dealId: '337831637703',
    dealName: 'L99 Story Engine',
    authority: 'canonical-repository',
    sourceRepository: 'jussray/StoryEngine',
  },
  {
    key: 'promptos',
    dealId: '337800883902',
    dealName: 'PromptOS',
    authority: 'canonical-repository',
    sourceRepository: 'jussray/promptos',
  },
  {
    key: 'juss-beautiful-hair',
    dealId: '337704597208',
    dealName: 'Juss Beautiful Hair',
    authority: 'portfolio',
    sourceRepository: null,
  },
  {
    key: 'untold-stories-storefront',
    dealId: '338024095427',
    dealName: 'Untold Stories Storefront',
    authority: 'canonical-repository',
    sourceRepository: 'jussray/untold-stories-storefront',
  },
  {
    key: 'sekret-bip-demo-redirect',
    dealId: '337862059752',
    dealName: 'Se’kret Bip Demo / Redirect',
    authority: 'non-authoritative-repository',
    sourceRepository: 'jussray/sekret-bip-demo',
  },
] as const satisfies readonly FounderHubSpotProjectRegistration[]);

export interface HubSpotProjectRecordSnapshot {
  id?: string | number | null;
  dealname?: string | null;
  pipeline?: string | null;
  dealstage?: string | null;
}

export interface HubSpotReadOnlySnapshot {
  accountId?: string | number | null;
  observedAt?: string | null;
  records?: readonly HubSpotProjectRecordSnapshot[] | null;
  /** Optional local CLI evidence from `hs account current`. */
  cliAccountId?: string | number | null;
}

export interface HubSpotReadOnlyPreflightOptions {
  now?: Date;
  maxSnapshotAgeMs?: number;
}

export type HubSpotCliBindingState = 'verified' | 'unverified' | 'mismatch';

export interface HubSpotReadOnlyPreflightResult {
  status: 'ready' | 'blocked';
  mode: 'read-only';
  expectedAccountId: string;
  observedAccountId: string;
  observedAt: string | null;
  snapshotAgeMs: number | null;
  cliBinding: HubSpotCliBindingState;
  registeredProjectCount: number;
  observedProjectCount: number;
  mutationAllowed: false;
  allowedOperations: readonly ['list_registered_projects', 'validate_project_snapshot'];
  errors: readonly string[];
  warnings: readonly string[];
}

function normalizedId(value: string | number | null | undefined): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedDisplayName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizedNameKey(value: unknown): string {
  return normalizedDisplayName(value).toLocaleLowerCase('en-US');
}

function parsedTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function registryContractErrors(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const project of FOUNDER_HUBSPOT_PROJECTS) {
    if (ids.has(project.dealId)) {
      errors.push(`HubSpot founder-project registry repeats deal ID ${project.dealId}.`);
    }
    ids.add(project.dealId);

    const normalized = normalizedNameKey(project.dealName);
    if (names.has(normalized)) {
      errors.push(`HubSpot founder-project registry repeats deal name ${project.dealName}.`);
    }
    names.add(normalized);
  }

  const descriptor = pluginDescriptorFor('hubspot');
  if (!descriptor) {
    errors.push('Plugin Center is missing the HubSpot provider contract.');
    return errors;
  }

  if (!descriptor.capabilities.some((capability) => capability.id === 'inspect_operational_data')) {
    errors.push('Plugin Center HubSpot contract no longer grants minimized read authority.');
  }
  if (!descriptor.blockedByDefault.includes('create_or_update_without_confirmation')) {
    errors.push('Plugin Center HubSpot contract no longer blocks unconfirmed CRM mutations by default.');
  }

  return errors;
}

export function registeredHubSpotProject(
  dealId: string | number | null | undefined,
): FounderHubSpotProjectRegistration | null {
  const normalized = normalizedId(dealId);
  return FOUNDER_HUBSPOT_PROJECTS.find((project) => project.dealId === normalized) ?? null;
}

export function preflightHubSpotReadOnlySnapshot(
  snapshot: HubSpotReadOnlySnapshot,
  options: HubSpotReadOnlyPreflightOptions = {},
): HubSpotReadOnlyPreflightResult {
  const errors = registryContractErrors();
  const warnings: string[] = [
    'HubSpot pipeline and dealstage are sales taxonomy and are intentionally not treated as founder-project status.',
  ];
  const observedAccountId = normalizedId(snapshot.accountId);
  const cliAccountId = normalizedId(snapshot.cliAccountId);
  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
  const nowMs = options.now?.getTime() ?? Date.now();
  const requestedMaxAgeMs = options.maxSnapshotAgeMs ?? DEFAULT_HUBSPOT_SNAPSHOT_MAX_AGE_MS;
  const maxSnapshotAgeMs = Number.isFinite(requestedMaxAgeMs) && requestedMaxAgeMs > 0
    ? requestedMaxAgeMs
    : DEFAULT_HUBSPOT_SNAPSHOT_MAX_AGE_MS;
  const observedAtMs = parsedTimestamp(snapshot.observedAt);
  const observedAt = observedAtMs === null ? null : new Date(observedAtMs).toISOString();
  const snapshotAgeMs = observedAtMs === null ? null : nowMs - observedAtMs;
  let cliBinding: HubSpotCliBindingState = 'unverified';

  if (observedAccountId !== FOUNDER_HUBSPOT_ACCOUNT_ID) {
    errors.push(
      `HubSpot workspace must be exactly ${FOUNDER_HUBSPOT_ACCOUNT_ID}; observed ${observedAccountId || 'missing'}.`,
    );
  }

  if (observedAtMs === null) {
    errors.push('HubSpot project snapshot must include a valid observedAt timestamp.');
  } else if (snapshotAgeMs !== null && snapshotAgeMs < -MAX_FUTURE_CLOCK_SKEW_MS) {
    errors.push('HubSpot project snapshot observedAt is too far in the future to be trusted.');
  } else if (snapshotAgeMs !== null && snapshotAgeMs > maxSnapshotAgeMs) {
    errors.push(
      `HubSpot project snapshot is stale by ${snapshotAgeMs}ms; maximum allowed age is ${maxSnapshotAgeMs}ms.`,
    );
  }

  if (!Array.isArray(snapshot.records)) {
    errors.push('HubSpot project snapshot must include an array of founder-project records.');
  }

  if (snapshot.cliAccountId !== undefined && snapshot.cliAccountId !== null) {
    if (cliAccountId === FOUNDER_HUBSPOT_ACCOUNT_ID) {
      cliBinding = 'verified';
    } else {
      cliBinding = 'mismatch';
      errors.push(
        `Local HubSpot CLI binding must be exactly ${FOUNDER_HUBSPOT_ACCOUNT_ID}; observed ${cliAccountId || 'missing'}.`,
      );
    }
  } else {
    warnings.push('Local HubSpot CLI binding was not supplied; workstation account binding remains unverified.');
  }

  const expectedById = new Map(
    FOUNDER_HUBSPOT_PROJECTS.map((project) => [project.dealId, project] as const),
  );
  const observedIds = new Set<string>();
  const observedNames = new Set<string>();

  for (const record of records) {
    const recordId = normalizedId(record?.id);
    if (!recordId) {
      errors.push('HubSpot project snapshot contains a record without a usable ID.');
      continue;
    }

    if (observedIds.has(recordId)) {
      errors.push(`HubSpot project snapshot repeats deal ID ${recordId}.`);
      continue;
    }
    observedIds.add(recordId);

    const dealName = normalizedDisplayName(record?.dealname);
    const dealNameKey = normalizedNameKey(dealName);
    if (!dealName) {
      errors.push(`HubSpot deal ${recordId} is missing its deal name.`);
    } else if (observedNames.has(dealNameKey)) {
      errors.push(`HubSpot project snapshot repeats deal name ${dealName}.`);
    }
    if (dealNameKey) observedNames.add(dealNameKey);

    const expected = expectedById.get(recordId);
    if (!expected) {
      errors.push(`HubSpot deal ${recordId} is not in the audited founder-project registry.`);
      continue;
    }

    if (dealName !== expected.dealName) {
      errors.push(
        `HubSpot deal ${recordId} must be named exactly ${expected.dealName}; observed ${dealName || 'missing'}.`,
      );
    }
  }

  for (const project of FOUNDER_HUBSPOT_PROJECTS) {
    if (!observedIds.has(project.dealId)) {
      errors.push(`HubSpot founder-project snapshot is missing ${project.dealName} (${project.dealId}).`);
    }
  }

  return {
    status: errors.length === 0 ? 'ready' : 'blocked',
    mode: 'read-only',
    expectedAccountId: FOUNDER_HUBSPOT_ACCOUNT_ID,
    observedAccountId,
    observedAt,
    snapshotAgeMs,
    cliBinding,
    registeredProjectCount: FOUNDER_HUBSPOT_PROJECTS.length,
    observedProjectCount: records.length,
    mutationAllowed: false,
    allowedOperations: ['list_registered_projects', 'validate_project_snapshot'],
    errors,
    warnings,
  };
}

/**
 * Read-only founder-project adapter. It intentionally accepts an already
 * authenticated, sanitized provider snapshot and exposes no CRM mutation path.
 */
export class HubSpotReadOnlyProvider {
  readonly name = 'hubspot-read-only';
  readonly mutationAllowed = false as const;

  listRegisteredProjects(): readonly FounderHubSpotProjectRegistration[] {
    return FOUNDER_HUBSPOT_PROJECTS;
  }

  projectByDealId(
    dealId: string | number | null | undefined,
  ): FounderHubSpotProjectRegistration | null {
    return registeredHubSpotProject(dealId);
  }

  preflight(
    snapshot: HubSpotReadOnlySnapshot,
    options: HubSpotReadOnlyPreflightOptions = {},
  ): HubSpotReadOnlyPreflightResult {
    return preflightHubSpotReadOnlySnapshot(snapshot, options);
  }
}
