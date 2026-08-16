import {
  PORTFOLIO_PROJECTS,
  type PortfolioProject,
} from '../config/portfolio.js';

export const STRATEGIC_SECURITY_CONTRACT = 'juss-v10/strategic-security@v1' as const;

export const STRATEGIC_SECURITY_DECISIONS = [
  'allow',
  'challenge',
  'limit',
  'divert',
  'isolate',
  'deny',
  'escalate',
] as const;

export type StrategicSecurityDecision = (typeof STRATEGIC_SECURITY_DECISIONS)[number];
export type StrategicSecurityVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface StrategicSecurityStage {
  version: StrategicSecurityVersion;
  name: string;
  objective: string;
  controls: readonly string[];
  frameworkSignals: readonly string[];
}

export interface StrategicSecurityTarget {
  projectSlug: string;
  targetVersion: StrategicSecurityVersion;
  reasons: readonly string[];
  requiredProof: readonly string[];
}

export interface StrategicSecurityProjectAudit extends StrategicSecurityTarget {
  contract: typeof STRATEGIC_SECURITY_CONTRACT;
  repository: string;
  projectName: string;
  status: PortfolioProject['status'];
  capabilities: readonly string[];
  requiredStages: readonly StrategicSecurityStage[];
}

export interface LanternPolicy {
  isolated: boolean;
  realDataAllowed: boolean;
  realSecretsAllowed: boolean;
  productionAuthorityAllowed: boolean;
  outboundAttackCapabilityAllowed: boolean;
  lateralMovementAllowed: boolean;
  malwareAllowed: boolean;
  hackBackAllowed: boolean;
  humanIdentityClaimFromNetworkSignalAllowed: boolean;
  timeBounded: boolean;
  auditLoggingRequired: boolean;
  evidenceIntegrityRequired: boolean;
}

export const STRATEGIC_SECURITY_INVARIANTS = Object.freeze({
  exactHeadRequired: true,
  rollbackRequired: true,
  evidenceReceiptRequired: true,
  providerAuthorityMustBeExplicit: true,
  leastPrivilegeRequired: true,
  secureDefaultsRequired: true,
  uiRuntimeClaimRequiresPlaywright: true,
  noHackBack: true,
  noMalware: true,
  noOutboundAttackCapability: true,
  noHumanIdentityClaimFromNetworkSignal: true,
});

export const DEFAULT_LANTERN_POLICY: Readonly<LanternPolicy> = Object.freeze({
  isolated: true,
  realDataAllowed: false,
  realSecretsAllowed: false,
  productionAuthorityAllowed: false,
  outboundAttackCapabilityAllowed: false,
  lateralMovementAllowed: false,
  malwareAllowed: false,
  hackBackAllowed: false,
  humanIdentityClaimFromNetworkSignalAllowed: false,
  timeBounded: true,
  auditLoggingRequired: true,
  evidenceIntegrityRequired: true,
});

