export const FOUNDER_CONVEYOR_STAGES = [
  'chat',
  'workflows',
  'code',
  'projects',
  'skills',
] as const;

export type FounderConveyorStage = (typeof FOUNDER_CONVEYOR_STAGES)[number];

export interface FounderConveyorAdvanceInput {
  runId: string;
  projectSlug: string;
  goal: string;
  fromStage: FounderConveyorStage;
  toStage: FounderConveyorStage;
  expectedHeadSha: string;
  evidenceUrls: string[];
}

export interface FounderConveyorConfig {
  configured: boolean;
  enabled: boolean;
  webhookUrl: string | null;
  bearerToken: string | null;
}

export interface FounderConveyorDispatchResult {
  ok: boolean;
  code:
    | 'DISPATCHED'
    | 'CONVEYOR_DISABLED'
    | 'CONVEYOR_NOT_CONFIGURED'
    | 'INVALID_TRANSITION'
    | 'INVALID_PAYLOAD'
    | 'UPSTREAM_REJECTED'
    | 'UPSTREAM_UNREACHABLE';
  status: number;
  receiptId: string | null;
  reasons: string[];
}

interface DispatchOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const MAX_GOAL_LENGTH = 4000;
const MAX_EVIDENCE_URLS = 20;

const NEXT_STAGE: Record<FounderConveyorStage, FounderConveyorStage> = {
  chat: 'workflows',
  workflows: 'code',
  code: 'projects',
  projects: 'skills',
  skills: 'chat',
};

const EVIDENCE_REQUIRED = new Set<string>([
  'code:projects',
  'projects:skills',
  'skills:chat',
]);

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

export function readFounderConveyorConfig(env: NodeJS.ProcessEnv = process.env): FounderConveyorConfig {
  const webhookUrl = text(env.N8N_CONVEYOR_WEBHOOK_URL) || null;
  const bearerToken = text(env.N8N_CONVEYOR_BEARER_TOKEN) || null;
  const enabled = text(env.N8N_CONVEYOR_ENABLED).toLowerCase() === 'true';

  return {
    configured: Boolean(webhookUrl && validHttpUrl(webhookUrl)),
    enabled,
    webhookUrl,
    bearerToken,
  };
}

export function validateFounderConveyorAdvance(input: FounderConveyorAdvanceInput): string[] {
  const reasons: string[] = [];

  if (!text(input.runId)) reasons.push('runId is required');
  if (!text(input.projectSlug)) reasons.push('projectSlug is required');
  if (!text(input.goal)) reasons.push('goal is required');
  if (text(input.goal).length > MAX_GOAL_LENGTH) reasons.push(`goal must be ${MAX_GOAL_LENGTH} characters or fewer`);

  if (!FOUNDER_CONVEYOR_STAGES.includes(input.fromStage)) reasons.push('fromStage is invalid');
  if (!FOUNDER_CONVEYOR_STAGES.includes(input.toStage)) reasons.push('toStage is invalid');

  if (
    FOUNDER_CONVEYOR_STAGES.includes(input.fromStage)
    && FOUNDER_CONVEYOR_STAGES.includes(input.toStage)
    && NEXT_STAGE[input.fromStage] !== input.toStage
  ) {
    reasons.push(`transition must advance ${input.fromStage} -> ${NEXT_STAGE[input.fromStage]}`);
  }

  if (!FULL_SHA.test(text(input.expectedHeadSha))) {
    reasons.push('expectedHeadSha must be a full 40-character Git commit SHA');
  }

  if (!Array.isArray(input.evidenceUrls)) {
    reasons.push('evidenceUrls must be an array');
  } else {
    if (input.evidenceUrls.length > MAX_EVIDENCE_URLS) {
      reasons.push(`evidenceUrls must contain ${MAX_EVIDENCE_URLS} entries or fewer`);
    }
    if (input.evidenceUrls.some((url) => !validHttpUrl(text(url)))) {
      reasons.push('every evidence URL must be HTTPS or local HTTP');
    }
    if (EVIDENCE_REQUIRED.has(`${input.fromStage}:${input.toStage}`) && input.evidenceUrls.length === 0) {
      reasons.push(`evidence is required for ${input.fromStage} -> ${input.toStage}`);
    }
  }

  return reasons;
}

function receiptIdFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).receiptId;
  return text(candidate) || null;
}

export async function dispatchFounderConveyorAdvance(
  input: FounderConveyorAdvanceInput,
  options: DispatchOptions = {},
): Promise<FounderConveyorDispatchResult> {
  const config = readFounderConveyorConfig(options.env);

  if (!config.enabled) {
    return {
      ok: false,
      code: 'CONVEYOR_DISABLED',
      status: 503,
      receiptId: null,
      reasons: ['n8n conveyor execution is disabled'],
    };
  }

  if (!config.configured || !config.webhookUrl) {
    return {
      ok: false,
      code: 'CONVEYOR_NOT_CONFIGURED',
      status: 503,
      receiptId: null,
      reasons: ['n8n conveyor webhook is not configured with an allowed URL'],
    };
  }

  const reasons = validateFounderConveyorAdvance(input);
  if (reasons.length > 0) {
    return {
      ok: false,
      code: reasons.some((reason) => reason.startsWith('transition must advance'))
        ? 'INVALID_TRANSITION'
        : 'INVALID_PAYLOAD',
      status: 400,
      receiptId: null,
      reasons,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-FCR-Conveyor-Contract': 'v1',
  };
  if (config.bearerToken) headers.Authorization = `Bearer ${config.bearerToken}`;

  const payload = {
    contract: 'founder-control-room/n8n-conveyor@v1',
    event: 'conveyor.stage.advance',
    runId: text(input.runId),
    projectSlug: text(input.projectSlug),
    goal: text(input.goal),
    fromStage: input.fromStage,
    toStage: input.toStage,
    expectedHeadSha: text(input.expectedHeadSha).toLowerCase(),
    evidenceUrls: input.evidenceUrls.map((url) => text(url)),
    authority: {
      advanceStage: true,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    },
  };

  try {
    const response = await fetchImpl(config.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        code: 'UPSTREAM_REJECTED',
        status: 502,
        receiptId: receiptIdFrom(responseBody),
        reasons: [`n8n rejected the conveyor transition with HTTP ${response.status}`],
      };
    }

    return {
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      receiptId: receiptIdFrom(responseBody),
      reasons: [],
    };
  } catch {
    return {
      ok: false,
      code: 'UPSTREAM_UNREACHABLE',
      status: 502,
      receiptId: null,
      reasons: ['n8n conveyor webhook was unreachable'],
    };
  }
}
