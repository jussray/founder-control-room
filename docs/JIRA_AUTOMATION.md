# Jira work automation

## Status

This repository owns the FCR-side contract and an importable n8n provider artifact for two bounded Jira work-management automations.

- FCR contract: `src/lib/jiraWorkAutomation.ts`
- n8n artifact: `automation/n8n/jira-work-automation.workflow.json`
- contract tests: `src/lib/__tests__/jiraWorkAutomation.test.ts`
- workflow-artifact tests: `src/lib/__tests__/jiraN8nWorkflowArtifact.test.ts`

The provider execution path is n8n. Jira/Atlassian credentials remain outside FCR source. The checked-in workflow ships **inactive**, has no embedded credential IDs or secret values, and does not prove that Jira or n8n is currently connected.

Until a provider workflow is imported, credential-bound, activated, and live-read back, describe this lane as **implemented / provider activation unverified**, not as a live Jira automation.

## Flow 1: In Progress ownership gate

When an observed Jira work item is in `In Progress` with no assignee, FCR may request exactly one ownership mutation through the configured n8n bridge:

- assign the issue to the exact Jira account ID configured for logical owner `sekretbip`.

FCR does not guess the Jira account ID from the label `sekretbip`. The exact mapping is required at runtime. The n8n workflow re-reads the issue immediately before mutation and refuses the plan if status, assignee, or Jira's `updated` timestamp changed after FCR observed it.

## Flow 2: stale-work guard

On a scheduled scan, when an already-assigned `In Progress` work item has not been updated for at least the configured number of hours, FCR may request exactly one stale-work mutation:

- add the deterministic stale-work status comment.

The stale threshold is configuration, not hidden source policy. If no positive threshold is configured, the stale-comment action does not open. n8n recomputes the age from the freshly re-read Jira `updated` timestamp and refuses the comment if the threshold is no longer satisfied.

**One observation may authorize at most one mutation.** If a stale scheduled item is unassigned, ownership repair takes precedence. Because assignment changes Jira's `updated` timestamp, stale-comment eligibility must be established by a later fresh scan rather than inherited from the pre-assignment snapshot.

## Authority ceiling

The v1 contract and n8n artifact may only perform:

- issue assignment;
- issue comment.

They explicitly do **not** authorize issue transition, issue close, issue deletion, Jira project-setting mutation, deployment, publication, or repository mutation.

Every dispatched plan is bound to:

- the exact FCR runtime `GIT_SHA`;
- canonical Jira project and issue identity;
- the observed issue status and assignee state;
- observed/update timestamps;
- deterministic action content;
- a plan idempotency key;
- an exact expected n8n receipt ID.

The n8n workflow independently reconstructs the receipt material from the validated plan, computes the SHA-256 receipt ID, re-reads Jira, performs exactly one bounded mutation, and returns the receipt only after that mutation completes. FCR independently computes the same expected receipt and rejects any other acknowledgement.

The receipt is a deterministic continuity/proof binding. It is not a claim that n8n or Jira is cryptographically trusted beyond the authenticated provider boundary.

## FCR runtime configuration

Set these only in the FCR runtime secret/configuration store. Do not commit secret values.

```text
N8N_JIRA_AUTOMATION_ENABLED=false
N8N_JIRA_AUTOMATION_WEBHOOK_URL=
N8N_JIRA_AUTOMATION_BEARER_TOKEN=
JIRA_AUTOMATION_OWNER_ACCOUNT_ID=
JIRA_AUTOMATION_STALE_AFTER_HOURS=
GIT_SHA=<exact deployed FCR commit SHA>
```

`N8N_JIRA_AUTOMATION_WEBHOOK_URL` must be HTTPS. `JIRA_AUTOMATION_OWNER_ACCOUNT_ID` must be the exact Jira account identifier for the intended owner. `JIRA_AUTOMATION_STALE_AFTER_HOURS` must be a positive integer when the stale-work guard is desired.

Keep `N8N_JIRA_AUTOMATION_ENABLED=false` until the provider activation gate below is complete.

## n8n import and provider binding

Import `automation/n8n/jira-work-automation.workflow.json` into the intended n8n project. It must remain inactive while credentials and provider identity are being bound.

Bind these provider-side values without committing them to this repository:

1. **Inbound FCR header-auth credential** on `Inbound FCR Jira Plan`.
   - Header name: `Authorization`.
   - Header value: `Bearer <same secret installed as FCR N8N_JIRA_AUTOMATION_BEARER_TOKEN>`.
2. **Jira Software Cloud credential** on both `Re-read Jira Issue` and `Apply Bounded Jira Mutation`.
   - Both nodes must use the same Jira tenant/account authority.
3. **n8n runtime `JIRA_BASE_URL`**.
   - Exact tenant origin only, for example `https://your-site.atlassian.net`.
   - Do not include a path, username, password, token, query string, or fragment.

The artifact intentionally contains credential stubs only. Importing the JSON therefore cannot create Jira authority by itself.

## Provider execution order

The checked-in workflow is intentionally linear:

1. authenticated webhook ingress;
2. validate contract, idempotency header, exact runtime SHA, issue identity, exactly-one-action rule, allowed action, and authority ceiling;
3. independently compute the expected plan-bound receipt ID;
4. re-read the exact Jira issue fields `status`, `assignee`, and `updated`;
5. refuse status/assignee/timestamp drift and re-check stale age;
6. expand exactly one `assign-owner` **or** `comment-stale` action into a Jira REST request;
7. execute that single bounded request using the Jira credential;
8. require exactly one successful mutation result;
9. return the exact receipt to FCR.

The workflow contains no Jira transition endpoint, DELETE request, project-settings endpoint, arbitrary caller-supplied URL, or caller-supplied HTTP method outside the two validated action expansions.

## Activation proof gate

Do not activate this lane from source green alone.

Required sequence:

1. import the exact checked-in workflow artifact;
2. bind the inbound header-auth and Jira credentials;
3. set the exact Jira base URL;
4. keep FCR `N8N_JIRA_AUTOMATION_ENABLED=false`;
5. execute a controlled non-production probe against one known test issue or otherwise isolated Jira work item;
6. verify the n8n execution re-read the intended issue, performed only the expected bounded mutation, and returned the exact FCR receipt;
7. read the Jira issue back independently and confirm the intended state;
8. bind that provider proof to the exact deployed FCR `GIT_SHA` and workflow artifact version;
9. only then activate the n8n workflow and set FCR `N8N_JIRA_AUTOMATION_ENABLED=true`.

If the Jira/Atlassian connection is unavailable, provider activation remains `BLOCKED`; repository source green must not be promoted into a live-provider claim.

## Rollback

Fastest runtime rollback is `N8N_JIRA_AUTOMATION_ENABLED=false`, followed by deactivating the n8n workflow if necessary. Source rollback is reverting this focused Jira automation slice. No Jira project/workflow schema change is required by this implementation.
