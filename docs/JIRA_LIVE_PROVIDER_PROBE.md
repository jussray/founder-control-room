# Jira Work Automation Live Provider Probe

This probe exists to close the provider-observability gap for the governed Jira work-automation lane without turning repository proof into Jira authority.

## What the probe proves

A successful manual run proves only that, for the exact protected `main` SHA supplied to the workflow:

1. the trusted workflow checked out that exact current `main` commit;
2. the configured production FCR Jira ingress accepted a fresh authenticated observation for the secret-pinned probe issue;
3. the deployed FCR runtime reported the same exact SHA;
4. the Jira dispatcher reached the configured n8n provider path;
5. n8n returned the canonical plan-bound Jira receipt that FCR independently recomputed and accepted.

The retained artifact is therefore **provider-dispatch proof**, not full end-to-end Jira outcome proof.

## What the probe does not prove

The workflow must emit `endToEndComplete: false` and `independentJiraReadbackRequired: true` even after successful dispatch. A separate Jira readback must verify the expected issue state after the run before the work-automation path may be classified complete.

A green PR, a green workflow, a canonical receipt, or a matching runtime SHA must not substitute for that independent Jira readback.

## Authority ceiling

The workflow is `workflow_dispatch` only, runs only from `refs/heads/main`, and uses the protected `production` environment.

The target issue is not caller-selectable. `JIRA_AUTOMATION_PROBE_ISSUE_KEY` is a production secret and the observation must name that exact issue. The probe accepts only a fresh `transitioned` observation for an **unassigned In Progress** probe issue, which maps to the already-approved assignment-only Jira action. It cannot request transitions, closure, deletion, project-setting mutation, arbitrary comments, arbitrary issue keys, or arbitrary provider URLs.

The ingress URL must be HTTPS and target exactly `/ingest/jira-work-automation` with no query string, fragment, or embedded credentials.

## Required protected configuration

The GitHub `production` environment must provide:

```text
JIRA_AUTOMATION_PROBE_ISSUE_KEY
FCR_JIRA_AUTOMATION_INGRESS_URL
FCR_JIRA_AUTOMATION_INGRESS_TOKEN
```

The deployed FCR runtime still owns its existing Jira bridge configuration:

```text
FCR_JIRA_AUTOMATION_INGRESS_TOKEN
N8N_JIRA_AUTOMATION_ENABLED
N8N_JIRA_AUTOMATION_WEBHOOK_URL
N8N_JIRA_AUTOMATION_BEARER_TOKEN
JIRA_AUTOMATION_OWNER_ACCOUNT_ID
GIT_SHA
```

No secret value belongs in source, workflow inputs, retained artifacts, PR text, or Jira comments.

## Controlled run procedure

1. Re-read authoritative FCR `main` and use that exact full SHA as `target_sha`.
2. Re-read the secret-pinned Jira probe issue and construct a fresh observation reflecting its exact current status, assignee, and updated timestamp.
3. Provide a concrete approval/test reference in `approval_reference`.
4. Dispatch **Jira Work Automation Live Probe** from `main`.
5. Retain the generated `jira-work-automation-live-probe-<sha>` artifact.
6. Independently re-read the probe issue in Jira.
7. Classify end-to-end success only if the Jira state matches the expected bounded assignment and the exact dispatch receipt/runtime proof remains valid.

If any SHA, issue state, provider configuration, or observation freshness changes, reacquire evidence instead of reusing predecessor proof.
