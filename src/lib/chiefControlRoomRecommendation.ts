export const CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT = 'chief-ai/control-room-recommendation@v1';

export interface ChiefControlRoomRecommendationInput {
  projectName: string;
  projectType: string;
  mission: string;
  currentState: string;
  repoIdentifier?: string | null;
  stack?: string | null;
}

export interface ChiefControlRoomRecommendation {
  contract: typeof CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT;
  selectedBy: 'chief-ai-machine';
  title: string;
  focus: string;
  capabilityIntents: string[];
  evidencePriorities: string[];
  stateGuidance: string;
  nextGate: string;
  recommendationHash: string;
  founderDecision: {
    required: true;
    explicitDecisionOnly: true;
    accepted: false;
    createControlRoomAuthorized: false;
  };
  fcrHandoff: {
    stateAuthority: 'founder-control-room';
    evidenceAuthority: 'founder-control-room';
    executionAuthority: 'unresolved-by-chief-ai';
    preserveFounderDeclaredState: true;
    verifyRealityIndependently: true;
  };
  governanceBoundary: {
    proposalOnly: true;
    founderApprovalRequired: true;
    executionAuthorized: false;
    createControlRoomAuthorized: false;
    projectStateMutationAuthorized: false;
    providerMutationAuthorized: false;
    mergeAuthorized: false;
    deploymentAuthorized: false;
    credentialAuthority: 'none';
    stateAuthority: 'founder-control-room';
    evidenceAuthority: 'founder-control-room';
    recommendationMutationInvalidatesAcceptance: true;
  };
}

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

const HASH = /^[0-9a-f]{64}$/;
const MAX_RESPONSE_BYTES = 64 * 1024;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, field: string, maxLength = 2_000): string {
  if (typeof value !== 'string') throw new Error(`Chief response ${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`Chief response ${field} is empty or too large`);
  }
  return normalized;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error(`Chief response ${field} must be a bounded string array`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`, 240));
}

function requireExact(value: unknown, expected: unknown, field: string): void {
  if (value !== expected) {
    throw new Error(`Chief response ${field} violated the onboarding authority contract`);
  }
}

function normalizedOptional(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function chiefBaseUrl(env: NodeJS.ProcessEnv): URL {
  const configured = env.CHIEF_AI_BASE_URL?.trim();
  if (!configured) throw new Error('CHIEF_AI_BASE_URL is not configured');
  const url = new URL(configured);
  if (url.protocol !== 'https:') throw new Error('CHIEF_AI_BASE_URL must use https');
  if (url.username || url.password) throw new Error('CHIEF_AI_BASE_URL must not contain credentials');
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url;
}

async function boundedJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('Chief onboarding response exceeded the 64 KiB limit');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Chief onboarding response was not valid JSON');
  }
}

