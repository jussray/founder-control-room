import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { planFounderOsLab } from '../src/founder-os-lab/engine.js';
// The isolated JavaScript lab intentionally owns no generated TypeScript surface.
// @ts-expect-error Runtime parity is verified directly through Vitest.
import { runCompanySimulation } from '../labs/ai-company/src/company.mjs';

const require = createRequire(import.meta.url);
const {
  validateBufferPublishInput,
} = require('../tools/zapier/buffer-content-firewall.cjs') as {
  validateBufferPublishInput(input: Record<string, unknown>): Record<string, unknown>;
};

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROOF_URL = 'https://proof.example.test/cross-lab-parity';

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
    if (!['.ts', '.js', '.mjs', '.cjs'].includes(extname(entry.name))) continue;
    sources.push(path);
  }

  return sources;
}

describe('Founder OS and AI Company cross-lab parity', () => {
  it('keeps approved work at L0 simulation without turning approval into execution', () => {
    const founderPlan = planFounderOsLab({
      goal: 'Prepare one approved founder post for an external executor.',
      action: 'queue-social',
      approval: {
        id: 'founder-approved:synthetic-parity',
        actions: ['queue-social'],
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
      socialPost: socialPost('queue'),
    });
    const company = runCompanySimulation(companyInput());

    expect(founderPlan.readiness).toBe('ready_for_external_executor');
    expect(founderPlan.authority).toEqual({
      level: 'L0',
      mode: 'simulation',
      executionAllowed: false,
      approvalRequired: true,
      approvalObserved: true,
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

  it('keeps Buffer provider output draft-only even when callers request unsafe overrides', () => {
    const output = validateBufferPublishInput({
      post_text: socialPost('draft').text,
      content_field: 'linkedin_draft',
      channel: 'synthetic-founder-linkedin',
      destination_mode: 'draft',
      publish_allowed: false,
      proof_url: PROOF_URL,
      source_commit_sha: SHA,
      buffer_method: 'share_now',
      buffer_save_to_draft: false,
    });

    expect(output).toMatchObject({
      destination_mode: 'draft',
      publish_allowed: false,
      buffer_action: 'buffer_add_to_queue',
      buffer_method: 'draft',
      buffer_save_to_draft: true,
    });

    for (const destinationMode of ['queue', 'publish']) {
      expect(() => validateBufferPublishInput({
        post_text: socialPost('draft').text,
        content_field: 'linkedin_draft',
        channel: 'synthetic-founder-linkedin',
        destination_mode: destinationMode,
        publish_allowed: true,
        founder_approval_id: 'founder-approved:unsafe-override',
        proof_url: PROOF_URL,
        source_commit_sha: SHA,
      })).toThrow(/destination_mode must be draft/);
    }
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
        for (const rule of forbiddenPatterns) {
          if (rule.pattern.test(source)) {
            failures.push(`${relative(ROOT, file)}: ${rule.label}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
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
