import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_INSTRUCTOR_AGENT_ID,
  INSTRUCTION_PACKET_CONTRACT,
  PROJECT_STATE_PACKET_CONTRACT,
  instructionPacketHash,
  projectStateFingerprint,
  resolveDeepSeekFederationMode,
  validateInstructionPacket,
  validateProjectStatePacket,
  type InstructionPacketV1,
  type ProjectStatePacketV1,
} from '../agentInterop.js';

const NOW = Date.parse('2026-09-09T03:00:00Z');

function statePacket(): ProjectStatePacketV1 {
  const withoutFingerprint: Omit<ProjectStatePacketV1, 'stateFingerprint'> = {
    contract: PROJECT_STATE_PACKET_CONTRACT,
    packetId: 'storyengine-save-beat-001',
    fromProject: 'storyengine',
    toAgent: DEEPSEEK_INSTRUCTOR_AGENT_ID,
    purpose: 'challenge',
    authority: 'proposal_only',
    goal: 'Make Save Beat failure semantics truthful.',
    source: {
      repository: 'jussray/StoryEngine',
      branch: 'main',
      headSha: 'a'.repeat(40),
      observedAt: '2026-09-09T02:55:00Z',
    },
    truth: {
      verified: ['route currently writes beat before audit log'],
      inferred: [],
      unknown: ['whether log failure can leave the UI lying'],
      blocked: [],
    },
    requestedSkills: ['ultrathink', 'attack', 'solutions', 'redteam', 'truthmode'],
    sensitivity: 'internal',
    expiresAt: '2026-09-09T04:00:00Z',
  };

  return { ...withoutFingerprint, stateFingerprint: projectStateFingerprint(withoutFingerprint) };
}

function instruction(source: ProjectStatePacketV1): InstructionPacketV1 {
  const withoutHash: Omit<InstructionPacketV1, 'instructionHash'> = {
    contract: INSTRUCTION_PACKET_CONTRACT,
    instructionId: 'deepseek-storyengine-001',
    sourcePacketId: source.packetId,
    sourceStateFingerprint: source.stateFingerprint,
    fromAgent: DEEPSEEK_INSTRUCTOR_AGENT_ID,
    toProject: source.fromProject,
    disposition: 'CHALLENGE',
    reality: ['The mutation and its audit receipt can diverge unless their semantics are bound.'],
    suspectedRootCause: 'The state write and audit write are separate failure boundaries.',
    smallestSafeFix: 'Inspect the existing transaction boundary before adding any route-level fallback.',
    proofRequired: ['focused backend regression', 'targeted Playwright when the browser-visible path changes'],
    crossProjectLesson: {
      pattern: 'state mutation plus receipt mutation needs truthful semantics',
      portable: true,
    },
    authorityRequested: 'none',
    projectMutationAuthorized: false,
    mergeAuthorized: false,
    deployAuthorized: false,
    providerMutationAuthorized: false,
  };

  return { ...withoutHash, instructionHash: instructionPacketHash(withoutHash) };
}

describe('DeepSeek AI-to-AI interop boundary', () => {
  it('accepts an exact-head, expiring project-state packet', () => {
    expect(validateProjectStatePacket(statePacket(), NOW)).toEqual([]);
  });

  it('expires stale packets instead of inheriting old project truth', () => {
    const packet = statePacket();
    expect(validateProjectStatePacket(packet, Date.parse('2026-09-09T04:00:01Z'))).toContain('project state packet is expired');
  });

  it('binds instructor output to the exact source project state', () => {
    const source = statePacket();
    expect(validateInstructionPacket(instruction(source), source, NOW)).toEqual([]);
  });

  it('revalidates the source packet lease when instructor output is consumed', () => {
    const source = statePacket();
    expect(validateInstructionPacket(
      instruction(source),
      source,
      Date.parse('2026-09-09T04:00:01Z'),
    )).toContain('instruction source packet invalid: project state packet is expired');
  });

  it('rejects any attempt to turn instructor output into mutation authority', () => {
    const source = statePacket();
    const unsafe = { ...instruction(source), projectMutationAuthorized: true };
    expect(validateInstructionPacket(unsafe, source, NOW)).toContain('DeepSeek instructor cannot authorize project mutation');
  });

  it('keeps cross-project federation shadow-only until usefulness is verified', () => {
    expect(resolveDeepSeekFederationMode('UNKNOWN')).toBe('shadow_only');
    expect(resolveDeepSeekFederationMode('UNVERIFIED')).toBe('shadow_only');
    expect(resolveDeepSeekFederationMode('BLOCKED')).toBe('shadow_only');
    expect(resolveDeepSeekFederationMode('VERIFIED')).toBe('proposal_only');
  });
});
