# Jira work automation

## Status

This repository now owns the FCR-side contract for two bounded Jira work-management automations. The provider execution path is n8n. Jira/Atlassian credentials remain outside FCR source.

The bridge is **disabled by default** and does not prove that Jira or n8n is currently connected.

## Flow 1: In Progress ownership gate

When an observed Jira work item is in `In Progress` with no assignee, FCR may propose exactly one Jira mutation through the configured n8n bridge:

- assign the issue to the exact Jira account ID configured for logical owner `sekretbip`.

FCR does not guess the Jira account ID from the label `sekretbip`. The exact mapping is required at runtime.

## Flow 2: stale-work guard

On a scheduled scan, when an `In Progress` work item has not been updated for at least the configured number of hours, FCR may propose exactly one additional Jira mutation:

- add the deterministic stale-work status comment.

The stale threshold is configuration, not hidden source policy. If no positive threshold is configured, the stale-comment action does not open.

## Authority ceiling

The v1 contract may only request:

- issue assignment;
- issue comment.

It explicitly does **not** authorize issue transition, issue close, issue deletion, Jira project-setting mutation, deployment, publication, or repository mutation.

Every dispatched plan is bound to:

- the exact FCR runtime `GIT_SHA`;
- canonical Jira project and issue identity;
- the observed issue status and assignee state;
- observed/update timestamps;
- deterministic action content;
- a plan idempotency key;
- an exact expected n8n receipt ID.

An n8n acknowledgement with any other receipt ID is rejected.

## Runtime configuration

Set these only in the runtime secret/configuration store. Do not commit secret values.

```text
N8N_JIRA_AUTOMATION_ENABLED=false
N8N_JIRA_AUTOMATION_WEBHOOK_URL=
N8N_JIRA_AUTOMATION_BEARER_TOKEN=
JIRA_AUTOMATION_OWNER_ACCOUNT_ID=
JIRA_AUTOMATION_STALE_AFTER_HOURS=
GIT_SHA=<exact deployed FCR commit SHA>
```

`N8N_JIRA_AUTOMATION_WEBHOOK_URL` must be HTTPS. `JIRA_AUTOMATION_OWNER_ACCOUNT_ID` must be the exact Jira account identifier for the intended owner. `JIRA_AUTOMATION_STALE_AFTER_HOURS` must be a positive integer when the stale-work guard is desired.

## Provider boundary

FCR sends the bounded plan to n8n. The n8n workflow is responsible for authenticating to Jira, re-reading the target issue before mutation, refusing state drift, performing only the requested bounded mutation, and returning the exact FCR receipt ID.

Until that provider workflow is configured and live-read back, repository source should be described as **implemented / provider activation unverified**, not as a live Jira automation.

## Rollback

Disable `N8N_JIRA_AUTOMATION_ENABLED` or revert this focused contract. No Jira project/workflow schema change is required by this source slice.
