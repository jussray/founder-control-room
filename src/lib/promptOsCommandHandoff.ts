import { createHash } from 'node:crypto';
import type { ChiefAiEvidenceServiceBinding } from '../worker/handler.js';

export const PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT = 'promptos/public-command-intent@v1' as const;
export const PROMPTOS_CHIEF_FCR_COMMAND_HANDOFF_CONTRACT = 'juss/promptos-chief-fcr-command-handoff@v1' as const;
export const FCR_PUBLIC_COMMAND_INTAKE_CONTRACT = 'juss/fcr-public-command-intake@v1' as const;
export const PROMPTOS_COMMAND_NEXT_CONTRACT = 'juss-v10/capability-plan@v1' as const;
export const CHIEF_FCR_RPC_CONTRACT = 'juss-v10/chief-fcr-rpc@v1' as const;

const HASH = /^[0-9a-f]{64}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SYSTEM_OWNED_MODE_NAMES = new Set([
  'goalfix', 'ultrathink', 'truthmode', 'confess', 'redteam', 'redteam2',
  'attackten', 'attack10', 'lindymode', 'ooda', 'proofmode', 'l99',
]);

const HANDOFF_KEYS = new Set([
  'contract', 'sourceIntentContract', 'sourceIntentFingerprint', 'sourceIntent',
  'acceptedBy', 'status', 'project', 'projectSource', 'capabilityId',
  'specialistProduct', 'requestedOutcome', 'authorityPlane',
  'authorityResolution', 'actionAuthority', 'executionAuthorized',
  'nextRequiredContract', 'handoffFingerprint',
]);
const INTENT_KEYS = new Set([
  'schema', 'command', 'arguments', 'project', 'capabilityId', 'route',
  'authorityCeiling', 'execution', 'evidence', 'catalogQuery',
]);
const COMMAND_KEYS = new Set(['id', 'token', 'category', 'label']);
const ROUTE_KEYS = new Set(['owner', 'reasoningPlane', 'specialistProduct', 'authorityPlane']);
const EXECUTION_KEYS = new Set(['status', 'mutationAuthorized']);
const EVIDENCE_KEYS = new Set(['contract', 'staleOnStateChange']);

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown, max = 4_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function unknownKeys(value: unknown, allowed: ReadonlySet<string>, path: string): string[] {
  const raw = record(value);
  if (!raw) return [];
  return Object.keys(raw)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => `unknown ${path} field: ${key}`);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non_finite_number');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const raw = value as JsonRecord;
    return Object.fromEntries(
      Object.keys(raw).sort().map((key) => [key, canonicalize(raw[key])]),
    );
  }
  throw new Error('unsupported_value');
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function validateSourceIntent(value: unknown): string[] {
  const errors: string[] = [];
  const raw = record(value);
  if (!raw) return ['source PromptOS command intent must be an object'];

  errors.push(...unknownKeys(raw, INTENT_KEYS, 'source intent'));
  errors.push(...unknownKeys(raw.command, COMMAND_KEYS, 'source command'));
  errors.push(...unknownKeys(raw.route, ROUTE_KEYS, 'source route'));
  errors.push(...unknownKeys(raw.execution, EXECUTION_KEYS, 'source execution'));
  errors.push(...unknownKeys(raw.evidence, EVIDENCE_KEYS, 'source evidence'));

  const command = record(raw.command) ?? {};
  const route = record(raw.route) ?? {};
  const execution = record(raw.execution) ?? {};
  const evidence = record(raw.evidence) ?? {};
  const id = text(command.id, 80).toLowerCase();
  const capabilityId = text(raw.capabilityId, 120).toLowerCase();

  if (raw.schema !== PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT) errors.push('source PromptOS command intent contract drifted');
  if (!SAFE_TOKEN.test(id)) errors.push('source public command id is invalid');
  if (text(command.token, 100) !== `/${id}`) errors.push('source public command token does not bind its id');
  if (!text(command.category, 80)) errors.push('source public command category is required');
  if (!text(command.label, 160)) errors.push('source public command label is required');
  if (!SAFE_TOKEN.test(capabilityId)) errors.push('source public capabilityId is invalid');
  if (route.owner !== 'promptos') errors.push('PromptOS must remain source command owner');
  if (route.reasoningPlane !== 'chief-ai-machine') errors.push('Chief AI must remain source reasoning plane');
  if (route.authorityPlane !== 'founder-control-room') errors.push('Founder Control Room must remain source authority plane');
  if (!text(route.specialistProduct, 160)) errors.push('source specialist product is required');
  if (raw.authorityCeiling !== 'advisory-only') errors.push('source PromptOS authority ceiling must remain advisory-only');
  if (execution.status !== 'not-executed') errors.push('source PromptOS intent cannot claim execution');
  if (execution.mutationAuthorized !== false) errors.push('source PromptOS intent cannot authorize mutation');
  if (evidence.staleOnStateChange !== true) errors.push('source PromptOS evidence must invalidate on state change');
  if (!text(evidence.contract, 160)) errors.push('source PromptOS evidence contract is required');
  if (SYSTEM_OWNED_MODE_NAMES.has(id)) errors.push('system-owned control modes cannot enter FCR as public command ids');
  if (SYSTEM_OWNED_MODE_NAMES.has(capabilityId)) errors.push('system-owned control modes cannot enter FCR as public capability ids');

  return [...new Set(errors)];
}

