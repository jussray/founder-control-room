import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { planFounderOsLab } from '../src/founder-os-lab/engine.js';
import {
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../src/founder-os-lab/capabilityKernel.js';
// The isolated JavaScript lab intentionally owns no generated TypeScript surface.
// @ts-expect-error Runtime parity is verified directly through Vitest.
import { runCompanySimulation } from '../labs/ai-company/src/company.mjs';

const require = createRequire(import.meta.url);
const { validateBufferPublishInput } = require('../tools/zapier/buffer-content-firewall.cjs') as {
  validateBufferPublishInput(
    input: Record<string, unknown>,
    options?: { nowMs?: number },
  ): Record<string, unknown>;
};

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF_URL = `https://github.com/jussray/founder-control-room/commit/${SHA}`;
const ZAPIER_AUTOMATION_ID = 'zap-founder-signal-review-v1';
const ZAPIER_PROOF_URL = `https://zapier.com/app/editor/${ZAPIER_AUTOMATION_ID}`;
const GENERATED_AT = '2026-08-02T21:00:00.000Z';
const INVOCATION_ID = '3f10e0f9-b0b4-4e64-b9ff-c5f10f848067';
const GRANT_ID = 'founder-approved-auto-distribution-v1';
const REVIEW_BATCH_ID = '66cf315f-e1a0-4aad-9c76-355f1df30b54';
const REGISTRY_HASH = 'b'.repeat(64);
const CAPABILITY_SOURCE_HASH = 'c'.repeat(64);

function chiefCapabilityPlan(goal: string): V10CapabilityPlan {
  const plan: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: 'juss-v10/capability-plan@v1',
    selectedBy: 'chief-ai-machine',
    goal,
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'draft',
    strategicLenses: ['governance', 'distribution'],
    routingReason: 'Synthetic parity uses one reviewable social capability without granting live execution authority.',
    capabilities: [
      {
        id: 'synthetic-social-drafting',
        version: '1.0.0',
        origin: 'repo-native',
        owner: 'chief-ai-machine',
        sourceHash: CAPABILITY_SOURCE_HASH,
        authorityCeiling: 'draft',
      },
    ],
    proofRequirements: ['exact source commit', 'clickable proof'],
    outcomeSignals: ['reviewable governed output'],
    rollback: 'Discard the synthetic plan; no live side effect occurs.',
  };
  return { ...plan, planHash: v10CapabilityPlanHash(plan) };
}

function zapierEvidence() {
  return Object.assign(
    {
      repository: 'jussray/founder-control-room',
      commitSha: SHA,
      proofUrls: [PROOF_URL, ZAPIER_PROOF_URL],
    },
    { automationId: ZAPIER_AUTOMATION_ID },
  );
}

function socialPost(
  mode: 'draft' | 'queue' | 'publish',
  { includeProof = true }: { includeProof?: boolean } = {},
) {
  return {
    platform: 'linkedin' as const,
    accountId: 'synthetic-founder-linkedin',
    contentField: 'linkedin_draft',
    text: `We converted a founder request into a governed simulation with exact evidence, explicit authority, and no provider side effects. The result remains reviewable and reversible. Proof: ${PROOF_URL}`,
    traction: 'Two isolated company engines now share one authority invariant.',
    governanceAdvantage: 'Approval, execution, provider transport, and destination receipts remain separate states.',
    audienceValue: 'Builders can inspect deterministic evidence rather than trust an autonomy claim.',
    investorSignal: 'The organization model is becoming testable infrastructure instead of prompt folklore.',
    proofLinks: includeProof ? [{ label: 'Synthetic parity proof', url: PROOF_URL }] : [],
    sourceRepository: 'jussray/founder-control-room',
    sourceCommitSha: SHA,
    mode,
    publishAllowed: mode !== 'draft',
    founderApprovalId: mode === 'draft' ? null : 'founder-approved:synthetic-parity',
  };
}

function companyInput(overrides: Record<string, unknown> = {}) {
  return {
    dataClassification: 'synthetic',
    projectSlug: 'synthetic-founder-project',
    eventId: 'synthetic-cross-lab-parity',
    summary: 'A synthetic founder company simulation reached a proof-gated decision.',
    requestedMode: 'publish',
    audiences: ['founders', 'investors'],
    platforms: ['linkedin'],
    proof: {
      projectSlug: 'synthetic-founder-project',
      status: 'ready',
      urls: [PROOF_URL],
    },
    traction: [
      {
        label: 'Synthetic governed demand',
        value: '2 simulated workflows',
        sourceUrl: PROOF_URL,
      },
    ],
    governanceAdvantages: [
      {
        label: 'Execution remains disabled inside both labs',
        proofUrl: PROOF_URL,
      },
    ],
    founderApprovalId: 'founder-approved:synthetic-parity',
    ...overrides,
  };
}