export const STRATEGIC_SECURITY_STAGES: readonly StrategicSecurityStage[] = [
  {
    version: 1,
    name: 'Inventory and Ownership',
    objective: 'Know assets, data, dependencies, owners, environments, and authoritative sources before protection decisions.',
    controls: ['asset-inventory', 'software-inventory', 'data-classification', 'authority-owner', 'canonical-repository'],
    frameworkSignals: ['NIST-CSF-GOVERN/IDENTIFY', 'CIS-1', 'CIS-2'],
  },
  {
    version: 2,
    name: 'Identity and Secure Defaults',
    objective: 'Make identity explicit and start from secure configurations rather than permissive defaults.',
    controls: ['strong-authentication', 'secure-defaults', 'credential-lifecycle', 'service-identity', 'secret-isolation'],
    frameworkSignals: ['NIST-SP-800-207', 'CISA-ZERO-TRUST', 'CIS-4', 'CIS-5'],
  },
  {
    version: 3,
    name: 'Least Privilege and Authorization',
    objective: 'Authorize every sensitive object, property, function, and agent action at the narrowest useful scope.',
    controls: ['least-privilege', 'object-authorization', 'function-authorization', 'row-level-access', 'agent-authority-ceiling'],
    frameworkSignals: ['CIS-6', 'OWASP-API1', 'OWASP-API3', 'OWASP-API5'],
  },
  {
    version: 4,
    name: 'Application and Resource Firewall',
    objective: 'Constrain hostile or wasteful traffic before it consumes privileged application resources.',
    controls: ['waf-policy', 'rate-limits', 'body-size-limits', 'request-validation', 'resource-budgets', 'sensitive-flow-protection'],
    frameworkSignals: ['OWASP-ASVS-5', 'OWASP-API4', 'OWASP-API6', 'OWASP-API8'],
  },
  {
    version: 5,
    name: 'Telemetry and Evidence',
    objective: 'Centralize useful security events with reliable timestamps, context, retention, and evidence integrity.',
    controls: ['audit-logs', 'security-events', 'time-synchronization', 'central-correlation', 'retention', 'tamper-evident-receipts'],
    frameworkSignals: ['CIS-8', 'CIS-13', 'NIST-CSF-DETECT'],
  },
  {
    version: 6,
    name: 'Segmentation and Containment',
    objective: 'Prevent one compromised component, identity, session, or provider from automatically expanding authority.',
    controls: ['trust-boundaries', 'network-segmentation', 'service-segmentation', 'kill-switches', 'session-revocation', 'quarantine'],
    frameworkSignals: ['NIST-SP-800-207', 'CISA-ZERO-TRUST', 'CIS-12', 'CIS-13'],
  },
  {
    version: 7,
    name: 'Supply Chain and Deployment Provenance',
    objective: 'Bind released artifacts and deployments to reviewed source, controlled build paths, and verifiable provenance.',
    controls: ['exact-head-build', 'dependency-governance', 'artifact-attestation', 'sbom', 'oidc-provider-auth', 'deployment-witness'],
    frameworkSignals: ['NIST-SSDF', 'SLSA', 'GITHUB-ATTESTATIONS'],
  },
  {
    version: 8,
    name: 'Incident Response and Lantern',
    objective: 'Detect, safely divert when appropriate, contain, preserve evidence, recover, and hand off investigation without hacking back.',
    controls: ['incident-state-machine', 'lantern-decoy', 'canary-events', 'evidence-bundle', 'chain-of-custody', 'recovery-runbook'],
    frameworkSignals: ['NIST-SP-800-61R3', 'CIS-17'],
  },
  {
    version: 9,
    name: 'Adaptive Correlation and Resilience',
    objective: 'Correlate multiple signals, tune controls from verified outcomes, and resist single-signal attribution or brittle static policy.',
    controls: ['multi-signal-correlation', 'risk-scoring', 'anomaly-review', 'confidence-levels', 'bounded-adaptation', 'recovery-testing'],
    frameworkSignals: ['NIST-CSF-DETECT/RESPOND/RECOVER', 'MITRE-D3FEND'],
  },
  {
    version: 10,
    name: 'Governed Security Autonomy',
    objective: 'Compose security decisions through exact-head authority, deterministic policy, bounded automation, founder approval, verification, rollback, and receipts.',
    controls: ['capability-plan-binding', 'authority-ceilings', 'approval-binding', 'provider-capability-gates', 'proof-before-success', 'rollback-before-mutation'],
    frameworkSignals: ['JUSS-V10', 'L99', 'OODA', 'STRATEGIC-SECURITY'],
  },
] as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;

function hasAnyCapability(project: PortfolioProject, values: readonly string[]): boolean {
  return values.some((value) => project.capabilities.includes(value));
}

export function strategicSecurityTargetForProject(project: PortfolioProject): StrategicSecurityTarget {
  const targetVersion: StrategicSecurityVersion = hasAnyCapability(project, [
    'approval-engine',
    'mcp-host',
    'provider-routing',
    'companion-runtime',
  ])
    ? 10
    : hasAnyCapability(project, [
        'commerce',
        'commerce-admin',
        'private-operations',
        'shopify',
        'prompt-registry',
      ])
      ? 9
      : 8;

  const reasons = [
    `Target derives from registered capabilities: ${project.capabilities.join(', ')}.`,
    targetVersion === 10
      ? 'Project can influence privileged, provider, agentic, or sensitive user-facing behavior and therefore requires governed security autonomy.'
      : targetVersion === 9
        ? 'Project handles business, private-operations, commerce, or prompt-governance flows and therefore requires adaptive correlation plus resilience.'
        : 'Project still requires full incident, evidence, provenance, containment, and recovery coverage.',
  ];

  const requiredProof = [
    'authoritative repository and exact head',
    'security-relevant tests for changed controls',
    'rollback path for privileged mutations',
    'provider/runtime evidence for provider claims',
    ...(project.capabilities.includes('playwright') ? ['Playwright evidence for UI/runtime claims'] : []),
  ];

  return {
    projectSlug: project.slug,
    targetVersion,
    reasons,
    requiredProof,
  };
}

