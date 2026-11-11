import { describe, expect, it, vi } from 'vitest';
import {
  PerplexityContentGenerationError,
  generatePerplexityDraftMaterial,
  type GeneratePerplexityDraftInput,
} from '../perplexityContentGenerator.js';
import type { RepositoryEvidence } from '../socialCampaignPolicy.js';

const FIXTURE_KEY = 'pplx-test-fixture-key-not-real';
const VALID_HEAD = 'a'.repeat(40);
const APPROVED_PROOF_URL = 'https://github.com/jussray/example';

const BASE_ENV = {
  PERPLEXITY_API_KEY: FIXTURE_KEY,
  PERPLEXITY_CONTENT_GENERATION_ENABLED: 'true',
  FCR_PERPLEXITY_CONTENT_MODEL: 'sonar',
};

function evidence(overrides: Partial<RepositoryEvidence> = {}): RepositoryEvidence {
  return {
    fullName: 'jussray/example',
    visibility: 'public',
    archived: false,
    exactHead: VALID_HEAD,
    recentCommitCount: 5,
    recentMergedPullRequests: 2,
    policy: {
      containsMinorOrSensitiveData: false,
      publicProofUrls: [APPROVED_PROOF_URL],
      neverClaim: [],
      neverExpose: [],
    },
    ...overrides,
  };
}

function input(overrides: Partial<GeneratePerplexityDraftInput> = {}): GeneratePerplexityDraftInput {
  return {
    evidence: evidence(),
    platform: 'linkedin',
    accountId: 'acct_123',
    ...overrides,
  };
}

