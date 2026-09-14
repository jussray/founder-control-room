export interface CapabilityManifest {
  provider: string;
  capabilities: {
    read: string[];
    propose: string[];
    stage: string[];
    execute: string[];
    verify: string[];
  };
  constraints: {
    noChainedWrites: boolean;
    maxRetries: number;
    timeoutMs: number;
    costCeilingUsd: number;
  };
}

export function manifestAllows(
  manifest: CapabilityManifest,
  phase: keyof CapabilityManifest['capabilities'],
  capability: string,
): boolean {
  return manifest.capabilities[phase].includes(capability);
}
