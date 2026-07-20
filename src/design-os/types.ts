export type DesignArtifactState =
  | "unregistered"
  | "registered"
  | "draft"
  | "review_ready"
  | "approved";

export type ImplementationState =
  | "not_started"
  | "in_progress"
  | "locally_verified"
  | "exact_content_verified"
  | "exact_head_verified"
  | "deployed_observed";

export type CodeConnectState =
  | "not_eligible"
  | "not_configured"
  | "partial"
  | "complete";

export type DriftState = "unknown" | "aligned" | "drift_detected" | "stale";
export type DesignDataBoundary = "public" | "private" | "restricted";

export interface FigmaRegistration {
  fileKey: string;
  fileName: string;
  url: string;
  registeredAt: string;
  primaryNodeId?: string;
}

export interface VerificationReference {
  kind:
    | "local_test"
    | "exact_content"
    | "exact_head"
    | "deployment_observation"
    | "manual_review";
  label: string;
  url?: string;
  sha?: string;
}

export interface DesignTruthBoundaries {
  designIsNotRuntimeProof: true;
  approvalDoesNotAuthorizeImplementation: true;
  implementationDoesNotAuthorizeDeployment: true;
  syntheticOrSanitizedDataOnly: true;
}

export interface PortfolioDesignProject {
  slug: string;
  name: string;
  repoIdentifier: string;
  runtimeProfile: string;
  dataBoundary: DesignDataBoundary;
  capabilityBranch: string;
  capabilityPrUrl: string;
  repositoryProfilePath: ".figma/repository-profile.json";
  figma?: FigmaRegistration;
  designState: DesignArtifactState;
  implementationState: ImplementationState;
  codeConnectState: CodeConnectState;
  codeConnectMappings: number;
  driftState: DriftState;
  verification: readonly VerificationReference[];
  truthBoundaries: DesignTruthBoundaries;
  notes: readonly string[];
}

export interface PortfolioDesignSummary {
  totalProjects: number;
  registeredFigmaFiles: number;
  designReadyProjects: number;
  exactHeadVerifiedProjects: number;
  deployedObservedProjects: number;
  codeConnectCompleteProjects: number;
  driftDetectedProjects: number;
  unregisteredProjects: number;
  truthState: "valid" | "invalid";
}

export interface RegistryValidationResult {
  ok: boolean;
  errors: string[];
}
