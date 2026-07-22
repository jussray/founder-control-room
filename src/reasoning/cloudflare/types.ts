export type CloudflareSignalStatus =
  | 'success'
  | 'pending'
  | 'warning'
  | 'failure'
  | 'unknown';

export type CloudflareSignalKind =
  | 'worker_deployment'
  | 'pages_deployment'
  | 'runtime_health'
  | 'deployment_authority'
  | 'credential'
  | 'dns'
  | 'route'
  | 'secret_binding'
  | 'release_marker'
  | 'other';

export type CloudflareReasoningOutcome =
  | 'verified'
  | 'observing'
  | 'degraded'
  | 'blocked';

export type CloudflareApprovalGate =
  | 'create_branch'
  | 'merge'
  | 'deploy'
  | 'rollback'
  | 'secrets-change'
  | 'dns-change';

export interface CloudflareSignal {
  id: string;
  kind: CloudflareSignalKind;
  status: CloudflareSignalStatus;
  source: string;
  observedAt: string;
  resourceId?: string;
  environment?: string;
  commitSha?: string;
  url?: string;
  detailCode?: string;
  authority?: 'native_git' | 'token_upload' | 'manual' | 'unknown';
}

export interface CloudflareDesiredState {
  commitSha?: string;
  workerName?: string;
  pagesProject?: string;
  productionUrl?: string;
  deploymentAuthority?: 'native_git' | 'token_upload' | 'manual' | 'unknown';
}

export interface CloudflareReasoningInput {
  projectId: string;
  projectName?: string;
  desired: CloudflareDesiredState;
  signals: CloudflareSignal[];
  now?: string;
  maxEvidenceAgeMinutes?: number;
}

export interface CloudflareReasoningAction {
  id: string;
  summary: string;
  safeToAutoRun: boolean;
  requiresFounderApproval: boolean;
  approvalGate?: CloudflareApprovalGate;
  evidenceRequired: string[];
  rollback?: string;
}

export interface CloudflareOodaReport {
  observe: string[];
  orient: string[];
  decide: string;
  act: CloudflareReasoningAction[];
  verify: string[];
}

export interface CloudflareL99Report {
  authority: string;
  provenance: string;
  stateContinuity: string;
  secretBoundary: string;
  rollback: string;
  drift: string;
}

export interface CloudflareBillGatesReport {
  bottleneck: string;
  leveragePoint: string;
  standardize: string;
  doNotScaleYet: string;
}

export interface CloudflareElonMuskReport {
  questionRequirements: string;
  deleteBeforeOptimize: string;
  simplify: string;
  accelerateFeedback: string;
  automateLast: string;
}

export interface CloudflareReasoningReport {
  version: '1.1.0';
  mode: 'read_only_reasoning';
  projectId: string;
  generatedAt: string;
  outcome: CloudflareReasoningOutcome;
  confidence: 'low' | 'medium' | 'high';
  reality: string[];
  redteamPremise: string[];
  lindy: string[];
  l99: CloudflareL99Report;
  redteamPlan: string[];
  billGates: CloudflareBillGatesReport;
  elonMusk: CloudflareElonMuskReport;
  ooda: CloudflareOodaReport;
  freshSignalIds: string[];
  staleSignalIds: string[];
  missingEvidence: string[];
  sensitiveFieldsIncluded: false;
  approvalCarryForward: false;
}