export function auditPortfolioStrategicSecurity(
  projects: readonly PortfolioProject[] = PORTFOLIO_PROJECTS.filter((project) => project.status === 'active'),
): StrategicSecurityProjectAudit[] {
  return projects.map((project) => {
    const target = strategicSecurityTargetForProject(project);
    return {
      contract: STRATEGIC_SECURITY_CONTRACT,
      repository: project.repository,
      projectName: project.name,
      status: project.status,
      capabilities: [...project.capabilities],
      ...target,
      requiredStages: STRATEGIC_SECURITY_STAGES.filter((stage) => stage.version <= target.targetVersion),
    };
  });
}

export function validateLanternPolicy(policy: LanternPolicy): string[] {
  const errors: string[] = [];
  if (!policy.isolated) errors.push('Lantern must remain isolated.');
  if (policy.realDataAllowed) errors.push('Lantern cannot contain real user or production data.');
  if (policy.realSecretsAllowed) errors.push('Lantern cannot contain real secrets.');
  if (policy.productionAuthorityAllowed) errors.push('Lantern cannot hold production authority.');
  if (policy.outboundAttackCapabilityAllowed) errors.push('Lantern cannot provide outbound attack capability.');
  if (policy.lateralMovementAllowed) errors.push('Lantern cannot allow lateral movement.');
  if (policy.malwareAllowed) errors.push('Lantern cannot deploy malware.');
  if (policy.hackBackAllowed) errors.push('Lantern cannot hack back.');
  if (policy.humanIdentityClaimFromNetworkSignalAllowed) {
    errors.push('Lantern cannot claim a human identity from network signals alone.');
  }
  if (!policy.timeBounded) errors.push('Lantern observation must be time bounded.');
  if (!policy.auditLoggingRequired) errors.push('Lantern requires audit logging.');
  if (!policy.evidenceIntegrityRequired) errors.push('Lantern requires evidence-integrity protection.');
  return errors;
}

export function validateStrategicSecurityExecution(input: {
  expectedHeadSha: string;
  rollback: string;
  proofRequirements: readonly string[];
  requestedAuthority: 'reason' | 'draft' | 'reversible' | 'privileged';
  approvalBound: boolean;
  providerAuthorityDeclared: boolean;
}): string[] {
  const errors: string[] = [];
  if (!FULL_SHA.test(input.expectedHeadSha.trim())) errors.push('Strategic security execution requires an exact 40-character Git SHA.');
  if (!input.rollback.trim()) errors.push('Strategic security execution requires an explicit rollback path.');
  if (input.proofRequirements.map((value) => value.trim()).filter(Boolean).length === 0) {
    errors.push('Strategic security execution requires declared proof requirements.');
  }
  if (!input.providerAuthorityDeclared && input.requestedAuthority !== 'reason') {
    errors.push('Provider authority must be declared before non-reasoning security execution.');
  }
  if (input.requestedAuthority === 'privileged' && !input.approvalBound) {
    errors.push('Privileged strategic security execution requires approval bound to the exact plan and head.');
  }
  return errors;
}

export function strategicSecurityDecision(input: {
  risk: 'low' | 'medium' | 'high' | 'critical';
  evidenceConfidence: 'low' | 'medium' | 'high';
  privilegedAction: boolean;
  containmentAvailable: boolean;
}): StrategicSecurityDecision {
  if (input.risk === 'critical') return input.containmentAvailable ? 'isolate' : 'deny';
  if (input.risk === 'high') return input.evidenceConfidence === 'high' ? 'deny' : 'challenge';
  if (input.privilegedAction && input.evidenceConfidence !== 'high') return 'challenge';
  if (input.risk === 'medium') return 'limit';
  return 'allow';
}
