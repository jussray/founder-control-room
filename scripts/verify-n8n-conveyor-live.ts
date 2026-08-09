import type { V10CapabilityPlan } from '../src/founder-os-lab/capabilityKernel.js';
import { runN8nActivationProbe } from '../src/lib/n8nActivationProbe.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const expectedHeadSha = (process.env.N8N_CONVEYOR_PROBE_HEAD_SHA ?? process.env.GITHUB_SHA ?? '').trim();
if (!expectedHeadSha) throw new Error('N8N_CONVEYOR_PROBE_HEAD_SHA or GITHUB_SHA is required');

let capabilityPlan: V10CapabilityPlan;
try {
  capabilityPlan = JSON.parse(required('N8N_CONVEYOR_CAPABILITY_PLAN_JSON')) as V10CapabilityPlan;
} catch (error) {
  throw new Error(`N8N_CONVEYOR_CAPABILITY_PLAN_JSON must be valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`);
}

const receipt = await runN8nActivationProbe({
  expectedHeadSha,
  capabilityPlan,
  webhookUrl: required('N8N_CONVEYOR_WEBHOOK_URL'),
  bearerToken: required('N8N_CONVEYOR_BEARER_TOKEN'),
});

process.stdout.write(`${JSON.stringify({
  verified: true,
  ...receipt,
}, null, 2)}\n`);
