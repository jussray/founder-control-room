# Prompt Workflow Router Runtime Wiring

The deterministic workflow selector is implemented in `src/lib/builderPromptWorkflowRouter.ts` and the founder-gated HTTP adapter is implemented in `src/http/routes/builderPromptWorkflow.ts`.

## Required runtime mount

`src/http/server.ts` must import:

```ts
import { builderPromptWorkflowRouter } from './routes/builderPromptWorkflow.js';
```

and mount after the browser mutation/JSON/security gates with the other founder routes:

```ts
app.use('/prompt-workflows', builderPromptWorkflowRouter);
```

Do not mount this before `requireSameOriginBrowserMutation`. Do not remove `requireFounder` from the router. Selection returns `executionAuthorized: false` and `authorityChanged: false`; it is a reasoning/evidence selection surface, not an execution endpoint.

## Real-path proof gate

After runtime mount and deployment, Playwright must prove:

1. unauthenticated selection is rejected;
2. an authenticated founder can select `investment-business` and receives exactly `investor-redteam + money-path + 10truth`;
3. unsupported intent fails closed;
4. the response never grants execution authority;
5. `/version` identifies the exact deployed SHA under test.

Until that proof exists, source implementation is not equivalent to live runtime verification.
