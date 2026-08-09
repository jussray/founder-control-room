import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  v10CapabilityRegistryHash,
  type V10CapabilityPlan,
  type V10CapabilityRef,
} from '../src/founder-os-lab/capabilityKernel.js';

const expectedHeadSha = (process.env.N8N_CONVEYOR_PROBE_HEAD_SHA ?? process.env.EXACT_SHA ?? '').trim().toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
  throw new Error('N8N_CONVEYOR_PROBE_HEAD_SHA or EXACT_SHA must be a full Git SHA');
}

const capability: V10CapabilityRef = {
  id: 'capability-mode-router',
  version: '1.0.0',
  origin: 'repo-native',
  owner: 'chief-ai-machine',
  sourceHash: 'c'.repeat(64),
  authorityCeiling: 'privileged',
};

const base: Omit<V10CapabilityPlan, 'planHash'> = {
  contract: V10_CAPABILITY_PLAN_CONTRACT,
  selectedBy: V10_CAPABILITY_SELECTOR,
  goal: 'Verify the exact-head V3 n8n runtime integration.',
  projectSlug: 'founder-control-room',
  expectedHeadSha,
  registryHash: v10CapabilityRegistryHash([capability]),
  requestedAuthority: 'draft',
  strategicLenses: ['truthmode'],
  routingReason: 'Use one deterministic Chief-owned routing capability to prove the exact V3 runtime contract without production authority.',
  capabilities: [capability],
  proofRequirements: ['authenticated pinned n8n webhook', 'canonical V3 receipt'],
  outcomeSignals: ['n8n-runtime-compatible'],
  rollback: 'Discard the ephemeral CI runtime and its proof fixture.',
};

const plan: V10CapabilityPlan = {
  ...base,
  planHash: v10CapabilityPlanHash(base),
};

process.stdout.write(`${JSON.stringify(plan)}\n`);
