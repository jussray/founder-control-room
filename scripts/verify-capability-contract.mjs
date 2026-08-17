import { readFile } from 'node:fs/promises';
import process from 'node:process';

const contractPath = process.argv[2] ?? '.control/capability.json';
const schemaPath = new URL('../schemas/capability-contract.v1.schema.json', import.meta.url);

function fail(message) {
  console.error(`Capability contract invalid: ${message}`);
  process.exitCode = 1;
}

function isDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function valueMatchesType(value, type) {
  switch (type) {
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    default:
      return false;
  }
}

function resolveLocalRef(rootSchema, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  return ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((current, segment) => current?.[segment], rootSchema);
}

function validateAgainstSchema(value, schema, rootSchema, path = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    fail(`schema node ${path} is invalid`);
    return;
  }

  if (schema.$ref) {
    const resolved = resolveLocalRef(rootSchema, schema.$ref);
    if (!resolved) {
      fail(`schema reference ${schema.$ref} at ${path} could not be resolved`);
      return;
    }
    validateAgainstSchema(value, resolved, rootSchema, path);
    return;
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowedTypes.some((type) => valueMatchesType(value, type))) {
      fail(`${path} must be type ${allowedTypes.join(' or ')}`);
      return;
    }
  }

  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    fail(`${path} must equal ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => Object.is(entry, value))) {
    fail(`${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(', ')}`);
  }

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      fail(`${path} must contain at least ${schema.minLength} character(s)`);
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      fail(`${path} does not match required pattern ${schema.pattern}`);
    }
    if (schema.format === 'date-time' && !isDateTime(value)) {
      fail(`${path} must be a valid date-time`);
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      fail(`${path} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateAgainstSchema(item, schema.items, rootSchema, `${path}[${index}]`));
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) fail(`${path} is missing required property ${required}`);
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) fail(`${path} contains unsupported property ${key}`);
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateAgainstSchema(value[key], childSchema, rootSchema, `${path}.${key}`);
      }
    }
  }
}

const [contractRaw, schemaRaw] = await Promise.all([
  readFile(contractPath, 'utf8'),
  readFile(schemaPath, 'utf8'),
]);
const contract = JSON.parse(contractRaw);
const schema = JSON.parse(schemaRaw);

validateAgainstSchema(contract, schema, schema);

const proofById = new Map();
for (const proof of Array.isArray(contract.proof) ? contract.proof : []) {
  if (proofById.has(proof.id)) fail(`duplicate proof id ${proof.id}`);
  proofById.set(proof.id, proof);
}

for (const capability of Array.isArray(contract.capabilities) ? contract.capabilities : []) {
  const evidenceIds = Array.isArray(capability.evidence_ids) ? capability.evidence_ids : [];

  for (const evidenceId of evidenceIds) {
    if (!proofById.has(evidenceId)) {
      fail(`${capability.id} references missing evidence ${evidenceId}`);
    }
  }

  if (capability.status === 'verified') {
    if (evidenceIds.length === 0) {
      fail(`${capability.id} cannot be verified without evidence_ids`);
    }
    for (const evidenceId of evidenceIds) {
      const proof = proofById.get(evidenceId);
      if (proof && proof.status !== 'verified') {
        fail(`${capability.id} cannot be verified with ${proof.status} evidence ${evidenceId}`);
      }
    }
  }
}

if (contract.rollback?.verified === true && !contract.rollback.evidence_id) {
  fail('verified rollback requires evidence_id');
}
if (contract.rollback?.evidence_id && !proofById.has(contract.rollback.evidence_id)) {
  fail('rollback evidence_id is missing from proof');
}
if (contract.rollback?.verified === true && contract.rollback?.evidence_id) {
  const rollbackProof = proofById.get(contract.rollback.evidence_id);
  if (rollbackProof && rollbackProof.status !== 'verified') {
    fail(`verified rollback cannot use ${rollbackProof.status} evidence ${contract.rollback.evidence_id}`);
  }
}

if (!process.exitCode) console.log(`Capability contract valid: ${contract.repository}`);
