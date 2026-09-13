import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_APPLICATION_SUBMISSION_CONTRACT,
  validateExternalApplicationConfirmation,
  validateExternalApplicationSubmission,
  type ExternalApplicationSubmissionBundle,
} from '../externalApplicationSubmission.js';
import {
  isCapabilityCandidateEligible,
  selectFreeFirstCapability,
  type CapabilityCandidate,
} from '../freeFirstCapabilityPolicy.js';
import { capabilities } from '../workbenchRegistry.js';

const PAYLOAD_HASH = `sha256:${'a'.repeat(64)}`;
const DECK_HASH = `sha256:${'b'.repeat(64)}`;

function applicationBundle(): ExternalApplicationSubmissionBundle {
  return {
    contract: EXTERNAL_APPLICATION_SUBMISSION_CONTRACT,
    provider: 'Giant Ventures',
    applicationUrl: 'https://www.giant.vc/application',
    payloadSnapshotRef: 'evidence:application-payload:giant-v1',
    payloadSha256: PAYLOAD_HASH,
    fields: [
      { id: 'company_name', required: true, value: 'Se’kret Bip' },
      { id: 'website', required: true, value: 'https://sekretbip.net' },
    ],
    uploads: [
      { id: 'pitch_deck', required: true, artifactRef: 'artifact:giant-deck-v1', sha256: DECK_HASH },
    ],
    approval: {
      receiptId: 'approval:giant-v1',
      payloadSha256: PAYLOAD_HASH,
      artifactSha256: [DECK_HASH],
    },
    providerReadiness: {
      browserReady: true,
      authenticated: true,
      executionReady: true,
    },
  };
}

