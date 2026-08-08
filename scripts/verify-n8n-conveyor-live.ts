import { runN8nActivationProbe } from '../src/lib/n8nActivationProbe.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const expectedHeadSha = (process.env.N8N_CONVEYOR_PROBE_HEAD_SHA ?? process.env.GITHUB_SHA ?? '').trim();
if (!expectedHeadSha) throw new Error('N8N_CONVEYOR_PROBE_HEAD_SHA or GITHUB_SHA is required');

const receipt = await runN8nActivationProbe({
  expectedHeadSha,
  webhookUrl: required('N8N_CONVEYOR_WEBHOOK_URL'),
  bearerToken: required('N8N_CONVEYOR_BEARER_TOKEN'),
});

process.stdout.write(`${JSON.stringify({
  verified: true,
  ...receipt,
}, null, 2)}\n`);
