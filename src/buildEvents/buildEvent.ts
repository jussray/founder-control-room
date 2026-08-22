export const BUILD_EVENT_CONTRACT = 'fcr/build-event@v1' as const;

export type BuildEventSource =
  | 'founder'
  | 'chatgpt'
  | 'github'
  | 'supabase'
  | 'cloudflare'
  | 'product-design'
  | 'data-analytics'
  | 'playwright'
  | 'system'
  | 'other';

export type BuildEventCategory =
  | 'intent'
  | 'decision'
  | 'source'
  | 'provider'
  | 'runtime'
  | 'verification'
  | 'analytics'
  | 'artifact';

export type BuildEventPhase =
  | 'idea'
  | 'brief'
  | 'design'
  | 'build'
  | 'verify'
  | 'deploy'
  | 'observe'
  | 'learn';

export type BuildEventTruth = 'verified' | 'inferred' | 'unknown';
export type BuildEventAuthority = 'observed' | 'authorized' | 'not-authorized';
export type BuildEventStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'completed'
  | 'unknown';
export type BuildEventDecision = 'approved' | 'denied' | 'hold' | 'none';
export type BuildRuntimeEnvironment =
  | 'production'
  | 'preview'
  | 'staging'
  | 'development'
  | 'unknown';
export type BuildEventRepositoryRefKind =
  | 'branch-head'
  | 'proposal-head'
  | 'detached';

export interface BuildEventRepositoryRef {
  name: string;
  branch?: string;
  refKind?: BuildEventRepositoryRefKind;
  commitSha?: string;
  auditedCommitSha?: string;
}

export interface BuildEventProviderRef {
  name: string;
  resource?: string;
  environment?: string;
  versionId?: string;
}

export interface BuildEventRuntimeRef {
  service: string;
  environment: BuildRuntimeEnvironment;
  releaseSha?: string;
  versionId?: string;
}

export type BuildReleaseCoverageSampleSource =
  | 'analytics-engine'
  | 'provider-logs'
  | 'synthetic-probe';

export type BuildReleaseCoverageTailReason =
  | 'cached-edge-response'
  | 'long-lived-connection'
  | 'provider-rollout'
  | 'unknown';

export interface BuildReleaseCoverageRouteClass {
  name: string;
  requestCount: number;
  currentReleaseRequestCount: number;
  priorReleaseRequestCount: number;
  unclassifiedRequestCount: number;
}

export interface BuildReleaseCoverageRef {
  service: string;
  environment: BuildRuntimeEnvironment;
  releaseSha: string;
  windowStartedAt: string;
  windowEndedAt: string;
  sampleSource: BuildReleaseCoverageSampleSource;
  requestCount: number;
  currentReleaseRequestCount: number;
  priorReleaseRequestCount: number;
  unclassifiedRequestCount: number;
  routeClasses: BuildReleaseCoverageRouteClass[];
  tailReasons?: BuildReleaseCoverageTailReason[];
}

export interface BuildEventVerificationRef {
  kind: string;
  status: BuildEventStatus;
  exactCommitSha?: string;
}

export interface BuildEventDecisionRef {
  value: BuildEventDecision;
  scope?: string;
}

export interface BuildEventInput {
  eventId: string;
  occurredAt: string;
  source: BuildEventSource;
  category: BuildEventCategory;
  phase: BuildEventPhase;
  truth: BuildEventTruth;
  authority: BuildEventAuthority;
  status: BuildEventStatus;
  privacy?: 'operational-only';
  goal?: string;
  nextGate?: string;
  repository?: BuildEventRepositoryRef;
  provider?: BuildEventProviderRef;
  runtime?: BuildEventRuntimeRef;
  coverage?: BuildReleaseCoverageRef;
  verification?: BuildEventVerificationRef;
  decision?: BuildEventDecisionRef;
  evidenceUrls?: string[];
  evidenceRefs?: string[];
}

export interface BuildEvent extends Omit<BuildEventInput, 'privacy' | 'evidenceUrls' | 'evidenceRefs'> {
  contract: typeof BUILD_EVENT_CONTRACT;
  privacy: 'operational-only';
  evidenceUrls: string[];
  evidenceRefs: string[];
}

