# Prompt Workflow Router Rollback

This patch is additive and can be reversed without data migration.

Rollback order:

1. Unmount `/prompt-workflows` from `src/http/server.ts` if it has been mounted.
2. Remove `src/http/routes/builderPromptWorkflow.ts` and its route tests.
3. Remove `src/lib/builderPromptWorkflowRouter.ts` and its tests.
4. Revert the added system-owned mode IDs in `src/lib/founderControlDecision.ts` together with the matching test expectation.
5. Remove the builder workflow contract/docs/workflows.

No Supabase schema, persisted prompt template, billing configuration, publication authority, or provider credential is changed by this patch.