function validateRecommendation(
  payload: unknown,
  input: ChiefControlRoomRecommendationInput,
): ChiefControlRoomRecommendation {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error('Chief onboarding response is missing data');
  }
  const recommendation = payload.data.recommendation;
  const boundary = payload.data.governanceBoundary;
  if (!isRecord(recommendation) || !isRecord(boundary)) {
    throw new Error('Chief onboarding response is missing its recommendation boundary');
  }
  const project = recommendation.project;
  const founderDecision = recommendation.founderDecision;
  const handoff = recommendation.fcrHandoff;
  if (!isRecord(project) || !isRecord(founderDecision) || !isRecord(handoff)) {
    throw new Error('Chief onboarding recommendation is missing bound project or authority data');
  }

  requireExact(recommendation.contract, CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT, 'contract');
  requireExact(recommendation.selectedBy, 'chief-ai-machine', 'selectedBy');
  requireExact(project.name, input.projectName, 'project.name');
  requireExact(project.projectType, input.projectType, 'project.projectType');
  requireExact(project.mission, input.mission, 'project.mission');
  requireExact(project.currentState, input.currentState, 'project.currentState');
  requireExact(project.repoIdentifier ?? null, normalizedOptional(input.repoIdentifier), 'project.repoIdentifier');
  requireExact(project.stack ?? null, normalizedOptional(input.stack), 'project.stack');

  const recommendationHash = requireString(recommendation.recommendationHash, 'recommendationHash', 64).toLowerCase();
  if (!HASH.test(recommendationHash)) {
    throw new Error('Chief response recommendationHash must be a 64-character SHA-256 digest');
  }

  requireExact(founderDecision.required, true, 'founderDecision.required');
  requireExact(founderDecision.explicitDecisionOnly, true, 'founderDecision.explicitDecisionOnly');
  requireExact(founderDecision.accepted, false, 'founderDecision.accepted');
  requireExact(founderDecision.createControlRoomAuthorized, false, 'founderDecision.createControlRoomAuthorized');

  requireExact(handoff.stateAuthority, 'founder-control-room', 'fcrHandoff.stateAuthority');
  requireExact(handoff.evidenceAuthority, 'founder-control-room', 'fcrHandoff.evidenceAuthority');
  requireExact(handoff.executionAuthority, 'unresolved-by-chief-ai', 'fcrHandoff.executionAuthority');
  requireExact(handoff.preserveFounderDeclaredState, true, 'fcrHandoff.preserveFounderDeclaredState');
  requireExact(handoff.verifyRealityIndependently, true, 'fcrHandoff.verifyRealityIndependently');

  requireExact(boundary.proposalOnly, true, 'governanceBoundary.proposalOnly');
  requireExact(boundary.founderApprovalRequired, true, 'governanceBoundary.founderApprovalRequired');
  requireExact(boundary.executionAuthorized, false, 'governanceBoundary.executionAuthorized');
  requireExact(boundary.createControlRoomAuthorized, false, 'governanceBoundary.createControlRoomAuthorized');
  requireExact(boundary.projectStateMutationAuthorized, false, 'governanceBoundary.projectStateMutationAuthorized');
  requireExact(boundary.providerMutationAuthorized, false, 'governanceBoundary.providerMutationAuthorized');
  requireExact(boundary.mergeAuthorized, false, 'governanceBoundary.mergeAuthorized');
  requireExact(boundary.deploymentAuthorized, false, 'governanceBoundary.deploymentAuthorized');
  requireExact(boundary.credentialAuthority, 'none', 'governanceBoundary.credentialAuthority');
  requireExact(boundary.stateAuthority, 'founder-control-room', 'governanceBoundary.stateAuthority');
  requireExact(boundary.evidenceAuthority, 'founder-control-room', 'governanceBoundary.evidenceAuthority');
  requireExact(
    boundary.recommendationMutationInvalidatesAcceptance,
    true,
    'governanceBoundary.recommendationMutationInvalidatesAcceptance',
  );

  return {
    contract: CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT,
    selectedBy: 'chief-ai-machine',
    title: requireString(recommendation.title, 'title', 320),
    focus: requireString(recommendation.focus, 'focus', 1_000),
    capabilityIntents: requireStringArray(recommendation.capabilityIntents, 'capabilityIntents'),
    evidencePriorities: requireStringArray(recommendation.evidencePriorities, 'evidencePriorities'),
    stateGuidance: requireString(recommendation.stateGuidance, 'stateGuidance', 1_000),
    nextGate: requireString(recommendation.nextGate, 'nextGate', 1_000),
    recommendationHash,
    founderDecision: {
      required: true,
      explicitDecisionOnly: true,
      accepted: false,
      createControlRoomAuthorized: false,
    },
    fcrHandoff: {
      stateAuthority: 'founder-control-room',
      evidenceAuthority: 'founder-control-room',
      executionAuthority: 'unresolved-by-chief-ai',
      preserveFounderDeclaredState: true,
      verifyRealityIndependently: true,
    },
    governanceBoundary: {
      proposalOnly: true,
      founderApprovalRequired: true,
      executionAuthorized: false,
      createControlRoomAuthorized: false,
      projectStateMutationAuthorized: false,
      providerMutationAuthorized: false,
      mergeAuthorized: false,
      deploymentAuthorized: false,
      credentialAuthority: 'none',
      stateAuthority: 'founder-control-room',
      evidenceAuthority: 'founder-control-room',
      recommendationMutationInvalidatesAcceptance: true,
    },
  };
}

export async function requestChiefControlRoomRecommendation(
  input: ChiefControlRoomRecommendationInput,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: FetchLike;
  } = {},
): Promise<ChiefControlRoomRecommendation> {
  const baseUrl = chiefBaseUrl(options.env ?? process.env);
  const endpoint = new URL('/api/chief/control-room-recommendation', baseUrl);
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectName: input.projectName,
      projectType: input.projectType,
      mission: input.mission,
      currentState: input.currentState,
      repoIdentifier: normalizedOptional(input.repoIdentifier),
      stack: normalizedOptional(input.stack),
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await boundedJson(response);
  if (!response.ok) {
    const message = isRecord(payload)
      && isRecord(payload.error)
      && typeof payload.error.message === 'string'
      ? payload.error.message
      : `Chief onboarding recommendation failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return validateRecommendation(payload, input);
}
