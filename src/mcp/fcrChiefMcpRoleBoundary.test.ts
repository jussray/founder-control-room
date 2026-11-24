import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const externalTools = fs.readFileSync(
  path.join(process.cwd(), 'src/mcp/externalTools.ts'),
  'utf8',
);

const fcrTruthTools = [
  'fcr_list_projects',
  'fcr_get_current_truth',
  'fcr_preview_skill_route',
] as const;

const chiefIntelligenceTools = [
  'chief_audit_repository',
  'chief_list_capabilities',
  'chief_preview_capability_plan',
] as const;

const forbiddenAuthorityName = /(?:execute|merge|deploy|publish|delete|write|mutate|approve|authorize|grant_?lease|issue_?lease)/i;

describe('FCR + Chief MCP role boundary', () => {
  it('keeps FCR truth/governance and Chief intelligence capabilities in the served catalog', () => {
    for (const toolName of [...fcrTruthTools, ...chiefIntelligenceTools]) {
      expect(externalTools).toContain(`'${toolName}'`);
    }
  });

  it('keeps the public paired MCP surface non-authorizing', () => {
    const declaredNames = [...externalTools.matchAll(/^\s*'([a-z0-9_]+)',?$/gm)].map(
      (match) => match[1],
    );

    expect(declaredNames.filter((name) => forbiddenAuthorityName.test(name))).toEqual([]);
    expect(externalTools).toContain('executionAllowed: false');
    expect(externalTools).toContain('founderApprovalGranted: false');
    expect(externalTools).toContain(
      "throw new Error('Requested project is outside this remote MCP grant')",
    );
  });

  it('does not promote repository truth into runtime or execution truth', () => {
    expect(externalTools).toContain('repositoryEvidenceOnly: true');
    expect(externalTools).toContain('liveRuntimeVerified: false');
    expect(externalTools).toContain('executionAuthority: false');
  });
});
