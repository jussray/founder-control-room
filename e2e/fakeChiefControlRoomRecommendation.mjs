import { createHash } from 'node:crypto';

export const CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT = 'chief-ai/control-room-recommendation@v1';

function normalizedOptional(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function recommendationHash(input) {
  return createHash('sha256').update(JSON.stringify({
    contract: CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT,
    projectName: input.projectName,
    projectType: input.projectType,
    mission: input.mission,
    currentState: input.currentState,
    repoIdentifier: normalizedOptional(input.repoIdentifier),
    stack: normalizedOptional(input.stack),
  })).digest('hex');
}

/**
 * Hermetic E2E stand-in for the already contract-tested Chief HTTPS client.
 *
 * The browser proof must exercise FCR's real recommendation -> explicit founder
 * approval -> project creation path without weakening production transport or
 * depending on an external deployment. Focused unit/contract tests cover the
 * production HTTPS client and reject malformed or authority-widening responses.
 */
export async function requestChiefControlRoomRecommendation(input) {
  const mission = String(input.mission ?? '').trim();
  const projectType = String(input.projectType ?? '').trim();
  return {
    contract: CHIEF_CONTROL_ROOM_RECOMMENDATION_CONTRACT,
    selectedBy: 'chief-ai-machine',
    title: `Chief recommends a ${projectType || 'project'} Control Room focused on ${mission || 'proof'}.`,
    focus: `Clear only the ${mission || 'proof'}-critical blockers for this exact project subject.`,
    capabilityIntents: [`${mission || 'proof'}-readiness`, 'proofmode'],
    evidencePriorities: ['exact release identity', 'runtime/provider evidence'],
    stateGuidance: 'Treat founder-declared state as context until Founder Control Room verifies reality independently.',
    nextGate: 'Prove one real user path against the exact release.',
    recommendationHash: recommendationHash(input),
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
