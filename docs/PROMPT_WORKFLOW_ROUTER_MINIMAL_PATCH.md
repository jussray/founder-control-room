# Smallest Remaining Patch

File: `src/http/server.ts`

Add exactly:

```ts
import { builderPromptWorkflowRouter } from './routes/builderPromptWorkflow.js';
```

beside the existing PromptOS route import, and:

```ts
app.use('/prompt-workflows', builderPromptWorkflowRouter);
```

beside the existing PromptOS mount, after the shared browser mutation and JSON gates.

No other runtime file is required for reachability.
