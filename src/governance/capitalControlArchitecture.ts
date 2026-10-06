export const CAPITAL_CONTROL_CONTRACT = 'fcr/capital-control-architecture@v1' as const;

export type CapitalArchitectureState = 'design_only' | 'legally_verified';
export type InvestmentLane = 'portfolio' | 'project';
export type CapitalDecision = 'allow' | 'reconfirm' | 'deny';

export type CapitalAction =
  | 'claim-parent-formed'
  | 'claim-project-subsidiary'
  | 'issue-security'
  | 'publish-offering'
  | 'transfer-core-ip'
  | 'modify-founder-control-protections'
  | 'surrender-founder-control'
  | 'grant-investor-operational-authority';

export type CapitalEvidenceClaim =
  | 'founder_approval_verified'
  | 'issuer_identity_verified'
  | 'legal_entity_verified'
  | 'governing_documents_verified'
  | 'cap_table_verified'
  | 'security_terms_verified'
  | 'post_change_control_verified'
  | 'project_ownership_boundary_verified'
  | 'parent_or_founder_control_verified'
  | 'asset_ownership_verified'
  | 'transfer_instrument_verified'
  | 'offering_compliance_path_verified'
  | 'registered_intermediary_verified_when_required'
  | 'disclosure_packet_verified';

export interface CapitalActionRequest {
  action: CapitalAction;
  lane?: InvestmentLane;
  architectureState?: CapitalArchitectureState;
  verifiedClaims?: readonly CapitalEvidenceClaim[];
}

export interface CapitalActionVerdict {
  decision: CapitalDecision;
  missingClaims: CapitalEvidenceClaim[];
  reasons: string[];
}

export const CAPITAL_CONTROL_ARCHITECTURE = {
  contract: CAPITAL_CONTROL_CONTRACT,
  state: 'design_only' as CapitalArchitectureState,
  authorityRepository: 'jussray/founder-control-room',
  legalReality: {
    parentEntity: 'UNKNOWN',
    projectSubsidiaries: 'UNKNOWN',
    shareClasses: 'UNKNOWN',
    capTable: 'UNKNOWN',
    valuation: 'UNKNOWN',
    offering: 'NOT_AUTHORIZED',
  },
  investmentLanes: [
    {
      id: 'portfolio' as InvestmentLane,
      target: 'future verified portfolio parent issuer',
      economics: 'only assets and subsidiaries proven to be owned by that issuer',
      control: 'founder-control protections must be proven in executed governing documents',
    },
    {
      id: 'project' as InvestmentLane,
      target: 'future verified project-specific issuer',
      economics: 'that issuer only, without implied ownership of the rest of the portfolio',
      control: 'parent or founder control must be independently proven for that project issuer',
    },
  ],
  invariants: [
    'economic ownership never grants repository, deployment, provider, credential, or product execution authority',
    'repository membership does not prove corporate ownership or subsidiary status',
    'share classes, voting ratios, board rights, valuation, and offering terms remain unknown until executed documents prove them',
    'a project-level raise must not silently transfer portfolio IP or another project economic interest',
    'founder-control surrender is never an automated capital action',
    'no public offering may be represented as live before the issuer, compliance path, required intermediary, and disclosure packet are independently verified',
  ],
} as const;

const HARD_BLOCKED_ACTIONS: ReadonlySet<CapitalAction> = new Set([
  'surrender-founder-control',
  'grant-investor-operational-authority',
]);

const LEGALLY_VERIFIED_ACTIONS: ReadonlySet<CapitalAction> = new Set([
  'issue-security',
  'publish-offering',
  'transfer-core-ip',
  'modify-founder-control-protections',
]);

const BASE_REQUIRED_CLAIMS: Readonly<Record<CapitalAction, readonly CapitalEvidenceClaim[]>> = {
  'claim-parent-formed': ['legal_entity_verified', 'governing_documents_verified'],
  'claim-project-subsidiary': [
    'legal_entity_verified',
    'governing_documents_verified',
    'project_ownership_boundary_verified',
    'parent_or_founder_control_verified',
  ],
  'issue-security': [
    'founder_approval_verified',
    'issuer_identity_verified',
    'governing_documents_verified',
    'cap_table_verified',
    'security_terms_verified',
    'post_change_control_verified',
  ],
  'publish-offering': [
    'founder_approval_verified',
    'issuer_identity_verified',
    'governing_documents_verified',
    'cap_table_verified',
    'security_terms_verified',
    'post_change_control_verified',
    'offering_compliance_path_verified',
    'registered_intermediary_verified_when_required',
    'disclosure_packet_verified',
  ],
  'transfer-core-ip': [
    'founder_approval_verified',
    'asset_ownership_verified',
    'transfer_instrument_verified',
    'post_change_control_verified',
  ],
  'modify-founder-control-protections': [
    'founder_approval_verified',
    'governing_documents_verified',
    'post_change_control_verified',
  ],
  'surrender-founder-control': [],
  'grant-investor-operational-authority': [],
};

export function capitalRequiredClaims(
  action: CapitalAction,
  lane: InvestmentLane = 'portfolio',
): CapitalEvidenceClaim[] {
  const required = [...BASE_REQUIRED_CLAIMS[action]];
  if (lane === 'project' && ['issue-security', 'publish-offering'].includes(action)) {
    required.push('project_ownership_boundary_verified', 'parent_or_founder_control_verified');
  }
  return [...new Set(required)];
}

export function evaluateCapitalAction(request: CapitalActionRequest): CapitalActionVerdict {
  const lane = request.lane ?? 'portfolio';
  const state = request.architectureState ?? CAPITAL_CONTROL_ARCHITECTURE.state;

  if (HARD_BLOCKED_ACTIONS.has(request.action)) {
    return {
      decision: 'deny',
      missingClaims: [],
      reasons: [`capital action is hard blocked by founder-control invariant: ${request.action}`],
    };
  }

  if (LEGALLY_VERIFIED_ACTIONS.has(request.action) && state !== 'legally_verified') {
    return {
      decision: 'deny',
      missingClaims: [],
      reasons: ['capital architecture is design_only; executed legal structure has not been verified'],
    };
  }

  if (request.action === 'claim-project-subsidiary' && lane !== 'project') {
    return {
      decision: 'deny',
      missingClaims: [],
      reasons: ['project subsidiary claims must use the project investment lane'],
    };
  }

  const required = capitalRequiredClaims(request.action, lane);
  const verified = new Set(request.verifiedClaims ?? []);
  const missingClaims = required.filter((claim) => !verified.has(claim));

  if (missingClaims.length > 0) {
    return {
      decision: 'reconfirm',
      missingClaims,
      reasons: [`missing capital evidence: ${missingClaims.join(', ')}`],
    };
  }

  return {
    decision: 'allow',
    missingClaims: [],
    reasons: ['all registered capital-control evidence requirements are satisfied'],
  };
}
