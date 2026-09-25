import { readFileSync } from 'node:fs';

const server = readFileSync('src/http/server.ts', 'utf8');
const required = [
  "import { builderPromptWorkflowRouter } from './routes/builderPromptWorkflow.js';",
  "app.use('/prompt-workflows', builderPromptWorkflowRouter);",
];
const missing = required.filter((line) => !server.includes(line));
if (missing.length) {
  console.error('BLOCKED: prompt workflow router is not mounted in the real server path.');
  for (const line of missing) console.error(`missing: ${line}`);
  process.exit(1);
}
console.log('prompt workflow runtime mount gate: PASS');