const EXACT_SHA = /^[0-9a-f]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const EVENT_ID = /^[A-Za-z0-9._:@/-]{1,200}$/;
const ROUTE_CLASS = /^[a-z][a-z0-9-]{0,79}$/;
const MAX_COVERAGE_COUNT = 1_000_000_000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const SOURCES: readonly BuildEventSource[] = [
  'founder', 'chatgpt', 'github', 'supabase', 'cloudflare', 'product-design',
  'data-analytics', 'playwright', 'system', 'other',
];
const CATEGORIES: readonly BuildEventCategory[] = [
  'intent', 'decision', 'source', 'provider', 'runtime', 'verification', 'analytics', 'artifact',
];
const PHASES: readonly BuildEventPhase[] = [
  'idea', 'brief', 'design', 'build', 'verify', 'deploy', 'observe', 'learn',
];
const TRUTHS: readonly BuildEventTruth[] = ['verified', 'inferred', 'unknown'];
const AUTHORITIES: readonly BuildEventAuthority[] = ['observed', 'authorized', 'not-authorized'];
const STATUSES: readonly BuildEventStatus[] = [
  'pending', 'running', 'passed', 'failed', 'blocked', 'completed', 'unknown',
];
const REPOSITORY_REF_KINDS: readonly BuildEventRepositoryRefKind[] = [
  'branch-head', 'proposal-head', 'detached',
];
const COVERAGE_SAMPLE_SOURCES: readonly BuildReleaseCoverageSampleSource[] = [
  'analytics-engine', 'provider-logs', 'synthetic-probe',
];
const COVERAGE_TAIL_REASONS: readonly BuildReleaseCoverageTailReason[] = [
  'cached-edge-response', 'long-lived-connection', 'provider-rollout', 'unknown',
];

function boundedText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARACTERS, ' ').trim().slice(0, maximumLength);
}

function normalizedSha(value: unknown): string | undefined {
  const candidate = boundedText(value, 40);
  return EXACT_SHA.test(candidate) ? candidate.toLowerCase() : undefined;
}

function normalizedEvidenceUrl(value: unknown): string | null {
  const candidate = boundedText(value, 2_048);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function uniqueStrings(values: readonly unknown[] | undefined, maximumLength: number): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => boundedText(value, maximumLength))
    .filter(Boolean);
  return [...new Set(normalized)].sort();
}

function normalizeEvidenceUrls(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map(normalizedEvidenceUrl)
    .filter((value): value is string => Boolean(value));
  return [...new Set(normalized)].sort();
}

function validTimestamp(value: unknown): boolean {
  const candidate = boundedText(value, 80);
  return Boolean(candidate) && !Number.isNaN(Date.parse(candidate));
}

function validCoverageCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_COVERAGE_COUNT;
}

function validStatus(value: unknown): value is BuildEventStatus {
  return STATUSES.includes(value as BuildEventStatus);
}

