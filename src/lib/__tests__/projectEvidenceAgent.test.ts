import { describe, expect, it, vi } from 'vitest';
import type { RepositoryProvider } from '../../providers/RepositoryProvider.js';
import {
  createProjectEvidenceAgent,
  getProjectEvidence,
} from '../projectEvidenceAgent.js';

const SHA = 'a'.repeat(40);

function fakeProvider(): RepositoryProvider {
  return {
    name: 'github',
    resolveRef: vi.fn().mockResolvedValue(SHA),
    getRef: vi.fn().mockResolvedValue({ name: 'main', commitSha: SHA, committedAt: '2026-09-22T00:00:00Z' }),
    listVerificationSignals: vi.fn().mockResolvedValue([
      {
        id: '1',
        name: 'CI',
        status: 'passed',
        commitSha: SHA,
        provider: 'github',
      },
      {
        id: '2',
        name: 'Playwright E2E',
        status: 'failed',
        commitSha: SHA,
        provider: 'github',
      },
    ]),
  } as unknown as RepositoryProvider;
}

describe('project evidence tool', () => {
  it('returns exact-subject read-only evidence without inventing runtime proof', async () => {
    const receipt = await getProjectEvidence(
      {
        repository: 'jussray/founder-control-room',
        ref: 'main',
        evidence_types: ['repository', 'ci', 'playwright', 'runtime'],
      },
      { providerFactory: () => fakeProvider() },
    );

    expect(receipt).toMatchObject({
      contract: 'juss/project-evidence-receipt@v1',
      exactSha: SHA,
      readOnly: true,
      authorityChanged: false,
      executionAuthorized: false,
    });
    expect(receipt.evidence.find((item) => item.type === 'playwright')).toMatchObject({
      status: 'verified',
      data: [expect.objectContaining({ name: 'Playwright E2E', status: 'failed', commitSha: SHA })],
    });
    expect(receipt.evidence.find((item) => item.type === 'runtime')).toMatchObject({
      status: 'unknown',
    });
  });
});

describe('OpenAI project evidence agent', () => {
  it('executes only the read-only evidence function and replays its output before the final answer', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (bodies.length === 1) {
        return new Response(JSON.stringify({
          id: 'resp_tool',
          output: [
            {
              type: 'function_call',
              call_id: 'call_1',
              name: 'get_project_evidence',
              arguments: JSON.stringify({
                repository: 'jussray/founder-control-room',
                ref: 'main',
                evidence_types: ['repository', 'ci', 'runtime'],
              }),
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        id: 'resp_final',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'REALITY: exact evidence loaded\nFIX: none\nPROOF: receipt\nRISK: runtime unknown\nROLLBACK: none\nNEXT GATE: runtime adapter' }],
          },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const run = createProjectEvidenceAgent({
      env: { OPENAI_API_KEY: 'test-key', FCR_EVIDENCE_AGENT_MODEL: 'gpt-5.6-sol' },
      fetchFn: fetchFn as unknown as typeof fetch,
      providerFactory: () => fakeProvider(),
    });

    const result = await run({
      goal: 'Find the launch blocker',
      repository: 'jussray/founder-control-room',
      ref: 'main',
      environment: 'canonical production',
    });

    expect(result).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.6-sol',
      responseId: 'resp_final',
      storedByProvider: false,
      toolRounds: 1,
    });
    expect(result.text).toContain('runtime unknown');

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      model: 'gpt-5.6-sol',
      store: false,
      parallel_tool_calls: false,
      include: ['reasoning.encrypted_content'],
      tools: [expect.objectContaining({ type: 'function', name: 'get_project_evidence', strict: true })],
    });

    const secondInput = bodies[1]?.input as Array<Record<string, unknown>>;
    expect(secondInput.some((item) => item.type === 'function_call_output' && item.call_id === 'call_1')).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
