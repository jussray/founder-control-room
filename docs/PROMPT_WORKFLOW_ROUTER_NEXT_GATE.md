# NEXT GATE

One focused code integration remains before this branch can truthfully claim runtime wiring:

```diff
 import { promptosRouter } from './routes/promptos.js';
+import { builderPromptWorkflowRouter } from './routes/builderPromptWorkflow.js';
 ...
 app.use('/promptos', promptosRouter);
+app.use('/prompt-workflows', builderPromptWorkflowRouter);
```

Target: `src/http/server.ts` only.

Then require:

- `node scripts/prompt-workflow-router-gate.mjs` PASS
- focused Vitest PASS
- exact-head CI PASS
- deployed `/version` exact SHA
- Playwright runtime proof PASS

No additional product scope is needed for this gate.
