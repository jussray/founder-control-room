import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const registryUrl = new URL('../config/founder-ip-protection-registry.json', import.meta.url);
const REQUIRED_CONTROL_IDS = ['IP-001', 'IP-002', 'IP-003', 'IP-004', 'IP-005', 'IP-006'];
const REQUIRED_SYSTEMS = ['fcr', 'chief', 'promptos', 'solcontinuity'];
const VALID_CONTROL_STATES = new Set(['active', 'partial', 'unknown', 'blocked']);
const VALID_DATA_CLASSES = new Set(['public', 'internal', 'confidential', 'restricted']);
const UNKNOWN = new Set(['unknown', 'not_reviewed', 'unverified', '']);

export function validateFounderIpRegistry(registry) {
  const errors = [];
  const add = (message) => errors.push(message);
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return ['registry must be an object'];
  }
  if (registry.schema_version !== 'juss/founder-ip-protection-registry@1') add('unsupported schema_version');
  if (registry.authority !== 'FCR governance registry; does not grant access or execution authority') add('registry authority statement is missing or changed');
  if (!registry.permission_defaults || registry.permission_defaults.default_decision !== 'deny') add('permission default must remain deny');
  if (registry.permission_defaults?.permission_is_not_ownership !== true) add('permission_is_not_ownership must remain true');
  if (registry.permission_defaults?.unknown_provider_posture !== 'deny_confidential_and_restricted_data_flows') add('unknown provider posture must fail closed');

  const systems = Array.isArray(registry.systems) ? registry.systems : [];
  const systemIds = systems.map((system) => system?.id);
  for (const id of REQUIRED_SYSTEMS) if (!systemIds.includes(id)) add(`missing required system: ${id}`);
  if (new Set(systemIds).size !== systemIds.length) add('duplicate system id');
  const sol = systems.find((system) => system?.id === 'solcontinuity');
  if (sol && (sol.license_posture !== 'apache-2.0' || sol.ownership_status !== 'contributor_chain_of_title_unknown')) {
    add('SolContinuity Apache-2.0 and unresolved contributor provenance must be preserved until independently reviewed');
  }

  const controls = Array.isArray(registry.controls) ? registry.controls : [];
  const controlIds = controls.map((control) => control?.id);
  for (const id of REQUIRED_CONTROL_IDS) if (!controlIds.includes(id)) add(`missing required control: ${id}`);
  if (new Set(controlIds).size !== controlIds.length) add('duplicate control id');
  for (const control of controls) {
    if (!VALID_CONTROL_STATES.has(control?.status)) add(`invalid status for ${control?.id ?? 'unknown control'}`);
    if (control?.status === 'active' && (!Array.isArray(control.evidence) || control.evidence.length === 0)) {
      add(`active control ${control.id} requires evidence references`);
    }
  }

  const inventory = registry.integration_inventory;
  if (!inventory || !Array.isArray(inventory.known_integration_records)) {
    add('integration_inventory.known_integration_records must be an array');
  } else {
    if (inventory.known_integration_records.length === 0 && inventory.status !== 'incomplete') {
      add('empty integration inventory must be marked incomplete');
    }
    const seen = new Set();
    for (const item of inventory.known_integration_records) {
      if (!item || typeof item !== 'object') { add('integration record must be an object'); continue; }
      if (!item.id || seen.has(item.id)) add('integration record id is missing or duplicated');
      seen.add(item.id);
      if (!item.provider || !item.product_or_plan) add(`integration ${item.id ?? 'unknown'} requires provider and product_or_plan`);
      if (!Array.isArray(item.data_classes) || item.data_classes.length === 0 || item.data_classes.some((v) => !VALID_DATA_CLASSES.has(v))) {
        add(`integration ${item.id ?? 'unknown'} requires valid data_classes`);
      }
      for (const field of ['terms_url', 'terms_reviewed_at', 'training_status', 'retention_status', 'access_scope', 'revocation_path', 'evidence']) {
        if (item[field] === undefined || item[field] === null || item[field] === '') add(`integration ${item.id ?? 'unknown'} missing ${field}`);
      }
      const sensitive = item.data_classes?.some((v) => v === 'confidential' || v === 'restricted');
      const providerUnknown = UNKNOWN.has(String(item.training_status).toLowerCase()) || UNKNOWN.has(String(item.retention_status).toLowerCase()) || UNKNOWN.has(String(item.terms_reviewed_at).toLowerCase());
      if (sensitive && providerUnknown && item.approval_status === 'approved') {
        add(`integration ${item.id} cannot be approved for confidential/restricted data with unknown provider posture`);
      }
      if (item.status === 'active' && providerUnknown) {
        add(`integration ${item.id} cannot be active while terms/training/retention posture is unknown`);
      }
      if (item.cross_product_access === true && !item.contract_ref) {
        add(`integration ${item.id} cross-product access requires contract_ref`);
      }
      if (item.grants_ownership === true) {
        add(`integration ${item.id} cannot grant IP ownership through technical access metadata`);
      }
    }
  }
  return errors;
}

export function runFounderIpRegistryCheck() {
  const registry = JSON.parse(readFileSync(registryUrl, 'utf8'));
  const errors = validateFounderIpRegistry(registry);
  if (errors.length) {
    process.stderr.write(`FOUNDER_IP_REGISTRY_INVALID\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
    return false;
  }
  process.stdout.write('FOUNDER_IP_REGISTRY_VALID: six controls present; unknown provider posture fails closed; no ownership is granted by access.\n');
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runFounderIpRegistryCheck();
