import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../capabilityKernel.js';
import type { FounderOsLabAction, FounderOsLabApproval } from '../contracts.js';
import { planFounderOsLab } from '../engine.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REPOSITORY = 'jussray/founder-control-room';
const PROJECT = 'founder-control-room';
const GITHUB_PROOF = `https://github.com/${REPOSITORY}/commit/${SHA}`;

function capabilityPlan(goal: string): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal,
    projectSlug: PROJECT,
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['futureyou', 'truthmode', 'redteam'],
    routingReason: 'Chief AI selected the smallest provider-preview capability set.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['provider identity evidence', 'exact-head binding'],
    outcomeSignals: ['preview-evidence-complete'],
    rollback: 'Discard the preview and keep provider execution disabled.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

function approval(action: Extract<FounderOsLabAction, 'merge-code' | 'deploy-code' | 'send-email'>, plan: V10CapabilityPlan): FounderOsLabApproval {
  return {
    id: `founder-approved:${action}:review-contract`,
    actions: [action],
    projectSlug: plan.projectSlug,
    expectedHeadSha: plan.expectedHeadSha,
    capabilityPlanHash: plan.planHash,
  };
}

describe('Founder OS provider evidence exact-head review contracts', () => {
  it('rejects repeated separators in an otherwise matching GitHub commit URL', () => {
    const goal = 'Preview the exact-head merge gate.';
    const selectedPlan = capabilityPlan(goal);
    const plan = planFounderOsLab({
      goal,
      action: 'merge-code',
      provider: 'github',
      capabilityPlan: selectedPlan,
      approval: approval('merge-code', selectedPlan),
      evidence: {
        repository: REPOSITORY,
        commitSha: SHA,
        proofUrls: [
          `https://github.com/jussray//founder-control-room/commit/${SHA}`,
        ],
      },
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.truth.blocked.join(' ')).toContain('authoritative GitHub commit URL');
    expect(plan.authority.executionAllowed).toBe(false);
  });

  it('binds Cloudflare project evidence to the selected account and project together', () => {
    const goal = 'Preview a Cloudflare deployment handoff.';
    const selectedPlan = capabilityPlan(goal);
    const valid = planFounderOsLab({
      goal,
      action: 'deploy-code',
      provider: 'cloudflare',
      capabilityPlan: selectedPlan,
      approval: approval('deploy-code', selectedPlan),
      evidence: {
        repository: REPOSITORY,
        commitSha: SHA,
        proofUrls: [
          GITHUB_PROOF,
          'https://dash.cloudflare.com/account-a/pages/view/shared-name',
        ],
        projectId: 'shared-name',
        providerAccountId: 'account-a',
      },
    });

    expect(valid.readiness).toBe('ready_for_external_executor');
    expect(valid.route.provider).toMatchObject({
      preflightEvidenceRequired: [
        'repository',
        'commitSha',
        'proofUrls',
        'projectId',
        'providerAccountId',
      ],
      preflightEvidenceObserved: [
        'repository',
        'commitSha',
        'proofUrls',
        'projectId',
        'providerAccountId',
      ],
      preflightEvidenceMissing: [],
    });
    expect(valid.authority.executionAllowed).toBe(false);

    const wrongAccount = planFounderOsLab({
      goal,
      action: 'deploy-code',
      provider: 'cloudflare',
      capabilityPlan: selectedPlan,
      approval: approval('deploy-code', selectedPlan),
      evidence: {
        repository: REPOSITORY,
        commitSha: SHA,
        proofUrls: [
          GITHUB_PROOF,
          'https://dash.cloudflare.com/attacker-account/pages/view/shared-name',
        ],
        projectId: 'shared-name',
        providerAccountId: 'account-a',
      },
    });

    expect(wrongAccount.readiness).toBe('blocked');
    expect(wrongAccount.truth.blocked.join(' ')).toContain(
      'account account-a and project shared-name',
    );
    expect(wrongAccount.authority.executionAllowed).toBe(false);
  });

  it('matches complete typed HubSpot IDs rather than prefixes in association plans', () => {
    const goal = 'Preview a governed HubSpot outreach association.';
    const selectedPlan = capabilityPlan(goal);
    const plan = planFounderOsLab({
      goal,
      action: 'send-email',
      provider: 'hubspot',
      capabilityPlan: selectedPlan,
      approval: approval('send-email', selectedPlan),
      evidence: {
        proofUrls: [
          'https://app.hubspot.com/contacts/123456/record/0-1/7',
          'https://app.hubspot.com/contacts/123456/record/0-2/456',
        ],
        workspaceId: '123456',
        recordIds: ['contact:7', 'company:456'],
        associationPlan: 'Associate contact:789 with company:456 before review.',
      },
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.truth.blocked.join(' ')).toContain(
      'associationPlan must name every submitted typed recordId exactly',
    );
    expect(plan.authority.executionAllowed).toBe(false);
  });

  it('rejects HubSpot API record proof that is not bound to the selected workspace', () => {
    const goal = 'Preview a governed HubSpot outreach association.';
    const selectedPlan = capabilityPlan(goal);
    const plan = planFounderOsLab({
      goal,
      action: 'send-email',
      provider: 'hubspot',
      capabilityPlan: selectedPlan,
      approval: approval('send-email', selectedPlan),
      evidence: {
        proofUrls: [
          'https://app.hubspot.com/contacts/workspace-a',
          'https://api.hubapi.com/crm/v3/objects/contacts/7',
        ],
        workspaceId: 'workspace-a',
        recordIds: ['contact:7'],
        associationPlan: 'Review contact:7 before any separately approved send.',
      },
    });

    expect(plan.readiness).toBe('blocked');
    expect(plan.truth.blocked.join(' ')).toContain(
      'hubspot proof does not identify record contact:7 on its workspace-bound object-type route',
    );
    expect(plan.authority.executionAllowed).toBe(false);
  });

  it('uses provider-neutral dispatch truth for a Zapier send-email preview', () => {
    const goal = 'Preview an approved outreach handoff without sending it.';
    const selectedPlan = capabilityPlan(goal);
    const plan = planFounderOsLab({
      goal,
      action: 'send-email',
      provider: 'zapier',
      capabilityPlan: selectedPlan,
      approval: approval('send-email', selectedPlan),
      evidence: {
        repository: REPOSITORY,
        commitSha: SHA,
        proofUrls: [
          GITHUB_PROOF,
          'https://zapier.com/app/editor/zap-outreach-review-v1',
        ],
        automationId: 'zap-outreach-review-v1',
      },
    });

    expect(plan.readiness).toBe('ready_for_review');
    expect(plan.truth.verified).toContain(
      'zapier identity evidence is reviewable, but it is not outbound dispatch authorization.',
    );
    expect(plan.truth.verified.join(' ')).not.toContain('HubSpot identity');
    expect(plan.authority.executionAllowed).toBe(false);
  });
});
