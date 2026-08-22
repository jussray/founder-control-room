import { describe, expect, it } from 'vitest';
import type { FounderOsLabRequest } from '../src/founder-os-lab/contracts.js';
import {
  FOUNDER_OS_SANDBOX_CAPABILITIES,
  inspectFounderOsSandboxPlan,
  runFounderOsSandbox,
} from '../src/founder-os-lab/sandbox.js';
// The isolated JavaScript lab intentionally exposes no TypeScript runtime surface.
// @ts-expect-error Runtime boundary is exercised directly.
import {
  AI_COMPANY_SANDBOX_CAPABILITIES,
  runCompanySandbox,
} from '../labs/ai-company/src/sandbox.mjs';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF_URL = 'https://proof.example.test/sandbox-parity';
const SHA256_HEX = /^[0-9a-f]{64}$/;

function founderRequest(): FounderOsLabRequest {
  return {
    goal: 'Prepare a synthetic founder draft inside the sealed lab.',
    action: 'draft-social',
    evidence: {
      repository: 'jussray/founder-control-room',
      commitSha: SHA,
      proofUrls: [PROOF_URL],
    },
    socialPost: {
      platform: 'linkedin',
      accountId: 'synthetic-founder-linkedin',
      contentField: 'linkedin_draft',
      text: `A sealed founder sandbox generated a deterministic review draft with no provider authority. Proof: ${PROOF_URL}`,
      traction: 'Two isolated planning surfaces now share one sealed capability boundary.',
      governanceAdvantage: 'Inputs and outputs are cloned, frozen, fingerprinted, and incapable of live side effects.',
      audienceValue: 'Reviewers can distinguish a sandbox result from a provider receipt.',
      investorSignal: 'The AI company is becoming inspectable infrastructure rather than an autonomy claim.',
      proofLinks: [{ label: 'Synthetic sandbox proof', url: PROOF_URL }],
      sourceRepository: 'jussray/founder-control-room',
      sourceCommitSha: SHA,
      mode: 'draft',
      publishAllowed: false,
      founderApprovalId: null,
    },
  };
}

function companyInput() {
  return {
    dataClassification: 'synthetic',
    projectSlug: 'synthetic-founder-project',
    eventId: 'synthetic-sandbox-parity',
    summary: 'A sealed AI company sandbox reached a deterministic review state.',
    requestedMode: 'draft',
    audiences: ['founders'],
    platforms: ['linkedin'],
    proof: {
      projectSlug: 'synthetic-founder-project',
      status: 'ready',
      urls: [PROOF_URL],
    },
    traction: [
      {
        label: 'Synthetic governed demand',
        value: '2 sandbox executions',
        sourceUrl: PROOF_URL,
      },
    ],
    governanceAdvantages: [
      {
        label: 'No live capability crosses the sandbox membrane',
        proofUrl: PROOF_URL,
      },
    ],
    founderApprovalId: null,
  };
}

