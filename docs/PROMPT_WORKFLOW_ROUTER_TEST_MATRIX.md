# Test Matrix

| Claim | Proof |
|---|---|
| intent maps deterministically | `builderPromptWorkflowRouter.test.ts` |
| selection cannot mint authority | selector assertions + founder control tests |
| mode names cannot be executable actions | `founderControlDecision.test.ts` |
| unauthenticated HTTP selection rejected | `builderPromptWorkflow.integration.test.ts` |
| unsupported intent fails closed | unit + integration tests |
| real server path mounts route | `builderPromptWorkflow.server-mount.test.ts` + stop gate |
| deployed exact SHA responds correctly | `builderPromptWorkflow.playwright.spec.ts` + `/version` |

A claim is not promoted beyond the highest proof actually executed for the exact subject SHA.
