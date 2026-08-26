import {
  readFounderConveyorConfig,
  type FounderConveyorConfig,
} from './n8nConveyor.js';
import { readN8nFounderContentConfig } from './n8nFounderContentOrchestrator.js';
import { readN8nFounderContentProviderConfig } from './n8nProviderNeutralFounderContentOrchestrator.js';
import type { V10ConveyorReceiptReader } from './v10ConveyorReceiptStore.js';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const FCR_PROJECT_SLUG = 'founder-control-room';

export const FOUNDER_CONVEYOR_PROVIDER_STATES = [
  'not-configured',
  'ready-for-probe',
  'enabled-awaiting-proof',
  'enabled-live-verified',
] as const;

export type FounderConveyorProviderState = (typeof FOUNDER_CONVEYOR_PROVIDER_STATES)[number];

export const FOUNDER_CONVEYOR_PROOF_STATES = [
  'not-observed',
  'verified',
  'stale-head',
  'runtime-sha-unavailable',
  'readback-unavailable',
] as const;

export type FounderConveyorProofState = (typeof FOUNDER_CONVEYOR_PROOF_STATES)[number];

export interface FounderConveyorLiveProof {
  state: FounderConveyorProofState;
  receiptId: string | null;
  expectedHeadSha: string | null;
  observedAt: string | null;
}

export interface FounderConveyorReadiness {
  state: FounderConveyorProviderState;
  configured: boolean;
  enabled: boolean;
  liveProbeRequired: boolean;
  liveVerified: boolean;
  proof: FounderConveyorLiveProof;
}

export const FOUNDER_CONTENT_ORCHESTRATION_STATES = [
  'not-configured',
  'ready-for-probe',
  'enabled-misconfigured',
  'invalid-provider-configuration',
  'enabled-awaiting-proof',
  'enabled-live-verified',
] as const;

export type FounderContentOrchestrationState =
  (typeof FOUNDER_CONTENT_ORCHESTRATION_STATES)[number];

export const FOUNDER_CONTENT_ORCHESTRATION_PROOF_STATES = [
  'not-observed',
  'verified',
  'stale-head',
  'runtime-sha-unavailable',
  'provider-unverified',
  'readback-unavailable',
] as const;

export type FounderContentOrchestrationProofState =
  (typeof FOUNDER_CONTENT_ORCHESTRATION_PROOF_STATES)[number];

export interface FounderContentOrchestrationProof {
  state: FounderContentOrchestrationProofState;
  provider: 'buffer' | null;
  receiptId: string | null;
  expectedHeadSha: string | null;
  observedAt: string | null;
}

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
  liveProbeRequired: boolean;
  liveVerified: boolean;
  proof: FounderContentOrchestrationProof;
  secretValuesExposed: false;
}

function emptyProof(state: FounderConveyorProofState = 'not-observed'): FounderConveyorLiveProof {
  return {
    state,
    receiptId: null,
    expectedHeadSha: null,
    observedAt: null,
  };
}

function emptyFounderContentProof(
  state: FounderContentOrchestrationProofState = 'not-observed',
): FounderContentOrchestrationProof {
  return {
    state,
    provider: null,
    receiptId: null,
    expectedHeadSha: null,
    observedAt: null,
  };
}

export function founderConveyorReadiness(
  config: FounderConveyorConfig = readFounderConveyorConfig(),
  proof: FounderConveyorLiveProof = emptyProof(),
): FounderConveyorReadiness {
  const liveVerified = config.configured && config.enabled && proof.state === 'verified';
  const state: FounderConveyorProviderState = !config.configured
    ? 'not-configured'
    : !config.enabled
      ? 'ready-for-probe'
      : liveVerified
        ? 'enabled-live-verified'
        : 'enabled-awaiting-proof';

  return {
    state,
    configured: config.configured,
    enabled: config.enabled,
    liveProbeRequired: !liveVerified,
    liveVerified,
    proof,
  };
}

export interface ResolveFounderConveyorReadinessOptions {
  env?: NodeJS.ProcessEnv;
  receiptReader?: V10ConveyorReceiptReader;
}

export async function resolveFounderConveyorReadiness(
  options: ResolveFounderConveyorReadinessOptions = {},
): Promise<FounderConveyorReadiness> {
  const env = options.env ?? process.env;
  const config = readFounderConveyorConfig(env);

  if (!config.configured || !config.enabled) {
    return founderConveyorReadiness(config);
  }

  const runtimeSha = (env.GIT_SHA ?? '').trim().toLowerCase();
  if (!FULL_SHA.test(runtimeSha)) {
    return founderConveyorReadiness(config, emptyProof('runtime-sha-unavailable'));
  }

  try {
    const reader = options.receiptReader
      ?? (await import('./v10ConveyorReceiptStore.js')).supabaseV10ConveyorReceiptReader;
    const receipt = await reader.latestActivationProbe(FCR_PROJECT_SLUG);
    if (!receipt) {
      return founderConveyorReadiness(config, {
        ...emptyProof('not-observed'),
        expectedHeadSha: runtimeSha,
      });
    }

    const receiptHead = receipt.expectedHeadSha.trim().toLowerCase();
    const proofState: FounderConveyorProofState = receiptHead === runtimeSha ? 'verified' : 'stale-head';
    return founderConveyorReadiness(config, {
      state: proofState,
      receiptId: receipt.receiptId,
      expectedHeadSha: receiptHead,
      observedAt: receipt.createdAt,
    });
  } catch {
    return founderConveyorReadiness(config, {
      ...emptyProof('readback-unavailable'),
      expectedHeadSha: runtimeSha,
    });
  }
}

export function founderContentOrchestrationReadiness(
  env: NodeJS.ProcessEnv = process.env,
  proof: FounderContentOrchestrationProof = emptyFounderContentProof(),
): FounderContentOrchestrationReadiness {
  const transport = readN8nFounderContentConfig(env);
  const providers = readN8nFounderContentProviderConfig(env);
  const webhookConfigured = Boolean(transport.webhookUrl);
  const bearerTokenConfigured = Boolean(transport.bearerToken);
  const bufferEnabled = providers.enabledProviders.includes('buffer');
  const providerConfigurationValid = providers.invalidProviders.length === 0;
  const runtimeSha = (env.GIT_SHA ?? '').trim().toLowerCase();
  const proofHead = (proof.expectedHeadSha ?? '').trim().toLowerCase();
  const exactRuntimeProof =
    FULL_SHA.test(runtimeSha) &&
    FULL_SHA.test(proofHead) &&
    runtimeSha === proofHead;
  const liveVerified =
    transport.enabled &&
    transport.configured &&
    providerConfigurationValid &&
    bufferEnabled &&
    proof.state === 'verified' &&
    proof.provider === 'buffer' &&
    exactRuntimeProof;

  let state: FounderContentOrchestrationState;
  if (!providerConfigurationValid) {
    state = 'invalid-provider-configuration';
  } else if (transport.enabled && !transport.configured) {
    state = 'enabled-misconfigured';
  } else if (!transport.configured) {
    state = 'not-configured';
  } else if (!transport.enabled) {
    state = 'ready-for-probe';
  } else if (liveVerified) {
    state = 'enabled-live-verified';
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
      bufferEnabled &&
      !liveVerified,
    liveProbeRequired: !liveVerified,
    liveVerified,
    proof,
    secretValuesExposed: false,
  };
}
