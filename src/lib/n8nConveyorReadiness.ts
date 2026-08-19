import {
  readFounderConveyorConfig,
  type FounderConveyorConfig,
} from './n8nConveyor.js';
import { readN8nFounderContentConfig } from './n8nFounderContentOrchestrator.js';
import { readN8nFounderContentProviderConfig } from './n8nProviderNeutralFounderContentOrchestrator.js';

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

export const FOUNDER_CONTENT_ORCHESTRATION_STATES = [
  'not-configured',
  'ready-for-probe',
  'enabled-misconfigured',
  'invalid-provider-configuration',
  'enabled-awaiting-proof',
] as const;

export type FounderContentOrchestrationState =
  (typeof FOUNDER_CONTENT_ORCHESTRATION_STATES)[number];

export interface FounderContentOrchestrationReadiness {
  state: FounderContentOrchestrationState;
  configured: boolean;
  enabled: boolean;
  webhookConfigured: boolean;
  bearerTokenConfigured: boolean;
  enabledProviders: string[];
  invalidProviders: string[];
  bufferEnabled: boolean;
  bufferReadyForProbe: boolean;
  liveProbeRequired: true;
  liveVerified: false;
  secretValuesExposed: false;
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

export function founderContentOrchestrationReadiness(
  env: NodeJS.ProcessEnv = process.env,
): FounderContentOrchestrationReadiness {
  const transport = readN8nFounderContentConfig(env);
  const providers = readN8nFounderContentProviderConfig(env);
  const webhookConfigured = Boolean(transport.webhookUrl);
  const bearerTokenConfigured = Boolean(transport.bearerToken);
  const bufferEnabled = providers.enabledProviders.includes('buffer');
  const providerConfigurationValid = providers.invalidProviders.length === 0;

  let state: FounderContentOrchestrationState;
  if (!providerConfigurationValid) {
    state = 'invalid-provider-configuration';
  } else if (transport.enabled && !transport.configured) {
    state = 'enabled-misconfigured';
  } else if (!transport.configured) {
    state = 'not-configured';
  } else if (!transport.enabled) {
    state = 'ready-for-probe';
  } else {
    state = 'enabled-awaiting-proof';
  }

  return {
    state,
    configured: transport.configured,
    enabled: transport.enabled,
    webhookConfigured,
    bearerTokenConfigured,
    enabledProviders: [...providers.enabledProviders],
    invalidProviders: [...providers.invalidProviders],
    bufferEnabled,
    bufferReadyForProbe:
      transport.enabled &&
      transport.configured &&
      providerConfigurationValid &&
      bufferEnabled,
    liveProbeRequired: true,
    liveVerified: false,
    secretValuesExposed: false,
  };
}
