import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planFounderOsLab } from '../src/founder-os-lab/engine.js';
// The isolated JavaScript attack harness intentionally owns no generated TypeScript surface.
// @ts-expect-error Runtime behavior is verified directly through Vitest.
import {
  inspectAuthorityBoundary,
  runAdversarialSimulation,
} from '../labs/ai-company/src/adversarial.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF_URL = 'https://proof.example.test/adversarial-cross-lab';

function loadEnvelope() {
  return JSON.parse(
    readFileSync(
      resolve('labs/ai-company/fixtures/adversarial-safe-envelope.json'),
      'utf8',
    ),
  );
}

function founderPlan() {
  return planFounderOsLab({
    goal: 'Prepare one governed synthetic social handoff.',
    action: 'queue-social',
    approval: {
      id: 'founder-approved:adversarial-cross-lab',
      actions: ['queue-social'],
    },
    evidence: {
      repository: 'jussray/founder-control-room',
      commitSha: SHA,
      proofUrls: [PROOF_URL],
    },
    socialPost: {
      platform: 'linkedin',
      accountId: 'synthetic-founder-linkedin',
      contentField: 'linkedin_draft',
      text: `A governed synthetic company handoff remains reviewable and reversible. Proof: ${PROOF_URL}`,
      traction: 'Adversarial cases execute against both isolated company labs.',
      governanceAdvantage: 'Authority, execution, transport, and receipts remain separate states.',
      audienceValue: 'Builders can inspect deterministic failure evidence.',
      investorSignal: 'The company architecture is becoming falsifiable infrastructure.',
      proofLinks: [{ label: 'Synthetic adversarial proof', url: PROOF_URL }],
      sourceRepository: 'jussray/founder-control-room',
      sourceCommitSha: SHA,
      mode: 'queue',
      publishAllowed: true,
      founderApprovalId: 'founder-approved:adversarial-cross-lab',
    },
  });
}

describe('AI company adversarial cross-lab boundary', () => {
  it('accepts only the untampered L0 outputs from both labs', () => {
    const founder = founderPlan();
    const company = runAdversarialSimulation(loadEnvelope());

    expect(company.status).toBe('simulated');
    expect(inspectAuthorityBoundary(founder)).toEqual([]);
    expect(inspectAuthorityBoundary(company.result)).toEqual([]);
  });

  it('detects authority theft and isolation escape in a Founder OS result copy', () => {
    const tampered = structuredClone(founderPlan());
    (tampered.authority as { executionAllowed: boolean }).executionAllowed = true;
    (tampered.isolation as { externalCalls: boolean }).externalCalls = true;

    expect(inspectAuthorityBoundary(tampered)).toEqual([
      'execution_authority_enabled',
      'isolation_boundary_broken',
    ]);
  });

  it('detects forged authority and receipt claims in an AI Company result copy', () => {
    const company = runAdversarialSimulation(loadEnvelope());
    const tampered = structuredClone(company.result);
    tampered.authority.level = 'L4';
    tampered.authority.mode = 'live';
    tampered.receipts[0].provider = 'live-buffer';
    tampered.receipts[0].executionAllowed = true;
    tampered.receipts[0].publicUrl = 'https://public.example.test/forged';

    expect(inspectAuthorityBoundary(tampered)).toEqual([
      'authority_level_escalated',
      'authority_mode_escalated',
      'receipt_provider_not_fake',
      'receipt_claims_execution',
      'receipt_claims_public_url',
    ]);
  });

  it('keeps the kill switch fail-closed before either campaign or receipt creation', () => {
    const envelope = loadEnvelope();
    envelope.killSwitch = true;

    const result = runAdversarialSimulation(envelope);

    expect(result).toMatchObject({
      status: 'blocked',
      phase: 'preflight',
      simulatorInvoked: false,
      result: null,
      receipts: [],
    });
    expect(result.blockers).toContain('kill_switch_active');
    expect(result.authority.executionAllowed).toBe(false);
  });
});
