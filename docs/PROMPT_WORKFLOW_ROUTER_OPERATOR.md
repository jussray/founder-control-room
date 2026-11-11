# Operator Handoff

Apply `scripts/patch-prompt-workflow-server.mjs` in a checkout of `feat/prompt-workflow-router`, review that only the expected import/mount changed in `src/http/server.ts`, then commit that focused diff.

Run:

```sh
node scripts/prompt-workflow-router-gate.mjs
npx vitest run src/lib/__tests__/founderControlDecision.test.ts src/lib/__tests__/builderPromptWorkflowRouter.test.ts src/http/routes/__tests__/builderPromptWorkflow.integration.test.ts src/http/routes/__tests__/builderPromptWorkflow.server-mount.test.ts
```

Then open/review the focused PR and use exact-head CI. Runtime Playwright remains a post-deploy proof gate.
