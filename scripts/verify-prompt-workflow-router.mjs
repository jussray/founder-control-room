import { readFileSync } from 'node:fs';

const routerDoc = readFileSync('.ai-skills/gpts/builder-prompt-workflow-router.md', 'utf8');
const router = readFileSync('src/lib/builderPromptWorkflowRouter.ts', 'utf8');
const authority = readFileSync('src/lib/founderControlDecision.ts', 'utf8');
const route = readFileSync('src/http/routes/builderPromptWorkflow.ts', 'utf8');

const requiredModes = [
  'goalfix', 'ultrathink', 'truthmode', 'confess', 'redteam', 'redteam2',
  'attack10', 'lindymode', 'ooda', 'proofmode', 'l99', 'investor-redteam',
  '10truth', 'money-path', 'launch', 'localfirst', 'leevize', 'law',
];

for (const mode of requiredModes) {
  if (!routerDoc.includes(`/${mode}`) && !(mode === 'truthmode' && routerDoc.includes('/truthmode'))) {
    throw new Error(`router doc missing /${mode}`);
  }
  if (!authority.includes(`'${mode}'`)) throw new Error(`authority registry missing ${mode}`);
}

for (const intent of [
  'focused-repair', 'complex-architecture', 'investment-business', 'launch-readiness',
  'legal-analysis', 'durable-architecture', 'adversarial-audit', 'video-story',
]) {
  if (!router.includes(`'${intent}'`)) throw new Error(`deterministic router missing ${intent}`);
}

if (!route.includes('requireFounder')) throw new Error('selection route must remain founder-gated');
if (!router.includes('executionAuthorized: false')) throw new Error('selection must not mint execution authority');
if (!router.includes('authorityChanged: false')) throw new Error('selection must not widen authority');

console.log('prompt-workflow-router source proof: PASS');
