import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');

const readme = read('README.md');
const publicTruth = read('docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md');
const futureYouMe = read('docs/founder-signal-engine/futureyou-me-shared-output-contract.md');
const truthDecay = read('docs/TRUTH_DECAY_AUDIT.md');
const mergeAuthority = read('docs/FOUNDER_MERGE_AUTHORITY.md');
const launchLoop = read('.ai/skills/juss-flow-launch-loop/SKILL.md');
const globalAi = read('GLOBAL_AI.md');
const chatgpt = read('CHATGPT.md');
const claude = read('CLAUDE.md');
const perplexity = read('PERPLEXITY.md');
const verifier = read('scripts/verify-documentation-truth.mjs');
const workflow = read('.github/workflows/documentation-truth.yml');
const ci = read('.github/workflows/ci.yml');

describe('documentation truth contract', () => {
  it('makes post-merge documentation truth an executable and load-bearing gate', () => {
    expect(readme).toContain('Documentation truth gate');
    expect(mergeAuthority).toContain('Documentation truth');
    expect(launchLoop).toContain('Documentation truth gate');
    expect(globalAi).toContain('Documentation truth');
    expect(verifier).toContain("contract: 'fcr/documentation-truth@v1'");
    expect(workflow).toContain('Documentation truth gate');
    expect(workflow).toContain('scripts/verify-documentation-truth.mjs');
    expect(workflow).toContain('artifacts/documentation-truth-report.json');
    expect(ci).toContain('documentation-truth:');
    expect(ci).toContain('name: Documentation truth');
    expect(ci).toMatch(/needs:[\s\S]*- documentation-truth/);
    expect(ci).toContain('DOCUMENTATION_TRUTH_RESULT: ${{ needs.documentation-truth.result }}');
  });

  it('does not let old standing-automation prose override exact Current You publication authority', () => {
    expect(publicTruth).toContain('Current executable publication authority');
    expect(publicTruth).toContain('exact Current You approval');
    expect(publicTruth).not.toContain('This standing authorization removes the need for per-post founder approval');
  });

  it('keeps the current social execution mesh separate from historical Zapier budgeting', () => {
    expect(readme).toContain('first-party LinkedIn');
    expect(readme).toContain('provider-neutral n8n');
    expect(futureYouMe).toContain('CURRENT EXECUTION UPDATE');
    expect(futureYouMe).toContain('first-party LinkedIn');
    expect(futureYouMe).toContain('provider-neutral n8n');
    expect(futureYouMe).toContain('HISTORICAL ZAPIER BUDGET');
  });

  it('keeps ChatGPT, Claude, and Perplexity on the same truth-aging constitution', () => {
    for (const contract of [chatgpt, claude, perplexity]) {
      expect(contract).toContain('GLOBAL_AI.md');
      expect(contract).toContain('TRUTH_DECAY_AUDIT.md');
      expect(contract).toContain('Documentation truth');
      expect(contract).toContain('Truth Lease');
    }

    expect(chatgpt).toContain('provider-neutral n8n');
    expect(claude).toContain('provider-neutral n8n');
    expect(perplexity).toContain('provider-neutral n8n');
    expect(claude).not.toContain('Current provider truth:\n\n```text\nClaude with connected Zapier MCP');
  });

  it('documents the single capability authority after the current-main transition', () => {
    expect(readme).toContain('`.control/capability.json`');
    expect(readme).toContain('canonical capability authority');
    expect(readme).toContain('`.control/capability.yaml`');
    expect(readme).toContain('compatibility pointer');
  });

  it('keeps truth decay, FutureYou, and the founder workflow connected', () => {
    expect(truthDecay).toContain('Documentation truth gate');
    expect(truthDecay).toContain('Truth Lease');
    expect(launchLoop).toContain('Truth Lease');
    expect(launchLoop).toContain('Parallel lenses, serialized authority');
    expect(launchLoop).toContain('Hormozi pass');
  });

  it('never treats documentation analytics as authority', () => {
    expect(verifier).toContain('documentationCoveragePercent');
    expect(truthDecay).toContain('Analytics remains observation-only');
    expect(globalAi.toLowerCase()).toContain('analytics may observe');
  });
});