describe('capability workbench registry', () => {
  it('keeps every reviewed capability complete and uniquely addressable', () => {
    const ids = capabilities.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(capabilities.length).toBeGreaterThanOrEqual(12);

    for (const capability of capabilities) {
      expect(capability.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/);
      expect(capability.inputs.length).toBeGreaterThan(0);
      expect(capability.proof.length).toBeGreaterThan(0);
      expect(capability.risk).toBeTruthy();
      expect(capability.implementation).toBeTruthy();
    }
  });

  it('keeps voice and future interaction surfaces inside the shared FCR authority runtime', () => {
    const runtime = capabilities.find((capability) => capability.id === 'shared-capability-runtime-v1');

    expect(runtime).toBeDefined();
    expect(runtime?.kind).toBe('Contract');
    expect(runtime?.purpose).toContain('same intent, live-authority, consequence, approval, execution-receipt, outcome-verification, and next-gate spine');
    expect(runtime?.environment).toContain('FCR remains the control plane');
    expect(runtime?.proof).toContain('Capability discovery is treated as a hint, never execution authority');
    expect(runtime?.proof).toContain('Live authority is rechecked immediately before execution');
    expect(runtime?.proof).toContain('Approvals bind to the exact proposal instead of an unscoped yes/no utterance');
    expect(runtime?.proof).toContain('Provider acceptance and verified founder outcome remain separate truth states');
    expect(runtime?.risk).toContain('does not expose provider credentials');
    expect(runtime?.risk).toContain('does not');
    expect(runtime?.implementation).toContain("type Surface = 'voice' | 'text' | 'mobile' | 'desktop' | 'automation' | 'future'");
    expect(runtime?.implementation).toContain("type Consequence = 'READ' | 'REVERSIBLE_WRITE' | 'CONSEQUENTIAL_WRITE'");
    expect(runtime?.implementation).toContain('Bind approval to proposalId');
  });

  it('keeps external application submission inside the shared evidence and authority spine', () => {
    const submission = capabilities.find((capability) => capability.id === 'external-application-submission-v1');

    expect(submission).toBeDefined();
    expect(submission?.kind).toBe('Contract');
    expect(submission?.environment).toContain('FCR remains the control plane');
    expect(submission?.proof).toContain('Exact approved payload is durably referenced and hash-bound before form entry');
    expect(submission?.proof).toContain('Provider browser/auth/execution readiness is checked before form mutation begins');
    expect(submission?.proof).toContain('Completion requires provider confirmation evidence bound back to the same payload and artifacts');
    expect(submission?.risk).toContain('does not create provider credentials');
    expect(submission?.risk).toContain('invent missing application answers');
  });

  it('permits application submission only when the exact approved bundle and provider are ready', () => {
    expect(validateExternalApplicationSubmission(applicationBundle())).toEqual({ ready: true, blockers: [] });
  });

  it('blocks missing required answers, provider execution failures, and approval drift before submit', () => {
    const bundle = applicationBundle();
    bundle.fields[0].value = '';
    bundle.providerReadiness.executionReady = false;
    bundle.providerReadiness.blocker = 'provider_wallet_unfunded';
    bundle.approval.payloadSha256 = `sha256:${'c'.repeat(64)}`;

    const result = validateExternalApplicationSubmission(bundle);
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('missing_required_field:company_name');
    expect(result.blockers).toContain('provider_wallet_unfunded');
    expect(result.blockers).toContain('approval_payload_mismatch');
  });

  it('requires confirmation evidence to bind back to the same approved payload and deck', () => {
    const bundle = applicationBundle();
    expect(validateExternalApplicationConfirmation({
      contract: EXTERNAL_APPLICATION_SUBMISSION_CONTRACT,
      provider: bundle.provider,
      payloadSha256: PAYLOAD_HASH,
      artifactSha256: [DECK_HASH],
      submittedAt: '2026-09-12T00:55:00.000Z',
      confirmationId: 'giant-confirmation-123',
    }, bundle)).toEqual({ ready: true, blockers: [] });

    const missingReceipt = validateExternalApplicationConfirmation({
      contract: EXTERNAL_APPLICATION_SUBMISSION_CONTRACT,
      provider: bundle.provider,
      payloadSha256: PAYLOAD_HASH,
      artifactSha256: [DECK_HASH],
      submittedAt: '2026-09-12T00:55:00.000Z',
    }, bundle);
    expect(missingReceipt.ready).toBe(false);
    expect(missingReceipt.blockers).toContain('missing_confirmation_evidence');
  });

  it('uses cost only after safety, privacy, rights, quality, quota, and automation gates pass', () => {
    const candidates: CapabilityCandidate[] = [
      {
        id: 'unsafe-local',
        costClass: 'LOCAL_NO_PROVIDER_FEE',
        safetyEligible: false,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'local-runtime',
        eligibilityRevision: 'r1',
      },
      {
        id: 'hosted-free',
        costClass: 'HOSTED_FREE_ALLOWANCE',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'verified-free-quota',
        eligibilityRevision: 'r2',
      },
      {
        id: 'paid',
        costClass: 'PAID',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'paid-capacity',
        eligibilityRevision: 'r3',
      },
    ];

    const requirements = {
      commercialUseRequired: true,
      automationRequired: true,
      minimumQualityMet: () => true,
    };

    expect(isCapabilityCandidateEligible(candidates[0], requirements)).toBe(false);
    expect(selectFreeFirstCapability(candidates, requirements)).toEqual({
      providerId: 'hosted-free',
      costClass: 'HOSTED_FREE_ALLOWANCE',
      eligibilityRevision: 'r2',
      licenseEvidence: 'verified-license',
      quotaEvidence: 'verified-free-quota',
    });
  });

  it('falls back to paid only when lower-cost candidates fail current eligibility', () => {
    const candidates: CapabilityCandidate[] = [
      {
        id: 'local-no-rights',
        costClass: 'LOCAL_NO_PROVIDER_FEE',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'UNKNOWN',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: null,
        quotaEvidence: 'local-runtime',
        eligibilityRevision: 'r4',
      },
      {
        id: 'free-no-automation',
        costClass: 'HOSTED_FREE_ALLOWANCE',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: false,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'verified-free-quota',
        eligibilityRevision: 'r5',
      },
      {
        id: 'paid-eligible',
        costClass: 'PAID',
        safetyEligible: true,
        privacyEligible: true,
        commercialRights: 'VERIFIED',
        quotaAvailable: true,
        automationEligible: true,
        licenseEvidence: 'verified-license',
        quotaEvidence: 'paid-capacity',
        eligibilityRevision: 'r6',
      },
    ];

    expect(selectFreeFirstCapability(candidates, {
      commercialUseRequired: true,
      automationRequired: true,
      minimumQualityMet: () => true,
    })?.providerId).toBe('paid-eligible');
  });
});