export function validateBuildEvent(input: BuildEventInput): string[] {
  const errors: string[] = [];
  const eventId = boundedText(input.eventId, 200);
  const evidenceUrls = normalizeEvidenceUrls(input.evidenceUrls);
  const evidenceRefs = uniqueStrings(input.evidenceRefs, 300);

  if (!EVENT_ID.test(eventId)) errors.push('eventId must be a bounded operational identifier');
  if (!validTimestamp(input.occurredAt)) errors.push('occurredAt must be an ISO-compatible timestamp');
  if (!SOURCES.includes(input.source)) errors.push('source is invalid');
  if (!CATEGORIES.includes(input.category)) errors.push('category is invalid');
  if (!PHASES.includes(input.phase)) errors.push('phase is invalid');
  if (!TRUTHS.includes(input.truth)) errors.push('truth is invalid');
  if (!AUTHORITIES.includes(input.authority)) errors.push('authority is invalid');
  if (!validStatus(input.status)) errors.push('status is invalid');
  if (input.privacy !== undefined && input.privacy !== 'operational-only') {
    errors.push('privacy must be operational-only');
  }

  if (input.goal !== undefined && !boundedText(input.goal, 300)) errors.push('goal is invalid');
  if (input.nextGate !== undefined && !boundedText(input.nextGate, 300)) errors.push('nextGate is invalid');

  if (input.repository) {
    const name = boundedText(input.repository.name, 200);
    if (!REPOSITORY.test(name)) errors.push('repository.name must be owner/repository');
    if (input.repository.branch !== undefined && !boundedText(input.repository.branch, 255)) {
      errors.push('repository.branch is invalid');
    }
    if (input.repository.refKind !== undefined && !REPOSITORY_REF_KINDS.includes(input.repository.refKind)) {
      errors.push('repository.refKind is invalid');
    }
    if (input.repository.refKind === 'branch-head' && !boundedText(input.repository.branch, 255)) {
      errors.push('branch-head repository refs require a branch');
    }
    if (input.repository.refKind === 'proposal-head' && !boundedText(input.repository.branch, 255)) {
      errors.push('proposal-head repository refs require a branch');
    }
    if (input.repository.commitSha !== undefined && !normalizedSha(input.repository.commitSha)) {
      errors.push('repository.commitSha must be an exact 40-character SHA');
    }
    if (input.repository.auditedCommitSha !== undefined && !normalizedSha(input.repository.auditedCommitSha)) {
      errors.push('repository.auditedCommitSha must be an exact 40-character SHA');
    }
  }

  if (input.provider) {
    if (!boundedText(input.provider.name, 100)) errors.push('provider.name is invalid');
    if (input.provider.resource !== undefined && !boundedText(input.provider.resource, 200)) {
      errors.push('provider.resource is invalid');
    }
    if (input.provider.environment !== undefined && !boundedText(input.provider.environment, 100)) {
      errors.push('provider.environment is invalid');
    }
    if (input.provider.versionId !== undefined && !boundedText(input.provider.versionId, 200)) {
      errors.push('provider.versionId is invalid');
    }
  }

  if (input.runtime) {
    if (input.category !== 'runtime') errors.push('runtime payload requires category=runtime');
    if (!boundedText(input.runtime.service, 160)) errors.push('runtime.service is invalid');
    if (!['production', 'preview', 'staging', 'development', 'unknown'].includes(input.runtime.environment)) {
      errors.push('runtime.environment is invalid');
    }
    if (input.runtime.releaseSha !== undefined && !normalizedSha(input.runtime.releaseSha)) {
      errors.push('runtime.releaseSha must be an exact 40-character SHA');
    }
    if (input.runtime.versionId !== undefined && !boundedText(input.runtime.versionId, 200)) {
      errors.push('runtime.versionId is invalid');
    }
  }


  if (input.coverage !== undefined) {
    const coverage = input.coverage;
    if (!coverage || typeof coverage !== 'object') {
      errors.push('coverage payload is invalid');
    } else {
      if (input.category !== 'analytics') errors.push('coverage payload requires category=analytics');
      if (input.phase !== 'observe') errors.push('coverage payload requires phase=observe');
      if (!boundedText(coverage.service, 160)) errors.push('coverage.service is invalid');
      if (!['production', 'preview', 'staging', 'development', 'unknown'].includes(coverage.environment)) {
        errors.push('coverage.environment is invalid');
      }
      if (!normalizedSha(coverage.releaseSha)) {
        errors.push('coverage.releaseSha must be an exact 40-character SHA');
      }
      if (!validTimestamp(coverage.windowStartedAt) || !validTimestamp(coverage.windowEndedAt)) {
        errors.push('coverage window timestamps must be ISO-compatible');
      } else if (Date.parse(coverage.windowEndedAt) <= Date.parse(coverage.windowStartedAt)) {
        errors.push('coverage.windowEndedAt must be after coverage.windowStartedAt');
      }
      if (!COVERAGE_SAMPLE_SOURCES.includes(coverage.sampleSource)) {
        errors.push('coverage.sampleSource is invalid');
      }

      const counts = [
        coverage.requestCount,
        coverage.currentReleaseRequestCount,
        coverage.priorReleaseRequestCount,
        coverage.unclassifiedRequestCount,
      ];
      if (!counts.every(validCoverageCount)) {
        errors.push('coverage counts must be bounded non-negative integers');
      } else if (
        coverage.currentReleaseRequestCount
        + coverage.priorReleaseRequestCount
        + coverage.unclassifiedRequestCount
        !== coverage.requestCount
      ) {
        errors.push('coverage release counts must sum to coverage.requestCount');
      }

      if (!Array.isArray(coverage.routeClasses) || coverage.routeClasses.length === 0 || coverage.routeClasses.length > 20) {
        errors.push('coverage.routeClasses must contain 1 to 20 aggregate route classes');
      } else {
        const names = new Set<string>();
        let routeRequestCount = 0;
        let routeCurrentReleaseRequestCount = 0;
        let routePriorReleaseRequestCount = 0;
        let routeUnclassifiedRequestCount = 0;

        coverage.routeClasses.forEach((routeClass, index) => {
          const name = boundedText(routeClass?.name, 80);
          if (!ROUTE_CLASS.test(name) || names.has(name)) {
            errors.push(`coverage.routeClasses[${index}].name is invalid`);
          }
          names.add(name);

          const routeCounts = [
            routeClass?.requestCount,
            routeClass?.currentReleaseRequestCount,
            routeClass?.priorReleaseRequestCount,
            routeClass?.unclassifiedRequestCount,
          ];
          if (!routeCounts.every(validCoverageCount)) {
            errors.push(`coverage.routeClasses[${index}] counts must be bounded non-negative integers`);
            return;
          }
          if (
            routeClass.currentReleaseRequestCount
            + routeClass.priorReleaseRequestCount
            + routeClass.unclassifiedRequestCount
            !== routeClass.requestCount
          ) {
            errors.push(`coverage.routeClasses[${index}] release counts must sum to route requestCount`);
          }
          routeRequestCount += routeClass.requestCount;
          routeCurrentReleaseRequestCount += routeClass.currentReleaseRequestCount;
          routePriorReleaseRequestCount += routeClass.priorReleaseRequestCount;
          routeUnclassifiedRequestCount += routeClass.unclassifiedRequestCount;
        });

        if (counts.every(validCoverageCount) && (
          routeRequestCount !== coverage.requestCount
          || routeCurrentReleaseRequestCount !== coverage.currentReleaseRequestCount
          || routePriorReleaseRequestCount !== coverage.priorReleaseRequestCount
          || routeUnclassifiedRequestCount !== coverage.unclassifiedRequestCount
        )) {
          errors.push('coverage.routeClasses must sum to aggregate coverage counts');
        }
      }

      const tailReasons = Array.isArray(coverage.tailReasons) ? coverage.tailReasons : [];
      if (coverage.tailReasons !== undefined && !Array.isArray(coverage.tailReasons)) {
        errors.push('coverage.tailReasons is invalid');
      }
      if (tailReasons.length > 4 || new Set(tailReasons).size !== tailReasons.length) {
        errors.push('coverage.tailReasons must be unique and limited to four entries');
      }
      if (tailReasons.some((reason) => !COVERAGE_TAIL_REASONS.includes(reason))) {
        errors.push('coverage.tailReasons contains an invalid reason');
      }
      if (validCoverageCount(coverage.priorReleaseRequestCount)
        && coverage.priorReleaseRequestCount > 0
        && tailReasons.length === 0) {
        errors.push('coverage prior-release traffic requires a tail reason');
      }
      if (coverage.sampleSource === 'synthetic-probe' && input.truth === 'verified') {
        errors.push('synthetic coverage cannot be verified');
      }
      if (input.status === 'passed' && input.truth !== 'verified') {
        errors.push('passed coverage requires verified truth');
      }
      if (input.status === 'passed' && coverage.sampleSource === 'synthetic-probe') {
        errors.push('synthetic coverage cannot pass');
      }
      if (input.status === 'passed' && tailReasons.includes('unknown')) {
        errors.push('passed coverage cannot retain an unknown tail');
      }
    }
  }

  if (input.verification) {
    if (input.category !== 'verification') errors.push('verification payload requires category=verification');
    if (!boundedText(input.verification.kind, 200)) errors.push('verification.kind is invalid');
    if (!validStatus(input.verification.status)) errors.push('verification.status is invalid');
    if (input.verification.exactCommitSha !== undefined && !normalizedSha(input.verification.exactCommitSha)) {
      errors.push('verification.exactCommitSha must be an exact 40-character SHA');
    }
  }

  if (input.decision) {
    if (!['approved', 'denied', 'hold', 'none'].includes(input.decision.value)) {
      errors.push('decision.value is invalid');
    }
    if (input.decision.scope !== undefined && !boundedText(input.decision.scope, 300)) {
      errors.push('decision.scope is invalid');
    }
    if (input.category !== 'decision') errors.push('decision payload requires category=decision');
  }

  if (input.category === 'decision' && !input.decision) {
    errors.push('decision category requires a decision payload');
  }
  if (input.category === 'runtime' && !input.runtime) {
    errors.push('runtime category requires a runtime payload');
  }
  if (input.category === 'verification' && !input.verification) {
    errors.push('verification category requires a verification payload');
  }

  if (input.authority === 'authorized') {
    if (input.source !== 'founder' || input.category !== 'decision' || !input.decision) {
      errors.push('authorized authority is reserved for founder decision events');
    }
  }

  if (input.truth === 'verified' && evidenceUrls.length === 0 && evidenceRefs.length === 0) {
    errors.push('verified events require at least one evidence URL or evidence reference');
  }

  if (Array.isArray(input.evidenceUrls) && input.evidenceUrls.length !== evidenceUrls.length) {
    errors.push('evidenceUrls must contain unique safe HTTPS URLs without embedded credentials');
  }
  if (Array.isArray(input.evidenceRefs) && input.evidenceRefs.length !== evidenceRefs.length) {
    errors.push('evidenceRefs must contain unique bounded operational references');
  }
  if ((input.evidenceUrls?.length ?? 0) > 20) errors.push('evidenceUrls is limited to 20 entries');
  if ((input.evidenceRefs?.length ?? 0) > 20) errors.push('evidenceRefs is limited to 20 entries');

  return errors;
}