export interface FcrPublicCommandIntake {
  contract: typeof FCR_PUBLIC_COMMAND_INTAKE_CONTRACT;
  receivedFrom: 'chief-ai-machine';
  sourceIntentFingerprint: string;
  chiefHandoffFingerprint: string;
  project: string;
  commandId: string;
  capabilityId: string;
  specialistProduct: string;
  requestedOutcome: string;
  acceptedForCapabilityPlanning: true;
  acceptedForAuthorityResolution: false;
  authorityState: 'unresolved';
  actionAuthority: false;
  executionAuthorized: false;
  nextRequiredContract: typeof PROMPTOS_COMMAND_NEXT_CONTRACT;
  chiefReleaseSha?: string;
}

export function validatePromptOSChiefCommandHandoff(value: unknown): string[] {
  const errors: string[] = [];
  const raw = record(value);
  if (!raw) return ['PromptOS/Chief command handoff must be an object'];

  errors.push(...unknownKeys(raw, HANDOFF_KEYS, 'handoff'));
  const source = record(raw.sourceIntent);
  errors.push(...validateSourceIntent(source));

  if (raw.contract !== PROMPTOS_CHIEF_FCR_COMMAND_HANDOFF_CONTRACT) errors.push('unsupported PromptOS/Chief command handoff contract');
  if (raw.sourceIntentContract !== PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT) errors.push('handoff source intent contract drifted');
  if (!HASH.test(text(raw.sourceIntentFingerprint, 64))) errors.push('source intent fingerprint must be sha256');
  if (source && HASH.test(text(raw.sourceIntentFingerprint, 64)) && fingerprint(source) !== text(raw.sourceIntentFingerprint, 64).toLowerCase()) {
    errors.push('source intent fingerprint does not match source intent');
  }
  if (raw.acceptedBy !== 'chief-ai-machine') errors.push('Chief AI must accept the public command handoff');
  if (raw.status !== 'accepted-for-capability-planning') errors.push('public command handoff status is invalid');
  if (!text(raw.project, 240)) errors.push('Chief-resolved project context is required');
  if (!['promptos-hint', 'chief-context'].includes(text(raw.projectSource, 40))) errors.push('project source is invalid');
  if (!SAFE_TOKEN.test(text(raw.capabilityId, 120).toLowerCase())) errors.push('handoff capabilityId is invalid');
  if (!text(raw.specialistProduct, 160)) errors.push('handoff specialist product is required');
  if (!text(raw.requestedOutcome)) errors.push('handoff requested outcome is required');
  if (raw.authorityPlane !== 'founder-control-room') errors.push('handoff authority plane must remain Founder Control Room');
  if (raw.authorityResolution !== 'unresolved') errors.push('public command handoff cannot pre-resolve authority');
  if (raw.actionAuthority !== false) errors.push('public command handoff cannot grant action authority');
  if (raw.executionAuthorized !== false) errors.push('public command handoff cannot authorize execution');
  if (raw.nextRequiredContract !== PROMPTOS_COMMAND_NEXT_CONTRACT) errors.push('public command handoff must require the Chief capability-plan contract next');

  if (source) {
    const sourceCommand = record(source.command) ?? {};
    const sourceRoute = record(source.route) ?? {};
    const sourceProject = source.project === null ? '' : text(source.project, 240);
    const expectedOutcome = text(source.arguments) || text(sourceCommand.label, 160);
    if (text(raw.capabilityId, 120).toLowerCase() !== text(source.capabilityId, 120).toLowerCase()) errors.push('handoff capability does not match source intent');
    if (text(raw.specialistProduct, 160) !== text(sourceRoute.specialistProduct, 160)) errors.push('handoff specialist does not match source intent');
    if (text(raw.requestedOutcome) !== expectedOutcome) errors.push('handoff requested outcome does not match source intent');
    if (sourceProject) {
      if (text(raw.project) !== sourceProject) errors.push('handoff project changed a PromptOS project hint');
      if (raw.projectSource !== 'promptos-hint') errors.push('PromptOS project hints must remain marked promptos-hint');
    } else if (raw.projectSource !== 'chief-context') {
      errors.push('Chief-resolved project context must remain marked chief-context');
    }
  }

  const submittedHandoffFingerprint = text(raw.handoffFingerprint, 64).toLowerCase();
  if (!HASH.test(submittedHandoffFingerprint)) {
    errors.push('handoff fingerprint must be sha256');
  } else {
    const payload = { ...raw };
    delete payload.handoffFingerprint;
    if (fingerprint(payload) !== submittedHandoffFingerprint) errors.push('handoff fingerprint does not match handoff content');
  }

  return [...new Set(errors)];
}