describe('Founder OS and AI Company sandbox parity', () => {
  it('uses the same zero-capability membrane in both labs', () => {
    const founder = runFounderOsSandbox(founderRequest());
    const company = runCompanySandbox(companyInput());

    expect(founder.status).toBe('simulated');
    expect(company.status).toBe('simulated');
    expect(founder.sandbox.capabilities).toEqual(FOUNDER_OS_SANDBOX_CAPABILITIES);
    expect(company.sandbox.capabilities).toEqual(AI_COMPANY_SANDBOX_CAPABILITIES);
    expect(founder.sandbox.capabilities).toEqual(company.sandbox.capabilities);
    expect(Object.values(founder.sandbox.capabilities).every((value) => value === false)).toBe(true);
    expect(founder.plan?.authority.executionAllowed).toBe(false);
    expect(company.result?.authority.executionAllowed).toBe(false);
    expect(company.result?.liveSideEffects).toBe(false);
  });

  it('produces deterministic SHA-256 sealed results for identical synthetic input', () => {
    const founderOne = runFounderOsSandbox(founderRequest());
    const founderTwo = runFounderOsSandbox(founderRequest());
    const companyOne = runCompanySandbox(companyInput());
    const companyTwo = runCompanySandbox(companyInput());

    expect(founderOne.sandbox.inputFingerprint).toBe(founderTwo.sandbox.inputFingerprint);
    expect(founderOne.sandbox.outputFingerprint).toBe(founderTwo.sandbox.outputFingerprint);
    expect(founderOne.sandbox.inputFingerprint).toMatch(SHA256_HEX);
    expect(founderOne.sandbox.outputFingerprint).toMatch(SHA256_HEX);
    expect(founderOne.sandbox.id).toBe(`founder-os-${founderOne.sandbox.inputFingerprint}`);
    expect(founderOne.plan).toEqual(founderTwo.plan);
    expect(companyOne.sandbox.inputFingerprint).toBe(companyTwo.sandbox.inputFingerprint);
    expect(companyOne.sandbox.outputFingerprint).toBe(companyTwo.sandbox.outputFingerprint);
    expect(companyOne.sandbox.inputFingerprint).toMatch(SHA256_HEX);
    expect(companyOne.sandbox.outputFingerprint).toMatch(SHA256_HEX);
    expect(companyOne.sandbox.id).toBe(`ai-company-${companyOne.sandbox.inputFingerprint}`);
    expect(companyOne.result).toEqual(companyTwo.result);
    expect(Object.isFrozen(founderOne)).toBe(true);
    expect(Object.isFrozen(founderOne.plan)).toBe(true);
    expect(Object.isFrozen(companyOne)).toBe(true);
    expect(Object.isFrozen(companyOne.result)).toBe(true);
  });

  it('fails closed when either sandbox is pinned to a stale or substituted fingerprint', () => {
    const founder = runFounderOsSandbox(founderRequest(), { expectedInputFingerprint: '0'.repeat(64) });
    const company = runCompanySandbox(companyInput(), { expectedInputFingerprint: '0'.repeat(64) });

    expect(founder).toMatchObject({
      status: 'blocked',
      plannerInvoked: false,
      violations: ['input_fingerprint_mismatch'],
      plan: null,
    });
    expect(company).toMatchObject({
      status: 'blocked',
      simulatorInvoked: false,
      violations: ['input_fingerprint_mismatch'],
      result: null,
    });
  });

  it('honors the kill switch before either planner or simulator runs', () => {
    const founder = runFounderOsSandbox(founderRequest(), { killSwitch: true });
    const company = runCompanySandbox(companyInput(), { killSwitch: true });

    expect(founder).toMatchObject({
      status: 'blocked',
      plannerInvoked: false,
      violations: ['kill_switch_active'],
      plan: null,
    });
    expect(company).toMatchObject({
      status: 'blocked',
      simulatorInvoked: false,
      violations: ['kill_switch_active'],
      result: null,
    });
  });

  it('ignores caller attempts to grant capabilities through option-shaped objects', () => {
    const founder = runFounderOsSandbox(founderRequest(), {
      capabilities: { network: true, providers: true },
      executor: () => {
        throw new Error('external executor must not run');
      },
    } as never);
    const company = runCompanySandbox(companyInput(), {
      capabilities: { network: true, providers: true },
      transport: {
        dispatch() {
          throw new Error('external transport must not run');
        },
      },
    });

    expect(founder.status).toBe('simulated');
    expect(company.status).toBe('simulated');
    expect(Object.values(founder.sandbox.capabilities).every((value) => value === false)).toBe(true);
    expect(Object.values(company.sandbox.capabilities).every((value) => value === false)).toBe(true);
  });

  it('detects a forged Founder OS authority or isolation claim', () => {
    const run = runFounderOsSandbox(founderRequest());
    const forged = JSON.parse(JSON.stringify(run.plan));
    forged.authority.executionAllowed = true;
    forged.isolation.providerCalls = true;

    expect(inspectFounderOsSandboxPlan(forged)).toEqual([
      'execution_authority_enabled',
      'isolation_boundary_broken',
    ]);
  });
});
