import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/http/server.ts';
let source = readFileSync(path, 'utf8');
const importAnchor = "import { promptosRouter } from './routes/promptos.js';";
const importLine = "import { builderPromptWorkflowRouter } from './routes/builderPromptWorkflow.js';";
const mountAnchor = "  app.use('/promptos', promptosRouter);";
const mountLine = "  app.use('/prompt-workflows', builderPromptWorkflowRouter);";

if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error('promptos import anchor missing');
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}
if (!source.includes(mountLine)) {
  if (!source.includes(mountAnchor)) throw new Error('promptos mount anchor missing');
  source = source.replace(mountAnchor, `${mountAnchor}\n${mountLine}`);
}
writeFileSync(path, source);
console.log('prompt workflow server mount patch applied');