export function acceptPromptOSChiefCommandHandoff(value: unknown): FcrPublicCommandIntake {
  const errors = validatePromptOSChiefCommandHandoff(value);
  if (errors.length) throw new Error(errors.join('; '));

  const raw = value as JsonRecord;
  const source = raw.sourceIntent as JsonRecord;
  const command = source.command as JsonRecord;
  return Object.freeze({
    contract: FCR_PUBLIC_COMMAND_INTAKE_CONTRACT,
    receivedFrom: 'chief-ai-machine',
    sourceIntentFingerprint: text(raw.sourceIntentFingerprint, 64).toLowerCase(),
    chiefHandoffFingerprint: text(raw.handoffFingerprint, 64).toLowerCase(),
    project: text(raw.project, 240),
    commandId: text(command.id, 80).toLowerCase(),
    capabilityId: text(raw.capabilityId, 120).toLowerCase(),
    specialistProduct: text(raw.specialistProduct, 160),
    requestedOutcome: text(raw.requestedOutcome),
    acceptedForCapabilityPlanning: true,
    acceptedForAuthorityResolution: false,
    authorityState: 'unresolved',
    actionAuthority: false,
    executionAuthorized: false,
    nextRequiredContract: PROMPTOS_COMMAND_NEXT_CONTRACT,
  });
}

export async function requestPromptOSCommandIntakeFromChief(
  binding: ChiefAiEvidenceServiceBinding,
  intent: unknown,
  resolvedProject?: string,
): Promise<FcrPublicCommandIntake> {
  if (typeof binding.acceptPromptOSCommandIntent !== 'function') {
    throw new Error('Chief AI PromptOS command RPC is unavailable');
  }

  const response = record(await binding.acceptPromptOSCommandIntent({
    intent,
    ...(resolvedProject ? { resolvedProject } : {}),
  }));
  if (!response || response.ok !== true || response.service !== 'chief-ai') {
    throw new Error(text(response?.error) || 'Chief AI rejected the PromptOS public command intent');
  }
  if (response.rpcContract !== CHIEF_FCR_RPC_CONTRACT) throw new Error('Chief AI RPC contract drifted');
  if (response.promptOSCommandIntentContract !== PROMPTOS_PUBLIC_COMMAND_INTENT_CONTRACT) throw new Error('Chief AI PromptOS intent contract drifted');
  if (response.promptOSCommandHandoffContract !== PROMPTOS_CHIEF_FCR_COMMAND_HANDOFF_CONTRACT) throw new Error('Chief AI PromptOS handoff contract drifted');

  const chiefReleaseSha = text(response.releaseSha, 40).toLowerCase();
  if (!FULL_SHA.test(chiefReleaseSha)) throw new Error('Chief AI command handoff is not bound to an exact runtime release SHA');

  const intake = acceptPromptOSChiefCommandHandoff(response.result);
  return Object.freeze({ ...intake, chiefReleaseSha });
}
