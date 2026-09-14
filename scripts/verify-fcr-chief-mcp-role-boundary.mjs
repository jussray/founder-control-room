#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`[verify:mcp-role-boundary] ${message}`);
}

const externalTools = read('src/mcp/externalTools.ts');

const fcrTruthTools = [
  'fcr_list_projects',
  'fcr_get_current_truth',
  'fcr_preview_skill_route',
];

const chiefIntelligenceTools = [
  'chief_audit_repository',
  'chief_list_capabilities',
  'chief_preview_capability_plan',
];

for (const toolName of [...fcrTruthTools, ...chiefIntelligenceTools]) {
  assert(
    externalTools.includes(`'${toolName}'`),
    `served external MCP catalog must retain ${toolName}`,
  );
}

const forbiddenAuthorityName = /(?:execute|merge|deploy|publish|delete|write|mutate|approve|authorize|grant_?lease|issue_?lease)/i;
const declaredNames = [...externalTools.matchAll(/^\s*'([a-z0-9_]+)',?$/gm)].map((match) => match[1]);
const authorityShaped = declaredNames.filter((name) => forbiddenAuthorityName.test(name));

assert(
  authorityShaped.length === 0,
  `external MCP catalog must not expose authority-shaped tools: ${authorityShaped.join(', ')}`,
);

assert(
  externalTools.includes('executionAllowed: false'),
  'external MCP results must explicitly deny execution authority',
);
assert(
  externalTools.includes('founderApprovalGranted: false'),
  'external MCP results must explicitly deny founder-approval authority',
);
assert(
  externalTools.includes("throw new Error('Requested project is outside this remote MCP grant')"),
  'project scope must fail closed instead of widening silently',
);
assert(
  externalTools.includes("truthBoundary: {")
    && externalTools.includes('repositoryEvidenceOnly: true')
    && externalTools.includes('liveRuntimeVerified: false')
    && externalTools.includes('executionAuthority: false'),
  'FCR current-truth result must keep repository evidence separate from runtime and execution authority',
);

console.log('[verify:mcp-role-boundary] PASS');
console.log('  FCR MCP: scoped truth/governance observations and previews only.');
console.log('  Chief through FCR MCP: reasoning/audit/capability previews only.');
console.log('  MCP transport does not mint founder approval, execution authority, or runtime truth.');
