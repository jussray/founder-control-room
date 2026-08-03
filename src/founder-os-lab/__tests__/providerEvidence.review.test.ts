import { describe, expect, it } from 'vitest';
import { planFounderOsLab } from '../engine.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REPOSITORY = 'jussray/founder-control-room';
const GITHUB_PROOF = `https://github.com/${REPOSITORY}/commit/${SHA}`;

function approval(action: 'merge-code' | 'deploy-code' | 'send-email') {
  return {
    id: `founder-approved:${action}:review-contract`,
    actions: [action],
  };
}

describe('Founder OS provider evidence exact-head review contracts', () => {
  it('rejects repeated separators in an otherwise matching GitHub commit URL', () => {
    const plan = planFounderOsLab({
      goal: 'Preview the exact-head merge gate.',
      action: 'merge-code',
      provider: 'github',
      approval: approval('merge-code'),
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
    const valid = planFounderOsLab({
      goal: 'Preview a Cloudflare deployment handoff.',
      action: 'deploy-code',
      provider: 'cloudflare',
      approval: approval('deploy-code'),
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
      goal: 'Preview a Cloudflare deployment handoff.',
      action: 'deploy-code',
      provider: 'cloudflare',
      approval: approval('deploy-code'),
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
    const plan = planFounderOsLab({
      goal: 'Preview a governed HubSpot outreach association.',
      action: 'send-email',
      provider: 'hubspot',
      approval: approval('send-email'),
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
    const plan = planFounderOsLab({
      goal: 'Preview a governed HubSpot outreach association.',
      action: 'send-email',
      provider: 'hubspot',
      approval: approval('send-email'),
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
    const plan = planFounderOsLab({
      goal: 'Preview an approved outreach handoff without sending it.',
      action: 'send-email',
      provider: 'zapier',
      approval: approval('send-email'),
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
