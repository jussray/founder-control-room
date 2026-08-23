export type Sha256 = `sha256:${string}`;

export type WitnessClassV0 = 'code' | 'runtime' | 'product' | 'security' | 'accessibility' | 'migration' | 'other';

export type WitnessRequirementV0 = {
  id: string;
  class: WitnessClassV0;
  exactShaRequired: true;
  freshnessWindowSeconds?: number;
  scenarioFingerprint?: Sha256;
};

export type WitnessPolicyV0 = {
  kind: 'witness-policy.v0';
  policyVersion: string;
  policyHash: Sha256;
  repo: string;
  requiredWitnesses: readonly WitnessRequirementV0[];
};