function collectRuntimeSources(directory: string): string[] {
  const sources: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...collectRuntimeSources(path));
      continue;
    }
    if (['.ts', '.js', '.mjs', '.cjs'].includes(extname(entry.name))) sources.push(path);
  }
  return sources;
}

describe('Founder OS and AI Company cross-lab parity', () => {
  it('keeps approved work at L0 simulation without turning approval into execution', () => {
    const goal = 'Prepare one approved founder post for an external executor.';
    const capabilityPlan = chiefCapabilityPlan(goal);
    const founderPlan = planFounderOsLab({
      goal,
      action: 'queue-social',
      capabilityPlan,
      approval: {
        id: 'founder-approved:synthetic-parity',
        actions: ['queue-social'],
        projectSlug: capabilityPlan.projectSlug,
        expectedHeadSha: capabilityPlan.expectedHeadSha,
        capabilityPlanHash: capabilityPlan.planHash,
      },
      evidence: zapierEvidence(),
      socialPost: socialPost('queue'),
    });
    const company = runCompanySimulation(companyInput());

    expect(founderPlan.readiness).toBe('blocked');
    expect(founderPlan.truth.blocked.join(' ')).toContain('Founder-approved capability registry snapshot');
    expect(founderPlan.authority).toEqual({
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired: true,
      approvalObserved: true,
      capabilityPlanBound: true,
    });
    expect(founderPlan.isolation).toEqual({
      externalCalls: false,
      providerCalls: false,
      databaseWrites: false,
      filesystemWrites: false,
      environmentReads: false,
    });
    expect(company.authority).toEqual({
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired: true,
      approvalObserved: true,
    });
    expect(company.decision.publishAllowed).toBe(true);
    expect(company.liveSideEffects).toBe(false);
    expect(company.receipts).toHaveLength(1);
    expect(company.receipts[0]).toMatchObject({
      provider: 'fake-buffer',
      status: 'simulated_publish',
      simulation: true,
      executionAllowed: false,
      liveSideEffects: false,
      publicUrl: null,
    });
  });

  it('blocks both publishing paths when clickable proof is absent', () => {
    const founderPlan = planFounderOsLab({
      goal: 'Prepare a founder draft without proof.',
      action: 'draft-social',
      socialPost: socialPost('draft', { includeProof: false }),
    });
    const input = companyInput();
    input.proof = {
      projectSlug: 'synthetic-founder-project',
      status: 'ready',
      urls: [],
    };
    const company = runCompanySimulation(input);

    expect(founderPlan.readiness).toBe('blocked');
    expect(founderPlan.authority.executionAllowed).toBe(false);
    expect(founderPlan.truth.blocked.join(' ')).toContain('clickable proof link');
    expect(company.decision.status).toBe('blocked');
    expect(company.decision.blockers).toContain('missing clickable proof');
    expect(company.authority.executionAllowed).toBe(false);
    expect(company.campaign).toBeNull();
    expect(company.receipts).toEqual([]);
  });

  it('keeps sandbox execution disabled while the external Buffer firewall is draft-only', () => {
    const nowMs = Date.parse('2026-08-02T21:01:00.000Z');
    const validDraft = {
      post_text: socialPost('publish').text,
      content_field: 'linkedin_draft',
      channel: 'synthetic-founder-linkedin',
      destination_mode: 'draft',
      publish_allowed: false,
      proof_url: PROOF_URL,
      source_commit_sha: SHA,
      generated_at: GENERATED_AT,
      batch_id: REVIEW_BATCH_ID,
      batch_size: 1,
      batch_index: 1,
      invocation_id: INVOCATION_ID,
      steering_grant_id: GRANT_ID,
      founder_approval_id: `standing-policy:${GRANT_ID}:${INVOCATION_ID}`,
      authorization_mode: 'standing-policy',
      schedule_policy_id: 'buffer-draft-review-v1',
      notification_mode: 'gmail_campaign_digest',
      buffer_method: 'share_now',
      scheduled_at: '2026-08-02T21:01:01.000Z',
    };

    const output = validateBufferPublishInput(validDraft, { nowMs });
    expect(output).toMatchObject({
      destination_mode: 'draft',
      publish_allowed: false,
      authorization_receipt_verified: true,
      buffer_action: 'buffer_add_to_queue',
      buffer_method: 'draft',
      buffer_save_to_draft: true,
      scheduled_at: null,
      review_deadline: null,
      share_now_allowed: false,
    });

    expect(() => validateBufferPublishInput({
      ...validDraft,
      founder_approval_id: 'standing-policy:copied:or-forged',
    }, { nowMs })).toThrow(/runtime-minted receipt/);

    for (const destinationMode of ['queue', 'schedule', 'publish', 'share_now', 'share_next', 'schedule_draft']) {
      expect(() => validateBufferPublishInput({
        ...validDraft,
        destination_mode: destinationMode,
      }, { nowMs })).toThrow(/destination_mode must be draft/);
    }

    expect(() => validateBufferPublishInput({
      ...validDraft,
      publish_allowed: true,
    }, { nowMs })).toThrow(/publish_allowed must be explicitly false/);

    const founderPlan = planFounderOsLab({
      goal: 'Simulate a founder draft without giving the lab provider access.',
      action: 'queue-social',
      approval: { id: 'founder-approved:synthetic-parity', actions: ['queue-social'] },
      evidence: zapierEvidence(),
      socialPost: socialPost('queue'),
    });
    expect(founderPlan.authority.executionAllowed).toBe(false);
    expect(runCompanySimulation(companyInput()).liveSideEffects).toBe(false);
  });

  it('rejects provider, network, database, route, secret, and process capabilities in both runtime trees', () => {
    const runtimeRoots = [
      join(ROOT, 'src', 'founder-os-lab'),
      join(ROOT, 'labs', 'ai-company', 'src'),
    ];
    const forbiddenPatterns = [
      { pattern: /process\.env|Deno\.env|Bun\.env/, label: 'environment or secret access' },
      { pattern: /\bfetch\s*\(|globalThis\.fetch/, label: 'network fetch' },
      { pattern: /from\s+['"](?:node:)?(?:fs|http|https|net|tls|child_process)['"]/, label: 'side-effecting Node import' },
      { pattern: /from\s+['"][^'"]*supabase/i, label: 'Supabase import' },
      { pattern: /from\s+['"][^'"]*providerFactory/i, label: 'provider factory import' },
      { pattern: /from\s+['"]@octokit\//, label: 'GitHub client import' },
      { pattern: /from\s+['"]express['"]|\bRouter\s*\(/, label: 'HTTP route capability' },
      { pattern: /\.(?:insert|update|delete)\s*\(/, label: 'database mutation' },
      { pattern: /executeFirstPartyPublication/, label: 'live social adapter execution' },
    ];
    const failures: string[] = [];

    for (const root of runtimeRoots) {
      for (const file of collectRuntimeSources(root)) {
        const source = readFileSync(file, 'utf8');
        const sourceWithoutHashUpdates = source.replace(/createHash\([^)]*\)\.update\b/g, 'hashUpdate');
        for (const rule of forbiddenPatterns) {
          const candidate = rule.label === 'database mutation' ? sourceWithoutHashUpdates : source;
          if (rule.pattern.test(candidate)) failures.push(`${relative(ROOT, file)}: ${rule.label}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('ignores stale approval references on review-only drafts in both labs', () => {
    const founderPlan = planFounderOsLab({
      goal: 'Prepare a review-only founder draft.',
      action: 'draft-social',
      approval: {
        id: 'founder-approved:unrelated-queue-action',
        actions: ['queue-social'],
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
      socialPost: socialPost('draft'),
    });
    const company = runCompanySimulation(companyInput({
      requestedMode: 'draft',
      founderApprovalId: 'founder-approved:stale-draft-token',
    }));

    expect(founderPlan.authority).toMatchObject({
      executionAllowed: false,
      approvalRequired: false,
      approvalObserved: false,
    });
    expect(company.authority).toEqual({
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired: false,
      approvalObserved: false,
    });
    expect(company.decision.status).toBe('draft_ready');
    expect(company.decision.publishAllowed).toBe(false);
    expect(company.receipts.every((receipt: { status: string }) => receipt.status === 'simulated_draft')).toBe(true);
  });

  it('produces deterministic plans and receipts for identical synthetic input', () => {
    const founderRequest = {
      goal: 'Prepare a deterministic founder draft.',
      action: 'draft-social' as const,
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
      socialPost: socialPost('draft'),
    };
    const input = companyInput({ requestedMode: 'draft', founderApprovalId: '' });

    expect(planFounderOsLab(founderRequest)).toEqual(planFounderOsLab(founderRequest));
    expect(runCompanySimulation(input)).toEqual(runCompanySimulation(input));
  });
});
