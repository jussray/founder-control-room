import {
  V10_CAPABILITY_PLAN_CONTRACT,
  isV10CapabilityPlan,
  validateV10CapabilityPlan,
  type V10CapabilityPlan,
} from '../founder-os-lab/capabilityKernel.js';

export const CHIEF_AI_BINDING_NAME = 'CHIEF_AI' as const;
export const CHIEF_AI_SERVICE_IDENTITY = 'chief-ai' as const;
export const CHIEF_AI_ENTRYPOINT = 'FounderControlRoomEntrypoint' as const;
export const CHIEF_AI_RPC_CONTRACT = 'juss-v10/chief-fcr-rpc@v1' as const;

const FULL_SHA = /^[0-9a-f]{40}$/i;

export interface ChiefAiServiceBinding {
  version(): Promise<unknown>;
  createCapabilityPlan(input: unknown): Promise<unknown>;
}

interface ChiefAiServiceMetadata {
  service: typeof CHIEF_AI_SERVICE_IDENTITY;
  rpcContract: typeof CHIEF_AI_RPC_CONTRACT;
  capabilityPlanContract: typeof V10_CAPABILITY_PLAN_CONTRACT;
  releaseSha: string;
}

export interface ChiefAiServiceVersion extends ChiefAiServiceMetadata {
  ok: true;
}

export interface ChiefAiCapabilityPlanResponse extends ChiefAiServiceMetadata {
  ok: boolean;
  status: number;
  result: unknown;
  capabilityPlan: V10CapabilityPlan | null;
}

let runtimeBinding: ChiefAiServiceBinding | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isChiefAiServiceBinding(value: unknown): value is ChiefAiServiceBinding {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
  const candidate = value as Partial<ChiefAiServiceBinding>;
  return typeof candidate.version === 'function' && typeof candidate.createCapabilityPlan === 'function';
}

export function installChiefAiServiceBinding(binding: unknown): void {
  if (!isChiefAiServiceBinding(binding)) {
    throw new Error('Missing required Worker binding: CHIEF_AI');
  }
  runtimeBinding = binding;
}

export function getChiefAiServiceBinding(): ChiefAiServiceBinding {
  if (!runtimeBinding) throw new Error('CHIEF_AI runtime binding is not installed');
  return runtimeBinding;
}

function parseServiceMetadata(value: unknown): ChiefAiServiceMetadata {
  if (!isRecord(value)) throw new Error('Chief AI service response must be an object');
  if (value.service !== CHIEF_AI_SERVICE_IDENTITY) {
    throw new Error('Chief AI service identity mismatch');
  }
  if (value.rpcContract !== CHIEF_AI_RPC_CONTRACT) {
    throw new Error('Chief AI RPC contract mismatch');
  }
  if (value.capabilityPlanContract !== V10_CAPABILITY_PLAN_CONTRACT) {
    throw new Error('Chief AI capability-plan contract mismatch');
  }
  if (typeof value.releaseSha !== 'string' || !FULL_SHA.test(value.releaseSha.trim())) {
    throw new Error('Chief AI release SHA is missing or invalid');
  }

  return {
    service: CHIEF_AI_SERVICE_IDENTITY,
    rpcContract: CHIEF_AI_RPC_CONTRACT,
    capabilityPlanContract: V10_CAPABILITY_PLAN_CONTRACT,
    releaseSha: value.releaseSha.trim().toLowerCase(),
  };
}

export async function readChiefAiServiceVersion(
  binding: ChiefAiServiceBinding = getChiefAiServiceBinding(),
): Promise<ChiefAiServiceVersion> {
  const raw = await binding.version();
  const metadata = parseServiceMetadata(raw);
  if (!isRecord(raw) || raw.ok !== true) {
    throw new Error('Chief AI service metadata must report ok=true');
  }
  return { ok: true, ...metadata };
}

export async function requestChiefAiCapabilityPlan(
  input: unknown,
  binding: ChiefAiServiceBinding = getChiefAiServiceBinding(),
): Promise<ChiefAiCapabilityPlanResponse> {
  const raw = await binding.createCapabilityPlan(input);
  const metadata = parseServiceMetadata(raw);
  if (!isRecord(raw)) throw new Error('Chief AI capability-plan response must be an object');
  if (typeof raw.ok !== 'boolean') {
    throw new Error('Chief AI capability-plan response must report an operation outcome');
  }

  const status = raw.status;
  if (!Number.isInteger(status) || (status as number) < 100 || (status as number) > 599) {
    throw new Error('Chief AI capability-plan response status is invalid');
  }

  const succeeded = (status as number) >= 200 && (status as number) < 300;
  if (raw.ok !== succeeded) {
    throw new Error('Chief AI capability-plan outcome does not match its HTTP-equivalent status');
  }

  const result = raw.result;
  if (!succeeded) {
    return {
      ...metadata,
      ok: false,
      status: status as number,
      result,
      capabilityPlan: null,
    };
  }

  if (!isRecord(result) || !isRecord(result.data) || !isV10CapabilityPlan(result.data.capabilityPlan)) {
    throw new Error('Chief AI returned a successful response without a valid capability plan');
  }

  const capabilityPlan = result.data.capabilityPlan;
  const errors = validateV10CapabilityPlan(capabilityPlan);
  if (errors.length) {
    throw new Error(`Chief AI capability plan failed FCR validation: ${errors.join('; ')}`);
  }

  return {
    ...metadata,
    ok: true,
    status: status as number,
    result,
    capabilityPlan,
  };
}
