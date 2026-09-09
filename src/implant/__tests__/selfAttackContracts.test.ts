import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hashApprovalPayload,
  validateApprovalExecution,
  type ApprovalBinding,
} from '../../approvals/approval.js';
import {
  canRenderVerifiedClaim,
  type ClaimEvidenceRecord,
  type TruthClaim,
} from '../../truth/truth.js';
import { validateFirstSliceRun } from '../../chief/firstSliceContracts.js';
import { evaluatePublicClaimGate } from '../../content/publicClaimGate.js';
import {
  DEFAULT_MEMORY_RETENTION_POLICY,
  ROLE_CAPABILITIES,
  mutationAllowed,
  type MutableModuleFlags,
} from '../contracts.js';

describe('ULTRATHINK self-attack implant contracts', () => {
  it('requires verified fresh compatible evidence before rendering green truth', () => {
    const evidence: ClaimEvidenceRecord = {
      id: 'e1',
      source: 'exact_target_verification',
      scope: 'repository_state',
      observedAt: '2026-09-08T20:00:00Z',
      freshnessExpiresAt: '2026-09-09T20:00:00Z',
      targetFingerprint: 'sha:abc',
      integrityDigest: null,
      provenanceId: 'p1',
    };
    const claim: TruthClaim = {
      id: 'c1',
      subjectType: 'repository',
      subjectId: 'fcr',
      assertion: 'exact target is current',
      status: 'verified',
      source: 'exact_target_verification',
      evidenceScope: ['repository_state'],
      targetFingerprint: 'sha:abc',
      freshnessExpiresAt: '2026-09-09T20:00:00Z',
      evidenceIds: ['e1'],
      doesNotProve: ['runtime deployment'],
      conflictIds: [],
      provenanceId: 'p1',
    };

    expect(canRenderVerifiedClaim(claim, {
      now: '2026-09-08T21:00:00Z',
      currentTargetFingerprint: 'sha:abc',
      evidenceById: new Map([['e1', evidence]]),
    })).toBe(true);

    expect(canRenderVerifiedClaim(claim, {
      now: '2026-09-08T21:00:00Z',
      currentTargetFingerprint: 'sha:other',
      evidenceById: new Map([['e1', evidence]]),
    })).toBe(false);

    expect(canRenderVerifiedClaim({ ...claim, status: 'inferred' }, {
      now: '2026-09-08T21:00:00Z',
      currentTargetFingerprint: 'sha:abc',
      evidenceById: new Map([['e1', evidence]]),
    })).toBe(false);
  });

  it('binds approval to canonical payload, actor, target fingerprint, expiry, and replay state', () => {
    const payload = { z: 2, a: { y: 1, x: true } };
    const binding: ApprovalBinding = {
      approvalId: 'a1',
      actorId: 'founder-1',
      action: 'repo_write',
      payloadHash: hashApprovalPayload(payload),
      targetId: 'jussray/founder-control-room',
      targetFingerprint: '34ffe99e',
      providerCapability: 'repo_write',
      projectId: 'fcr',
      branch: 'main',
      riskClass: 'high',
      expiration: '2026-09-09T00:00:00Z',
      rollbackReference: 'revert commit',
      idempotencyKey: 'idem-1',
      createdAt: '2026-09-08T20:00:00Z',
      status: 'approved_once',
    };

    expect(hashApprovalPayload({ a: { x: true, y: 1 }, z: 2 }))
      .toBe(binding.payloadHash);

    const attempt = {
      actorId: 'founder-1',
      action: 'repo_write',
      payload,
      targetId: 'jussray/founder-control-room',
      targetFingerprint: '34ffe99e',
      providerCapability: 'repo_write',
      projectId: 'fcr',
      branch: 'main',
      now: '2026-09-08T21:00:00Z',
    };

    expect(validateApprovalExecution(binding, attempt)).toEqual({
      ok: true,
      payloadHash: binding.payloadHash,
    });

    expect(validateApprovalExecution(binding, {
      ...attempt,
      targetFingerprint: 'moved',
    })).toEqual({ ok: false, code: 'fingerprint_mismatch' });

    expect(validateApprovalExecution(
      binding,
      attempt,
      new Set(['idem-1']),
    )).toEqual({ ok: false, code: 'approval_replay' });
  });

  it('requires exactly one protective or clarifying move for sensitive first-slice input', () => {
    expect(validateFirstSliceRun({
      mirror: { headline: 'h', summary: 's' },
      tags: ['legal'],
      moves: [{
        kind: 'protective_move',
        text: 'Pause and gather the exact document.',
        timeEstimateMinutes: null,
        gateWarning: 'No external action.',
      }],
      privacyChoice: 'process_without_saving',
      sensitiveCategories: ['legal'],
      modelExecutionState: 'blocked',
      provenanceId: 'p1',
    })).toEqual({ ok: true });

    expect(validateFirstSliceRun({
      mirror: { headline: 'h', summary: 's' },
      tags: ['legal'],
      moves: [{
        kind: 'tiny_move',
        text: 'Act now',
        timeEstimateMinutes: 10,
        gateWarning: null,
      }],
      privacyChoice: 'process_without_saving',
      sensitiveCategories: ['legal'],
      modelExecutionState: 'blocked',
      provenanceId: 'p1',
    })).toEqual({ ok: false, code: 'sensitive_move_not_protective' });
  });

  it('blocks unsupported public claims and requires aspirational future tense', () => {
    expect(evaluatePublicClaimGate([{
      id: 'c1',
      text: 'We are number one.',
      classification: 'unsupported',
      rewrittenForUncertainty: false,
      futureTense: false,
    }])).toEqual({
      allowed: false,
      blockedClaimIds: ['c1'],
      reason: 'unsupported_claim',
    });

    expect(evaluatePublicClaimGate([{
      id: 'c2',
      text: 'We aim to expand.',
      classification: 'aspirational',
      rewrittenForUncertainty: false,
      futureTense: true,
    }])).toEqual({ allowed: true });
  });

  it('keeps memory ephemeral by default and break-glass read-only', () => {
    expect(DEFAULT_MEMORY_RETENTION_POLICY.defaultMode).toBe('ephemeral');
    expect(DEFAULT_MEMORY_RETENTION_POLICY.retention.raw).toBe('none');
    expect(ROLE_CAPABILITIES.auditor.mayExecute).toBe(false);
    expect(ROLE_CAPABILITIES.founder.mayApproveCritical).toBe(true);

    const flags: MutableModuleFlags = {
      chief_ai: true,
      tone_guard: true,
      sensitive_detection: true,
      memory_persistence: true,
      provider_execution: true,
      public_export: true,
    };

    expect(mutationAllowed('provider_execution', flags, {
      enabled: true,
      mode: 'read_only',
      reason: 'recovery',
      activatedBy: 'founder',
      activatedAt: '2026-09-08T20:00:00Z',
      expiresAt: '2026-09-08T21:00:00Z',
    })).toBe(false);
  });

  it('pins every normative implant section in the effective v1.4 addendum', () => {
    const addendum = readFileSync(
      new URL('../../../docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_4_ADDENDUM.md', import.meta.url),
      'utf8',
    );

    for (const marker of [
      '24.1 Value-first sequencing',
      '24.3 Truth resolution',
      '24.4 Cryptographic approval binding',
      '24.5 Protective tiny move',
      '24.6 Memory minimization',
      '24.7 Tone Guard diff log',
      '24.8 Model failure posture',
      '24.9 Provider capability manifest',
      '24.10 Three primary founder jobs',
      '24.11 Non-binary roles',
      '24.12 Break-glass recovery',
      '24.13 Value budget',
      '24.14 Founder-outcome telemetry',
      '24.15 Public claim gate',
      '24.16 Feature-flag kill switches',
      '24.17 Prompt regression suite',
      '25. Calm Cockpit Product Design',
    ]) {
      expect(addendum).toContain(marker);
    }
  });
});
