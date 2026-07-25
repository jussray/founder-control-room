import { readFile } from 'node:fs/promises';
import process from 'node:process';

const contractPath = process.argv[2] ?? '.control/capability.json';
const allowedCapabilities = new Set([
  'BUILD','TEST','VERIFY','DEPLOY','ROLLBACK','HEALTH','AUTH','DATABASE','API','AI','MCP','AUTOMATION','CRM','ANALYTICS','NOTIFICATIONS','OBSERVABILITY','SECURITY','EVIDENCE'
]);
const allowedCapabilityStates = new Set(['verified','partial','unverified','blocked','not_applicable']);
const allowedHealthStates = new Set(['green','yellow','red','unknown','not_applicable']);
const allowedProofStates = new Set(['verified','stale','missing','failed']);
const requiredTopLevel = [
  'schema_version','name','version','mission','repository','capabilities','verification','health','proof','rollback','dependencies','last_verified','blockers','next_gate'
];

function fail(message) {
  console.error(`Capability contract invalid: ${message}`);
  process.exitCode = 1;
}

function isDateTime(value) {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

const contract = JSON.parse(await readFile(contractPath, 'utf8'));
for (const key of requiredTopLevel) {
  if (!(key in contract)) fail(`missing required field ${key}`);
}
if (contract.schema_version !== '1.0') fail('schema_version must equal 1.0');
if (!/^[^/]+\/[^/]+$/.test(contract.repository ?? '')) fail('repository must use owner/name');
if (!Array.isArray(contract.capabilities) || contract.capabilities.length === 0) fail('capabilities must be a non-empty array');

const evidenceIds = new Set((contract.proof ?? []).map((item) => item.id));
for (const capability of contract.capabilities ?? []) {
  if (!allowedCapabilities.has(capability.id)) fail(`unknown capability ${capability.id}`);
  if (!allowedCapabilityStates.has(capability.status)) fail(`invalid status for ${capability.id}`);
  for (const evidenceId of capability.evidence_ids ?? []) {
    if (!evidenceIds.has(evidenceId)) fail(`${capability.id} references missing evidence ${evidenceId}`);
  }
  if (capability.status === 'verified' && !(capability.evidence_ids?.length > 0)) {
    fail(`${capability.id} cannot be verified without evidence_ids`);
  }
}

for (const key of ['overall','build','tests','deploy','runtime','proof']) {
  if (!allowedHealthStates.has(contract.health?.[key])) fail(`invalid health.${key}`);
}
for (const proof of contract.proof ?? []) {
  if (!proof.id || !proof.kind || !proof.source) fail('every proof item requires id, kind, and source');
  if (!allowedProofStates.has(proof.status)) fail(`invalid proof status for ${proof.id}`);
  if (!isDateTime(proof.verified_at ?? null)) fail(`invalid verified_at for ${proof.id}`);
}
if (!isDateTime(contract.last_verified)) fail('last_verified must be null or an ISO date-time');
if (contract.rollback?.verified === true && !contract.rollback.evidence_id) fail('verified rollback requires evidence_id');
if (contract.rollback?.evidence_id && !evidenceIds.has(contract.rollback.evidence_id)) fail('rollback evidence_id is missing from proof');

if (!process.exitCode) console.log(`Capability contract valid: ${contract.repository}`);