export function createBuildEvent(input: BuildEventInput): BuildEvent {
  const errors = validateBuildEvent(input);
  if (errors.length > 0) throw new Error(errors.join('; '));

  const repository = input.repository
    ? {
        name: boundedText(input.repository.name, 200),
        ...(input.repository.branch !== undefined
          ? { branch: boundedText(input.repository.branch, 255) }
          : {}),
        ...(input.repository.refKind !== undefined
          ? { refKind: input.repository.refKind }
          : {}),
        ...(input.repository.commitSha !== undefined
          ? { commitSha: normalizedSha(input.repository.commitSha)! }
          : {}),
        ...(input.repository.auditedCommitSha !== undefined
          ? { auditedCommitSha: normalizedSha(input.repository.auditedCommitSha)! }
          : {}),
      }
    : undefined;

  const provider = input.provider
    ? {
        name: boundedText(input.provider.name, 100),
        ...(input.provider.resource !== undefined
          ? { resource: boundedText(input.provider.resource, 200) }
          : {}),
        ...(input.provider.environment !== undefined
          ? { environment: boundedText(input.provider.environment, 100) }
          : {}),
        ...(input.provider.versionId !== undefined
          ? { versionId: boundedText(input.provider.versionId, 200) }
          : {}),
      }
    : undefined;

  const runtime = input.runtime
    ? {
        service: boundedText(input.runtime.service, 160),
        environment: input.runtime.environment,
        ...(input.runtime.releaseSha !== undefined
          ? { releaseSha: normalizedSha(input.runtime.releaseSha)! }
          : {}),
        ...(input.runtime.versionId !== undefined
          ? { versionId: boundedText(input.runtime.versionId, 200) }
          : {}),
      }
    : undefined;


  const coverage = input.coverage
    ? {
        service: boundedText(input.coverage.service, 160),
        environment: input.coverage.environment,
        releaseSha: normalizedSha(input.coverage.releaseSha)!,
        windowStartedAt: new Date(input.coverage.windowStartedAt).toISOString(),
        windowEndedAt: new Date(input.coverage.windowEndedAt).toISOString(),
        sampleSource: input.coverage.sampleSource,
        requestCount: input.coverage.requestCount,
        currentReleaseRequestCount: input.coverage.currentReleaseRequestCount,
        priorReleaseRequestCount: input.coverage.priorReleaseRequestCount,
        unclassifiedRequestCount: input.coverage.unclassifiedRequestCount,
        routeClasses: input.coverage.routeClasses.map((routeClass) => ({
          name: boundedText(routeClass.name, 80),
          requestCount: routeClass.requestCount,
          currentReleaseRequestCount: routeClass.currentReleaseRequestCount,
          priorReleaseRequestCount: routeClass.priorReleaseRequestCount,
          unclassifiedRequestCount: routeClass.unclassifiedRequestCount,
        })),
        ...(input.coverage.tailReasons && input.coverage.tailReasons.length > 0
          ? { tailReasons: [...input.coverage.tailReasons].sort() }
          : {}),
      }
    : undefined;

  const verification = input.verification
    ? {
        kind: boundedText(input.verification.kind, 200),
        status: input.verification.status,
        ...(input.verification.exactCommitSha !== undefined
          ? { exactCommitSha: normalizedSha(input.verification.exactCommitSha)! }
          : {}),
      }
    : undefined;

  const decision = input.decision
    ? {
        value: input.decision.value,
        ...(input.decision.scope !== undefined
          ? { scope: boundedText(input.decision.scope, 300) }
          : {}),
      }
    : undefined;

  return {
    contract: BUILD_EVENT_CONTRACT,
    eventId: boundedText(input.eventId, 200),
    occurredAt: new Date(input.occurredAt).toISOString(),
    source: input.source,
    category: input.category,
    phase: input.phase,
    truth: input.truth,
    authority: input.authority,
    status: input.status,
    privacy: 'operational-only',
    ...(input.goal !== undefined ? { goal: boundedText(input.goal, 300) } : {}),
    ...(input.nextGate !== undefined ? { nextGate: boundedText(input.nextGate, 300) } : {}),
    ...(repository ? { repository } : {}),
    ...(provider ? { provider } : {}),
    ...(runtime ? { runtime } : {}),
    ...(coverage ? { coverage } : {}),
    ...(verification ? { verification } : {}),
    ...(decision ? { decision } : {}),
    evidenceUrls: normalizeEvidenceUrls(input.evidenceUrls),
    evidenceRefs: uniqueStrings(input.evidenceRefs, 300),
  };
}
