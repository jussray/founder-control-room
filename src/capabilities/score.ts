export type CapabilityStatus =
  | 'verified'
  | 'partial'
  | 'unverified'
  | 'blocked'
  | 'not_applicable';

export interface CapabilityClaim {
  id: string;
  status: CapabilityStatus;
  evidence_ids?: string[];
}

export interface CapabilityContract {
  capabilities: CapabilityClaim[];
}

const STATUS_WEIGHT: Record<CapabilityStatus, number | null> = {
  verified: 1,
  partial: 0.5,
  unverified: 0.2,
  blocked: 0,
  not_applicable: null,
};

export interface CapabilityScore {
  score: number;
  applicable: number;
  verified: number;
  partial: number;
  unverified: number;
  blocked: number;
  notApplicable: number;
}

export function scoreCapabilityContract(contract: CapabilityContract): CapabilityScore {
  let weighted = 0;
  let applicable = 0;
  let verified = 0;
  let partial = 0;
  let unverified = 0;
  let blocked = 0;
  let notApplicable = 0;

  for (const capability of contract.capabilities) {
    const weight = STATUS_WEIGHT[capability.status];
    if (weight === null) {
      notApplicable += 1;
      continue;
    }

    applicable += 1;
    weighted += weight;

    if (capability.status === 'verified') verified += 1;
    if (capability.status === 'partial') partial += 1;
    if (capability.status === 'unverified') unverified += 1;
    if (capability.status === 'blocked') blocked += 1;
  }

  return {
    score: applicable === 0 ? 0 : Math.round((weighted / applicable) * 100),
    applicable,
    verified,
    partial,
    unverified,
    blocked,
    notApplicable,
  };
}
