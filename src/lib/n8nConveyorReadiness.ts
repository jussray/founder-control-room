import {
  readFounderConveyorConfig,
  type FounderConveyorConfig,
} from './n8nConveyor.js';

export const FOUNDER_CONVEYOR_PROVIDER_STATES = [
  'not-configured',
  'ready-for-probe',
  'enabled-awaiting-proof',
] as const;

export type FounderConveyorProviderState = (typeof FOUNDER_CONVEYOR_PROVIDER_STATES)[number];

export interface FounderConveyorReadiness {
  state: FounderConveyorProviderState;
  configured: boolean;
  enabled: boolean;
  liveProbeRequired: true;
  liveVerified: false;
}

export function founderConveyorReadiness(
  config: FounderConveyorConfig = readFounderConveyorConfig(),
): FounderConveyorReadiness {
  const state: FounderConveyorProviderState = !config.configured
    ? 'not-configured'
    : config.enabled
      ? 'enabled-awaiting-proof'
      : 'ready-for-probe';

  return {
    state,
    configured: config.configured,
    enabled: config.enabled,
    liveProbeRequired: true,
    liveVerified: false,
  };
}
