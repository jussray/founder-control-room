---
name: control-room-incident-triage
version: 1.0.0
status: active
scope: founder-control-room
owner: Juss
review_cadence: quarterly
---

# Control Room Incident Triage

## Trigger

Use when a build, test, deployment, provider workflow, integration, automation, route, or runtime path fails or behaves inconsistently.

## Purpose

Classify the failure before patching, separate product defects from infrastructure noise, preserve evidence, and choose the smallest safe recovery path.

## Operating sequence

```text
ULTRATHINK
→ REDTEAM I: challenge the initial diagnosis
→ LINDYMODE: prefer durable recovery over brittle bypasses
→ /futureyou: choose the repair that reduces repeat incidents
→ REDTEAM II: attack the selected fix
→ OODA: execute, observe, and loop
```

## First classification

Choose exactly one primary class before editing:

- `runner_startup_failure`
- `workflow_no_jobs`
- `workflow_step_failure`
- `provider_auth_failure`
- `provider_rate_or_quota_failure`
- `configuration_drift`
- `binding_or_environment_mismatch`
- `deployment_or_route_failure`
- `runtime_behavior_failure`
- `observability_gap`
- `unknown_pending_evidence`

## Required evidence

Capture:

```text
Repository:
Branch:
Exact SHA:
Environment:
Workflow/run/job:
First meaningful failing step:
Exact error:
Provider/build/deployment ID:
Logs or artifacts available:
Last known good state:
Blast radius:
Rollback path:
```

## Root-cause discipline

- Rank no more than three likely causes.
- Identify the evidence that would disprove each cause.
- The selected repair must fix the earliest causal break, not the loudest downstream symptom.
- Preserve the original failure artifact before reruns or edits.
- Do not treat a rerun that happens to pass as proof the cause is fixed.

## Lindy recovery screen

Prefer repairs that:

- restore a documented provider contract;
- reduce duplicate runners, adapters, config surfaces, or hidden state;
- keep rollback obvious;
- improve future observability;
- avoid new credentials, providers, or workflows unless necessary;
- remain portable across agents and repositories.

## FutureYou pass

Ask:

- Will this fix make the next ten incidents easier to diagnose?
- Can the evidence be consumed by Founder Control Room automatically later?
- Does this create a reusable contract instead of another one-off patch?
- What should remain manual until the recovery path succeeds repeatedly?

## Forbidden recovery tactics

- disabling checks without replacing their proof;
- swallowing exceptions or returning false success;
- deleting tests to make CI green;
- force-pushing over evidence;
- changing production, DNS, auth, billing, or credentials without explicit approval;
- blaming code when no meaningful job step executed;
- calling an incident resolved without exact-head and runtime evidence appropriate to the failure.

## Output

```text
REALITY:
CLASSIFICATION:
LIKELY CAUSES:
DISPROOF TESTS:
SELECTED FIX:
PROOF:
RESIDUAL RISK:
ROLLBACK:
FUTURE HARDENING:
NEXT GATE:
```

## Definition of done

The incident is resolved only when the original failing path is re-executed on the intended version, the result is evidenced, rollback is known, and the preventive follow-up is recorded without overstating production truth.
