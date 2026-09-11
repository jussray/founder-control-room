import {
  CRYPTOGRAPHIC_INVENTORY,
  CRYPTOGRAPHIC_REVIEW_REQUIRED,
  auditCryptographicInventoryCoverage,
  type CryptographicInventoryEntry,
  type CryptographicReviewRequired,
} from './cryptographicInventory.js';
import {
  PROVIDER_PQC_CAPABILITIES,
  auditProviderPqcCapabilities,
  type ProviderPqcCapabilityEntry,
} from './providerPqcCapability.js';
import {
  DEFAULT_LANTERN_POLICY,
  STRATEGIC_SECURITY_INVARIANTS,
  STRATEGIC_SECURITY_STAGES,
  auditPortfolioStrategicSecurity,
  validateLanternPolicy,
  type StrategicSecurityVersion,
} from './strategicSecurity.js';

export const SECURITY_POSTURE_CONTRACT = 'juss-v10/security-posture@v1' as const;

export type SecurityAssessmentState = 'target_only';

export interface SecurityPostureProject {
  slug: string;
  name: string;
  repository: string;
  targetVersion: StrategicSecurityVersion;
  assessmentState: SecurityAssessmentState;
  provenVersion: null;
  capabilities: readonly string[];
  reasons: readonly string[];
  requiredProof: readonly string[];
  requiredStageCount: number;
  requiredControlCount: number;
}

export interface SecurityPostureSummary {
  totalProjects: number;
  v8Targets: number;
  v9Targets: number;
  v10Targets: number;
  playwrightRequiredProjects: number;
  totalStageObligations: number;
  uniqueControlCount: number;
  frameworkSignalCount: number;
  cryptographicInventoryEntries: number;
  cryptographicReviewRequiredProjects: number;
  publicKeyMigrationEntries: number;
  providerPqcEvidenceEntries: number;
  providerPqcCurrentEntries: number;
  providerPqcPlannedEntries: number;
  providerPqcUnsupportedEntries: number;
  providerPqcUnknownEntries: number;
  provenProjects: 0;
}

export interface SecurityPostureSnapshot {
  contract: typeof SECURITY_POSTURE_CONTRACT;
  summary: SecurityPostureSummary;
  stages: typeof STRATEGIC_SECURITY_STAGES;
  projects: SecurityPostureProject[];
  invariants: typeof STRATEGIC_SECURITY_INVARIANTS;
  cryptography: {
    inventory: readonly CryptographicInventoryEntry[];
    reviewRequired: readonly CryptographicReviewRequired[];
    coverage: ReturnType<typeof auditCryptographicInventoryCoverage>;
    providerPqcEvidence: {
      entries: readonly ProviderPqcCapabilityEntry[];
      summary: ReturnType<typeof auditProviderPqcCapabilities>;
    };
  };
  lantern: {
    policy: typeof DEFAULT_LANTERN_POLICY;
    valid: boolean;
    errors: string[];
  };
  truthBoundaries: {
    targetVersionIsNotCurrentMaturity: true;
    frameworkMappingIsNotCertification: true;
    providerClaimsRequireRuntimeEvidence: true;
    providerRoadmapIsNotRuntimeProof: true;
    cryptographicInventoryIsObservationNotQuantumSafety: true;
    securityPostureIsReadOnly: true;
    analyticsAreAggregateAndPrivacySafe: true;
    noHumanIdentityClaimFromNetworkSignal: true;
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function buildSecurityPostureSnapshot(): SecurityPostureSnapshot {
  const audits = auditPortfolioStrategicSecurity();
  const projects: SecurityPostureProject[] = audits.map((audit) => ({
    slug: audit.projectSlug,
    name: audit.projectName,
    repository: audit.repository,
    targetVersion: audit.targetVersion,
    assessmentState: 'target_only',
    provenVersion: null,
    capabilities: [...audit.capabilities],
    reasons: [...audit.reasons],
    requiredProof: [...audit.requiredProof],
    requiredStageCount: audit.requiredStages.length,
    requiredControlCount: unique(audit.requiredStages.flatMap((stage) => stage.controls)).length,
  }));

  const uniqueControls = unique(STRATEGIC_SECURITY_STAGES.flatMap((stage) => stage.controls));
  const frameworkSignals = unique(STRATEGIC_SECURITY_STAGES.flatMap((stage) => stage.frameworkSignals));
  const lanternErrors = validateLanternPolicy({ ...DEFAULT_LANTERN_POLICY });
  const cryptoCoverage = auditCryptographicInventoryCoverage();
  const providerPqcSummary = auditProviderPqcCapabilities();

  return {
    contract: SECURITY_POSTURE_CONTRACT,
    summary: {
      totalProjects: projects.length,
      v8Targets: projects.filter((project) => project.targetVersion === 8).length,
      v9Targets: projects.filter((project) => project.targetVersion === 9).length,
      v10Targets: projects.filter((project) => project.targetVersion === 10).length,
      playwrightRequiredProjects: projects.filter((project) => project.requiredProof.includes('Playwright evidence for UI/runtime claims')).length,
      totalStageObligations: projects.reduce((sum, project) => sum + project.requiredStageCount, 0),
      uniqueControlCount: uniqueControls.length,
      frameworkSignalCount: frameworkSignals.length,
      cryptographicInventoryEntries: cryptoCoverage.inventoryEntryCount,
      cryptographicReviewRequiredProjects: cryptoCoverage.reviewRequiredProjectCount,
      publicKeyMigrationEntries: cryptoCoverage.publicKeyMigrationEntryCount,
      providerPqcEvidenceEntries: providerPqcSummary.entryCount,
      providerPqcCurrentEntries: providerPqcSummary.currentCount,
      providerPqcPlannedEntries: providerPqcSummary.plannedCount,
      providerPqcUnsupportedEntries: providerPqcSummary.unsupportedCount,
      providerPqcUnknownEntries: providerPqcSummary.unknownCount,
      provenProjects: 0,
    },
    stages: STRATEGIC_SECURITY_STAGES,
    projects,
    invariants: STRATEGIC_SECURITY_INVARIANTS,
    cryptography: {
      inventory: CRYPTOGRAPHIC_INVENTORY,
      reviewRequired: CRYPTOGRAPHIC_REVIEW_REQUIRED,
      coverage: cryptoCoverage,
      providerPqcEvidence: {
        entries: PROVIDER_PQC_CAPABILITIES,
        summary: providerPqcSummary,
      },
    },
    lantern: {
      policy: DEFAULT_LANTERN_POLICY,
      valid: lanternErrors.length === 0,
      errors: lanternErrors,
    },
    truthBoundaries: {
      targetVersionIsNotCurrentMaturity: true,
      frameworkMappingIsNotCertification: true,
      providerClaimsRequireRuntimeEvidence: true,
      providerRoadmapIsNotRuntimeProof: true,
      cryptographicInventoryIsObservationNotQuantumSafety: true,
      securityPostureIsReadOnly: true,
      analyticsAreAggregateAndPrivacySafe: true,
      noHumanIdentityClaimFromNetworkSignal: true,
    },
  };
}