function agentResponse(fields: Record<string, unknown>): Response {
  return new Response(JSON.stringify({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(fields) }] }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const VALID_FIELDS = {
  text: 'We shipped verified progress this week, with a governance-first approach to every change.',
  traction: 'Shipped the content-autopilot generation gate.',
  governanceAdvantage: 'Every draft still passes the existing output firewall before a human sees it.',
  audienceValue: 'See how the system verifies its own public claims.',
  investorSignal: 'Consistent, reviewable shipping cadence.',
};

describe('generatePerplexityDraftMaterial', () => {
  it('refuses to call Perplexity for a repository that classification rejects', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(
      generatePerplexityDraftMaterial(
        input({ evidence: evidence({ archived: true }) }),
        { env: BASE_ENV, fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/not eligible for draft generation/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses without PERPLEXITY_API_KEY configured', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(
      generatePerplexityDraftMaterial(input(), {
        env: { ...BASE_ENV, PERPLEXITY_API_KEY: '' },
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow('PERPLEXITY_API_KEY is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses when generation is not explicitly enabled, even with a configured key', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(
      generatePerplexityDraftMaterial(input(), {
        env: { ...BASE_ENV, PERPLEXITY_CONTENT_GENERATION_ENABLED: 'false' },
        fetchImpl: fetchMock,
      }),
    ).rejects.toThrow(/content generation is disabled/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a repository with no approved public proof URL', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(
      generatePerplexityDraftMaterial(
        input({ evidence: evidence({ policy: { containsMinorOrSensitiveData: false, publicProofUrls: [], neverClaim: [], neverExpose: [] } }) }),
        { env: BASE_ENV, fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/no approved public proof URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the Perplexity agent endpoint without leaking the API key, and returns a safe draft input', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.perplexity.ai/v1/agent');
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${FIXTURE_KEY}`, 'Content-Type': 'application/json' });
      const serializedBody = String(init?.body ?? '');
      expect(serializedBody).not.toContain(FIXTURE_KEY);
      expect(JSON.parse(serializedBody)).toMatchObject({ model: 'sonar', store: false });
      return agentResponse(VALID_FIELDS);
    }) as typeof fetch;

    const result = await generatePerplexityDraftMaterial(input(), { env: BASE_ENV, fetchImpl: fetchMock });

    expect(result.classification.eligibleForDraftGeneration).toBe(true);
    expect(result.postInput.mode).toBe('draft');
    expect(result.postInput.publishAllowed).toBe(false);
    expect(result.postInput.founderApprovalId).toBeNull();
    expect(result.postInput.sourceRepository).toBe('jussray/example');
    expect(result.postInput.sourceCommitSha).toBe(VALID_HEAD);
    expect(result.postInput.proofLinks).toEqual([{ label: 'jussray/example proof', url: APPROVED_PROOF_URL }]);
    expect(result.postInput.text).toContain(APPROVED_PROOF_URL);
    expect(result.postInput.text).toContain(VALID_FIELDS.text);
  });

  it('does not duplicate the proof URL when the model already included it', async () => {
    const fetchMock = vi.fn(async () => agentResponse({
      ...VALID_FIELDS,
      text: `${VALID_FIELDS.text} ${APPROVED_PROOF_URL}`,
    })) as typeof fetch;

    const result = await generatePerplexityDraftMaterial(input(), { env: BASE_ENV, fetchImpl: fetchMock });
    expect(result.postInput.text.match(new RegExp(APPROVED_PROOF_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
  });

  it('rejects model output that is not a single JSON object', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Sure, here is your post: looks great!' }] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    await expect(
      generatePerplexityDraftMaterial(input(), { env: BASE_ENV, fetchImpl: fetchMock }),
    ).rejects.toThrow(/not a single JSON object/);
  });

  it('rejects model output carrying fields outside the fixed contract', async () => {
    const fetchMock = vi.fn(async () => agentResponse({
      ...VALID_FIELDS,
      mode: 'publish',
    })) as typeof fetch;

    await expect(
      generatePerplexityDraftMaterial(input(), { env: BASE_ENV, fetchImpl: fetchMock }),
    ).rejects.toThrow(/unexpected fields/);
  });

  it('rejects model output missing a required field', async () => {
    const { investorSignal: _investorSignal, ...incomplete } = VALID_FIELDS;
    const fetchMock = vi.fn(async () => agentResponse(incomplete)) as typeof fetch;

    await expect(
      generatePerplexityDraftMaterial(input(), { env: BASE_ENV, fetchImpl: fetchMock }),
    ).rejects.toThrow(/missing "investorSignal"/);
  });

  it('still enforces the existing neverClaim/neverExpose output firewall on generated text', async () => {
    const fetchMock = vi.fn(async () => agentResponse({
      ...VALID_FIELDS,
      text: `${VALID_FIELDS.text} We are SOC 2 certified. ${APPROVED_PROOF_URL}`,
    })) as typeof fetch;

    await expect(
      generatePerplexityDraftMaterial(
        input({
          evidence: evidence({
            policy: {
              containsMinorOrSensitiveData: false,
              publicProofUrls: [APPROVED_PROOF_URL],
              neverClaim: ['SOC 2 certified'],
              neverExpose: [],
            },
          }),
        }),
        { env: BASE_ENV, fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/neverClaim/);
  });

  it('propagates a non-completed Perplexity response as a clear rejection', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'in_progress', output: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    await expect(
      generatePerplexityDraftMaterial(input(), { env: BASE_ENV, fetchImpl: fetchMock }),
    ).rejects.toThrow(/was not completed/);
  });

  it('rejects an HTTP error from Perplexity without leaking the response body', async () => {
    const fetchMock = vi.fn(async () => new Response('secret-provider-detail', { status: 500 })) as typeof fetch;

    await expect(
      generatePerplexityDraftMaterial(input(), { env: BASE_ENV, fetchImpl: fetchMock }),
    ).rejects.toThrow('HTTP 500');
  });

  it('is a PerplexityContentGenerationError on rejection', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    await expect(
      generatePerplexityDraftMaterial(input(), { env: { ...BASE_ENV, PERPLEXITY_API_KEY: '' }, fetchImpl: fetchMock }),
    ).rejects.toBeInstanceOf(PerplexityContentGenerationError);
  });
});
